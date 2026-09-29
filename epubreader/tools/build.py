# -*- coding: utf-8 -*-
"""
构建脚本：把 src/ 合成单文件 web/reader.html
--------------------------------------------------
占位符：/*__CSS__*/  /*__JSZIP__*/  /*__JS__*/
产物 reader.html 完全自包含（内联 JSZip），手机浏览器可直接打开，
不依赖任何网络资源。
"""

import os
import re
import sys
import io

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "src")
WEB = os.path.join(ROOT, "web")
DIST = os.path.join(ROOT, "dist")
LIBS = [
    os.path.join(WEB, "lib", "jszip.min.js"),
    os.path.join(SRC, "vendor", "jszip.min.js"),
]


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def find_lib():
    for p in LIBS:
        if os.path.exists(p):
            return p
    return None


def main():
    tpl = read(os.path.join(SRC, "index.html"))
    css = read(os.path.join(SRC, "reader.css"))
    js = read(os.path.join(SRC, "reader.js"))

    lib = find_lib()
    if lib is None:
        print("!! 找不到 jszip.min.js（放 web/lib/ 下）", file=sys.stderr)
        return 1
    jszip = read(lib)

    for holder, payload in (("/*__CSS__*/", css), ("/*__JSZIP__*/", jszip), ("/*__JS__*/", js)):
        if holder not in tpl:
            print("!! 模板缺少占位符:", holder, file=sys.stderr)
            return 1
        tpl = tpl.replace(holder, payload, 1)

    if not os.path.isdir(DIST):
        os.makedirs(DIST)
    out = os.path.join(DIST, "reader.html")
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(tpl)

    # 同时输出一份"未内联库"的版本，给安卓 assets 用（那边按文件拆开更省内存）
    out2 = os.path.join(WEB, "reader.html")
    with io.open(out2, "w", encoding="utf-8", newline="\n") as f:
        f.write(tpl)

    size = os.path.getsize(out)
    print("构建完成")
    print("  dist/reader.html   %.1f KB  (单文件，含内联 JSZip %d KB)" % (size / 1024.0, len(jszip) // 1024))
    print("  web/reader.html    同上（同一份内容）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
