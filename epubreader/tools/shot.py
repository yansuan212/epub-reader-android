# -*- coding: utf-8 -*-
"""
用 Edge 无头模式 + CDP 精确控制截图。
不弹窗、不抢焦点（headless）。用于验证 EPUB 阅读器实际渲染效果。

用法:
  python tools/shot.py <页面URL> <输出png> [等待条件JS] [超时秒] [宽] [高]
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import websocket  # websocket-client

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROFILE = r"C:\Users\yansuan\AppData\Local\Temp\edge_cdp_profile"
PORT = 9333


def http_json(path):
    with urllib.request.urlopen("http://127.0.0.1:%d%s" % (PORT, path), timeout=5) as r:
        return json.loads(r.read().decode("utf-8"))


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30, max_size=200 * 1024 * 1024)
        self.i = 0

    def send(self, method, params=None, timeout=30):
        self.i += 1
        mid = self.i
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        self.ws.settimeout(timeout)
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, msg["error"]))
                return msg.get("result", {})

    def eval(self, expr, timeout=30):
        r = self.send("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": True
        }, timeout=timeout)
        return r.get("result", {}).get("value")

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def launch(width, height):
    if os.path.isdir(PROFILE):
        import shutil
        try:
            shutil.rmtree(PROFILE, ignore_errors=True)
        except Exception:
            pass
    args = [
        EDGE,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        "--disable-extensions",
        "--no-first-run",
        "--disable-features=Translate,msEdgeIdentity",
        "--remote-debugging-port=%d" % PORT,
        "--remote-allow-origins=*",
        "--user-data-dir=" + PROFILE,
        "--window-size=%d,%d" % (width, height),
        "about:blank",
    ]
    p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # 等 devtools 就绪
    for _ in range(60):
        try:
            http_json("/json/version")
            return p
        except Exception:
            time.sleep(0.3)
    raise RuntimeError("Edge devtools 未就绪")


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 2
    url = args[0]
    out = args[1]
    cond = args[2] if len(args) > 2 else "window.__DONE__ === true"
    timeout = float(args[3]) if len(args) > 3 else 40.0
    width = int(args[4]) if len(args) > 4 else 420
    height = int(args[5]) if len(args) > 5 else 860

    proc = launch(width, height)
    try:
        tabs = http_json("/json")
        page = None
        for t in tabs:
            if t.get("type") == "page":
                page = t
                break
        if not page:
            raise RuntimeError("没有可用 page target")

        c = CDP(page["webSocketDebuggerUrl"])
        try:
            c.send("Page.enable")
            c.send("Runtime.enable")
            # 收集 JS 报错
            c.send("Log.enable")
            c.send("Page.navigate", {"url": url})

            # 等加载
            t0 = time.time()
            while time.time() - t0 < 15:
                try:
                    if c.eval("document.readyState", timeout=5) == "complete":
                        break
                except Exception:
                    pass
                time.sleep(0.2)

            # 等业务条件
            t0 = time.time()
            ok = False
            err = None
            while time.time() - t0 < timeout:
                try:
                    err = c.eval("window.__ERR__ || null", timeout=5)
                    if c.eval("!!(%s)" % cond, timeout=5):
                        ok = True
                        break
                except Exception as e:
                    pass
                time.sleep(0.4)
            print("条件满足=%s  耗时=%.1fs  页面错误=%s" % (ok, time.time() - t0, err))

            # 截图（全页）
            m = c.send("Page.getLayoutMetrics")
            css = m.get("cssContentSize") or m.get("contentSize") or {}
            full_w = int(css.get("width", width))
            full_h = int(css.get("height", height))
            real_h = min(full_h, 20000)  # 防止超大
            c.send("Emulation.setDeviceMetricsOverride", {
                "width": full_w, "height": real_h, "deviceScaleFactor": 1, "mobile": False
            })
            time.sleep(0.6)
            res = c.send("Page.captureScreenshot", {
                "format": "png", "captureBeyondViewport": True, "fromSurface": True
            }, timeout=60)
            data = base64.b64decode(res["data"])
            with open(out, "wb") as f:
                f.write(data)
            print("已保存 %s  (%d 字节, 页面 %dx%d)" % (out, len(data), full_w, full_h))

            # 附加：打印关键 DOM 指标
            info = c.eval("""(function(){
              var b = document.getElementById('book');
              var secs = b ? b.querySelectorAll('section.chapter') : [];
              var lens = [].map.call(secs, function(s){
                return s.getAttribute('data-si') + ':' + (s.textContent||'').replace(/\\s/g,'').length;
              });
              return JSON.stringify({
                emptyHidden: document.getElementById('empty') ? document.getElementById('empty').hidden : null,
                bookHidden: b ? b.hidden : null,
                sections: secs.length, lens: lens.slice(0,6),
                title: (document.querySelector('#book .chapter')||{}).textContent ? '' : ''
              });
            })()""")
            print("DOM:", info)
        finally:
            c.close()
    finally:
        try:
            proc.terminate()
        except Exception:
            pass
        time.sleep(0.5)
    return 0


if __name__ == "__main__":
    sys.exit(main())
