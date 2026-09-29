# -*- coding: utf-8 -*-
"""
本地起一个 HTTP 服务，方便在电脑 / 手机上试用阅读器。
（file:// 下 Chrome 会禁用 IndexedDB，书架存不住；走 http:// 就没这个问题。）

用法：
    python tools/serve.py                  # http://127.0.0.1:8777/  仅本机可访问
    python tools/serve.py 9000             # 换端口
    python tools/serve.py --lan            # 绑 0.0.0.0，手机可用局域网 IP 访问
    python tools/serve.py --lan 9000       # 两者一起

--lan 模式会打印出手机该访问的地址。同一个 WiFi 下手机浏览器直接打开即可：
改完代码 -> 重建 -> 手机上刷新，不用打包也不用装 APK。
第一次运行 Windows 防火墙会弹窗，选「允许访问」。

按 Ctrl+C 停止。
"""

import http.server
import os
import socket
import socketserver
import sys
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.abspath(os.path.join(HERE, "..", "web"))

LAN = "--lan" in sys.argv
_args = [a for a in sys.argv[1:] if a != "--lan"]
PORT = int(_args[0]) if _args else 8777
BIND = "0.0.0.0" if LAN else "127.0.0.1"


def lan_ips():
    """列出本机可被手机访问的 IPv4 地址"""
    out = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in out:
                out.append(ip)
    except Exception:
        pass
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    def end_headers(self):
        # 开发期不要缓存，改完刷新就能看到
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def main():
    if not os.path.isdir(WEB):
        print("!! 找不到目录：" + WEB)
        return 1

    line = "=" * 62
    print(line)
    print(" EPUB 阅读器 — 本地服务")
    print(line)
    print(" 目录 : " + WEB)
    print(" 电脑 : http://127.0.0.1:%d/reader.html" % PORT)
    if LAN:
        ips = lan_ips()
        if ips:
            for ip in ips:
                print(" 手机 : http://%s:%d/reader.html" % (ip, PORT))
        else:
            print(" 手机 : 取不到局域网 IP，用 ipconfig 自己看一眼")
        print("")
        print(" 提示 : 手机需与电脑在同一个 WiFi；首次运行防火墙放行一下。")
        print("        改完代码先跑 tools/build.py 重建，再在手机上刷新。")
    else:
        print("")
        print(" 提示 : 想让手机也能访问，加 --lan 参数。")
    print(" 停止 : Ctrl+C")
    print(line)

    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer((BIND, PORT), Handler) as httpd:
            try:
                webbrowser.open("http://127.0.0.1:%d/reader.html" % PORT)
            except Exception:
                pass
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n已停止。")
    except OSError as e:
        print("")
        print("!! 起不来：%s" % e)
        if getattr(e, "errno", None) in (48, 98, 10048):
            print("   端口 %d 可能被占用了，换一个：python tools/serve.py %d"
                  % (PORT, PORT + 1))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
