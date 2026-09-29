# -*- coding: utf-8 -*-
"""
生成应用图标（mipmap-*dpi/ic_launcher.png）
纯标准库实现：自己画 + 自己编码 PNG，不依赖 Pillow。
4 倍超采样后降采样，边缘不会毛糙。
"""

import io
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.abspath(os.path.join(HERE, "..", "res"))

# 每个 dpi 目录对应的图标边长（px）
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

BG = (122, 100, 72)      # 与阅读器护眼纸色主题的强调色同族
PAGE = (250, 245, 232)
LINE = (198, 186, 164)
RIB = (176, 78, 62)      # 书签带

SS = 4                   # 超采样倍数


def png_bytes(w, h, rgba):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)    # filter type 0
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def draw(size):
    """在 size*SS 的画布上绘制，再降采样到 size。"""
    W = size * SS
    buf = bytearray(W * W * 4)          # 全透明

    def put(x, y, c, a=255):
        if 0 <= x < W and 0 <= y < W:
            i = (y * W + x) * 4
            if a >= 255:
                buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255
            else:                        # 简易 alpha 混合（仅在底色上）
                k = a / 255.0
                buf[i] = int(buf[i] * (1 - k) + c[0] * k)
                buf[i + 1] = int(buf[i + 1] * (1 - k) + c[1] * k)
                buf[i + 2] = int(buf[i + 2] * (1 - k) + c[2] * k)
                buf[i + 3] = max(buf[i + 3], a)

    def rrect(x0, y0, x1, y1, r, c):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                dx = 0
                dy = 0
                if x < x0 + r:
                    dx = x0 + r - x
                elif x > x1 - 1 - r:
                    dx = x - (x1 - 1 - r)
                if y < y0 + r:
                    dy = y0 + r - y
                elif y > y1 - 1 - r:
                    dy = y - (y1 - 1 - r)
                if dx * dx + dy * dy <= r * r:
                    put(x, y, c)

    def rect(x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                put(x, y, c)

    # 圆角方形底
    m = W * 0.045
    rrect(m, m, W - m, W - m, W * 0.235, BG)

    # 摊开的书：左右两页
    px0, px1 = W * 0.175, W * 0.825
    py0, py1 = W * 0.265, W * 0.775
    rect(px0, py0, (px0 + px1) / 2.0, py1, PAGE)
    rect((px0 + px1) / 2.0, py0, px1, py1, PAGE)
    # 中缝
    rect(W * 0.487, py0, W * 0.513, py1, LINE)
    # 书页上的文字行
    for i in range(3):
        yy = py0 + W * (0.075 + i * 0.105)
        rect(px0 + W * 0.055, yy, W * 0.44, yy + W * 0.028, LINE)
        rect(W * 0.56, yy, px1 - W * 0.055, yy + W * 0.028, LINE)

    # 书签带（压在书页上方，底部剪出 V 形缺口）
    rx0, rx1 = W * 0.60, W * 0.715
    ry0, ry1 = py0 - W * 0.085, py0 + W * 0.175
    for y in range(int(ry0), int(ry1)):
        t = (y - ry0) / max(1.0, (ry1 - ry0))
        shrink = W * 0.075 * max(0.0, (t - 0.62) / 0.38)   # 下方收成尖角
        rect(rx0 + shrink, y, rx1 - shrink, y + 1, RIB)

    # 降采样
    out = bytearray(size * size * 4)
    n = SS * SS
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                base = ((y * SS + sy) * W + x * SS) * 4
                for sx in range(SS):
                    i = base + sx * 4
                    av = buf[i + 3]
                    r += buf[i] * av
                    g += buf[i + 1] * av
                    b += buf[i + 2] * av
                    a += av
            o = (y * size + x) * 4
            if a:
                out[o] = min(255, r // a)
                out[o + 1] = min(255, g // a)
                out[o + 2] = min(255, b // a)
            out[o + 3] = a // n
    return bytes(out)


def main():
    made = []
    for folder, size in SIZES.items():
        d = os.path.join(RES, folder)
        if not os.path.isdir(d):
            os.makedirs(d)
        p = os.path.join(d, "ic_launcher.png")
        with open(p, "wb") as f:
            f.write(png_bytes(size, size, draw(size)))
        made.append("%s  %dx%d  %d B" % (folder, size, size, os.path.getsize(p)))
    print("图标已生成：")
    for m in made:
        print("  " + m)
    return 0


if __name__ == "__main__":
    sys.exit(main())
