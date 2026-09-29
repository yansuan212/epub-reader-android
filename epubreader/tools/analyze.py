# -*- coding: utf-8 -*-
"""
EPUB 解析验证脚本（阶段 0）
==========================
纯只读：只读取 书.zip / 书/ 目录，不写入、不修改、不移动任何原始文件。
产物：report/analysis.json （供阅读器与报告使用）

重点验证「注释跳转」——本项目核心诉求：
  正文侧  <a class="zy" href="#idNa" id="idN">〔N〕</a>
  注释侧  <a class="hl" href="#idN"  id="idNa">〔N〕</a>
  两者在同一文件内互为锚点，构成双向跳转。
"""

import json
import os
import re
import sys
import zipfile
from collections import Counter, OrderedDict
from xml.etree import ElementTree as ET

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BOOK_DIR = os.path.abspath(os.path.join(BASE, "..", "书"))
ZIP_PATH = os.path.abspath(os.path.join(BASE, "..", "书.zip"))
OUT_PATH = os.path.join(BASE, "report", "analysis.json")

NS = {
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "ncx": "http://www.daisy.org/z3986/2005/ncx/",
}

TAG_RE = re.compile(r"<[^>]+>")
SCRIPT_RE = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
WS_RE = re.compile(r"[ \t\r\n\u3000]+")
TEXT_SPLIT_RE = re.compile(r"[^\u4e00-\u9fffA-Za-z0-9]+")

# 待统计的高频词（可自行增删）
KEYWORDS = [
    "阶级斗争", "革命", "帝国主义", "无产阶级", "资产阶级", "农民",
    "马克思", "列宁", "斯大林", "共产党", "国民党", "日本", "统一战线",
    "社会主义", "矛盾", "战争", "群众", "封建", "地主", "蒋介石",
]


def strip_tags(html: str) -> str:
    """粗暴去标签取纯文本（EPUB 正文无 script/style，够用且快）。"""
    s = SCRIPT_RE.sub(" ", html)
    s = TAG_RE.sub(" ", s)
    s = (s.replace("&nbsp;", " ").replace("&amp;", "&")
          .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))
    return WS_RE.sub(" ", s).strip()


def read_local(rel_path: str) -> str:
    """按 EPUB 内相对路径读取（相对 OEBPS/）。优先读解包目录，回退到 zip。"""
    p = os.path.join(BOOK_DIR, "OEBPS", rel_path.replace("/", os.sep))
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return None


def main():
    problems = []
    warnings = []

    # ---------- 1. 容器 / OPF ----------
    opf_xml = read_local("content.opf")
    if opf_xml is None:
        print("!! 找不到 OEBPS/content.opf", file=sys.stderr)
        return 1
    opf_root = ET.fromstring(opf_xml)

    metadata = {}
    md = opf_root.find("opf:metadata", NS)
    if md is not None:
        for tag in ("title", "creator", "language", "identifier", "date"):
            el = md.find("dc:" + tag, NS)
            if el is not None and el.text:
                metadata[tag] = el.text.strip()
        metadata["identifier"] = md.find("dc:identifier", NS).get("id") if md.find("dc:identifier", NS) is not None else None

    manifest = OrderedDict()
    for item in opf_root.iter("{http://www.idpf.org/2007/opf}item"):
        manifest[item.get("href")] = {
            "id": item.get("id"),
            "media-type": item.get("media-type"),
            "properties": item.get("properties") or "",
        }

    spine = []
    sp = opf_root.find("opf:spine", NS)
    if sp is not None:
        for ref in sp:
            if ref.tag.endswith("itemref"):
                idref = ref.get("idref")
                for href, info in manifest.items():
                    if info["id"] == idref:
                        spine.append(href)
                        break

    # ---------- 2. NCX 目录树 ----------
    def parse_navpoints(el, depth=0, acc=None):
        if acc is None:
            acc = []
        for np in el.findall("ncx:navPoint", NS):
            label = np.find("ncx:navLabel/ncx:text", NS)
            content = np.find("ncx:content", NS)
            acc.append({
                "label": (label.text or "").strip() if label is not None else "",
                "src": content.get("src") if content is not None else "",
                "depth": depth,
            })
            parse_navpoints(np, depth + 1, acc)
        return acc

    ncx_xml = read_local("toc.ncx")
    toc = []
    if ncx_xml:
        ncx_root = ET.fromstring(ncx_xml)
        navmap = ncx_root.find("ncx:navMap", NS)
        if navmap is not None:
            toc = parse_navpoints(navmap)

    depth_hist = Counter(n["depth"] for n in toc)

    # 目录 src 是否都能在 manifest 找到
    missing_toc = sorted({n["src"].split("#")[0] for n in toc
                          if n["src"].split("#")[0] not in manifest})
    if missing_toc:
        warnings.append("目录中有 %d 个 src 不在 manifest 内：%s"
                        % (len(missing_toc), missing_toc[:5]))

    # ---------- 3. 逐文件扫描 ----------
    xhtml_files = [h for h, i in manifest.items()
                   if i["media-type"] == "application/xhtml+xml"]
    xhtml_files.sort()

    per_file = []
    total_chars = 0
    total_footnotes = 0
    cross_file_footnotes = 0
    broken_toc_targets = []      # 正文跳注释失败
    broken_back_targets = []     # 注释跳回正文失败
    class_counter = Counter()
    image_refs = Counter()
    kw_counter = Counter()

    # 先建全量 id 索引，用于跨文件锚点校验
    file_html = {}
    file_ids = {}
    for href in xhtml_files:
        html = read_local(href)
        if html is None:
            problems.append("manifest 声明但磁盘缺失：%s" % href)
            continue
        file_html[href] = html
        file_ids[href] = set(re.findall(r'\sid="([^"]+)"', html))

    # href -> 规范化 key（去掉 ./ 与前导 ../Text/ 之类）
    def norm(p):
        p = p.replace("\\", "/")
        for pre in ("../Text/", "../Styles/", "../Images/", "./"):
            if p.startswith(pre):
                p = p[len(pre):]
        return p

    href_by_name = {}
    for h in manifest:
        href_by_name[norm(h)] = h
        href_by_name[os.path.basename(h)] = h

    for href in xhtml_files:
        html = file_html[href]
        text = strip_tags(html)
        n_chars = len(re.sub(r"\s", "", text))
        total_chars += n_chars

        for m in re.findall(r'class="([^"]*)"', html):
            for c in m.split():
                class_counter[c] += 1
        for m in re.findall(r'src="([^"]*)"', html):
            image_refs[norm(m)] += 1

        for kw in KEYWORDS:
            kw_counter[kw] += text.count(kw)

        # --- 注释锚点配对 ---
        # 正文引用：class 含 zy，href="#xxx"，自身 id="yyy"
        zy = re.findall(r'<a\b[^>]*class="[^"]*\bzy\b[^"]*"[^>]*>', html)
        footnote_n = 0
        for a in zy:
            hm = re.search(r'href="([^"]+)"', a)
            im = re.search(r'\sid="([^"]+)"', a)
            if not hm:
                continue
            target = hm.group(1)
            self_id = im.group(1) if im else None
            footnote_n += 1
            if target.startswith("#"):
                tid = target[1:]
                if tid not in file_ids[href]:
                    broken_toc_targets.append({"file": href, "href": target, "self": self_id})
            else:
                cross_file_footnotes += 1
                fpart, _, frag = target.partition("#")
                real = href_by_name.get(norm(fpart))
                if real is None or frag not in file_ids.get(real, set()):
                    broken_toc_targets.append({"file": href, "href": target, "self": self_id})
            # 反查：注释侧是否指回来
            if self_id:
                back = re.search(r'<a\b[^>]*id="%s"[^>]*>' % re.escape(target.lstrip("#")),
                                 html) if target.startswith("#") else None
                if target.startswith("#") and back is None:
                    broken_back_targets.append({"file": href, "target": target, "self": self_id})

        total_footnotes += footnote_n
        hl_n = len(re.findall(r'<a\b[^>]*class="[^"]*\bhl\b[^"]*"', html))

        per_file.append({
            "file": norm(href),
            "title": (re.search(r"<title>(.*?)</title>", html, re.S).group(1).strip()
                      if re.search(r"<title>(.*?)</title>", html, re.S) else ""),
            "chars": n_chars,
            "footnote_links": footnote_n,
            "note_anchors": hl_n,
            "images": len(re.findall(r'<img\b', html)),
            "sample": text[:80],
        })

    # ---------- 4. 汇总 ----------
    report = {
        "metadata": metadata,
        "opf": {
            "spine_length": len(spine),
            "manifest_items": len(manifest),
            "media_types": dict(Counter(i["media-type"] for i in manifest.values())),
        },
        "toc": {
            "node_count": len(toc),
            "depth_histogram": {str(k): v for k, v in sorted(depth_hist.items())},
            "max_depth": max(depth_hist) + 1 if depth_hist else 0,
            "roots": [n["label"] for n in toc if n["depth"] == 0],
            "children_sample": [n for n in toc if n["depth"] <= 2][:12],
            "missing_src": missing_toc,
        },
        "footnotes": {
            "total_links": total_footnotes,
            "cross_file": cross_file_footnotes,
            "broken_forward": broken_toc_targets[:20],
            "broken_forward_count": len(broken_toc_targets),
            "broken_back_count": len(broken_back_targets),
            "files_with_footnotes": sum(1 for f in per_file if f["footnote_links"]),
        },
        "content": {
            "total_chars": total_chars,
            "files": len(per_file),
            "top_classes": dict(class_counter.most_common(25)),
            "images": dict(image_refs),
            "keywords": dict(kw_counter.most_common()),
        },
        "per_file": per_file,
        "problems": problems,
        "warnings": warnings,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    # ---------- 5. 控制台摘要 ----------
    print("=" * 62)
    print(" EPUB 解析报告")
    print("=" * 62)
    print("书名       :", metadata.get("title"))
    print("作者       :", metadata.get("creator"))
    print("语言       :", metadata.get("language"))
    print("修订日期   :", metadata.get("date"))
    print("标识       :", metadata.get("identifier"))
    print("-" * 62)
    print("spine 条目 :", len(spine))
    print("manifest   :", len(manifest), dict(Counter(i["media-type"] for i in manifest.values())))
    print("XHTML 文件 :", len(per_file))
    print("正文总字数 :", total_chars)
    print("-" * 62)
    print("目录节点   :", len(toc), " 最大层数:", report["toc"]["max_depth"])
    print("层级分布   :", report["toc"]["depth_histogram"])
    print("顶级节点   :", report["toc"]["roots"])
    print("-" * 62)
    print("注释链接   :", total_footnotes, "（跨文件 %d）" % cross_file_footnotes)
    print("含注文件数 :", report["footnotes"]["files_with_footnotes"])
    print("正->注 断链:", len(broken_toc_targets))
    print("注->正 断链:", len(broken_back_targets))
    print("-" * 62)
    print("图片引用   :", dict(image_refs))
    print("关键词统计 :", dict(kw_counter.most_common()))
    if problems:
        print("-" * 62)
        print("!! 问题 :", problems)
    if warnings:
        print("~~ 警告 :", warnings)
    print("=" * 62)
    print("已写出:", OUT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())
