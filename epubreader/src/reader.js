/* ============================================================
   EPUB 阅读器内核  v1.0
   ------------------------------------------------------------
   设计要点
   1) 解析 + 排版 + 注释 + 搜索 全部与平台无关，安卓壳只做文件投喂。
   2) 章节懒渲染：同时在 DOM 里最多 3 章，其余按滚动方向动态增删，
      416 章 / 186 万字也不会卡。
   3) 注释是本项目核心：正文角标 -> 底部弹窗，绝不跳走、不丢阅读位置。
      原书有 7 处注释条目本身缺失，弹窗会明确提示"原书此处无注释"。
   ============================================================ */
(function () {
'use strict';

/* ============================================================
   0. 多语言
   ============================================================ */
var I18N = {
  'zh-CN': {
    app: 'EpubReader', shelf: '我的书架', emptyTitle: '导入一本 EPUB',
    emptyDesc: '支持标准 EPUB 2 / EPUB 3 电子书。<br>书会保存在本机，下次打开直接进入书架。',
    emptyBtn: '选择文件', emptyHint: '也可以把 .epub 文件直接拖到窗口里',
    tabToc: '目录', tabSearch: '搜索', tabMarks: '书签', tabNotes: '笔记', tabSet: '设置',
    import: '导入', cancel: '取消', ok: '确定', del: '删除', close: '关闭', back: '返回',
    qPh: '全书搜索…', go: '查',
    statHits: '命中 <b>{n}</b> 处，分布在 {m} 章', statNone: '没有找到「{q}」',
    statIndexing: '正在建立全文索引… {p}%',
    quick: '常用词频',
    noToc: '这本书没有目录信息', noMark: '还没有书签。点顶栏的书签图标即可标记当前位置。',
    noNote: '还没有笔记。选中文字后可以高亮或写笔记。',
    setTheme: '主题', themeNight: '夜间', themePaper: '护眼纸色',
    setFont: '正文字体', setSize: '字号', setLh: '行距', setPad: '页边距',
    setNote: '章末注释区', noteFold: '折叠', noteShow: '显示', noteHide: '隐藏',
    setLang: '界面语言',
    fontSystem: '系统默认', fontSerif: '系统宋体', fontSans: '系统黑体',
    fontFang: '系统仿宋', fontKai: '系统楷体',
    fontSySong: '思源宋体（开源）', fontSyHei: '思源黑体（开源）', fontLxwk: '霞鹜文楷（开源）',
    fontTip: '开源字体需字体文件在 fonts/ 目录，缺失时自动回落到系统字体。',
    dataZone: '数据', clearProgress: '重设本书进度', clearAll: '清空全部数据',
    clearAllAsk: '这会删除书架、进度、书签和笔记，且不可恢复。确定吗？',
    cleared: '已清空', progReset: '进度已重设',
    noteTag: '注释', noteMulti: '共 {n} 条', noteMissing: '原书此处没有对应的注释条目。',
    noteMissingSub: '正文引用了〔{n}〕，但注释区中没有这一条 —— 这是原书本身的遗漏，不是阅读器的问题。',
    npContext: '正文原处：',
    markAdd: '已加书签', markDel: '书签已删除', markExists: '这里已经有书签了',
    hlNote: '笔记', hlCopy: '复制', hlHi: '高亮', hlCancel: '取消',
    noteTitle: '为这段文字写笔记', notePh: '写点什么…', noteSaved: '笔记已保存',
    copied: '已复制', copyFail: '复制失败，请长按选择',
    saved: '已保存', imported: '已导入：', importFail: '这本书打不开：',
    loading: '正在解析…', loadFail: '解析失败', notEpub: '这不是有效的 EPUB 文件',
    chOf: '第 {i} / {n} 章', loadingMore: '加载中…',
    tocCur: '当前位置', tocGo: '跳转',
    fragMiss: '章节定位失败', langName: '简体中文',
    fixedTip: '固定版式（漫画 / 绘本）按左右滑动翻页',
    pageOf: '{i} / {n} 页',
    noStore: '（当前环境不允许本地存档：书不会进书架，但阅读、注释、搜索全部可用。装 APK 版即可永久保存。）',
  },
  en: {
    app: 'EpubReader', shelf: 'Library', emptyTitle: 'Import an EPUB',
    emptyDesc: 'Supports standard EPUB 2 / EPUB 3 books.<br>Books are kept on this device and reopen from the shelf.',
    emptyBtn: 'Choose file', emptyHint: 'You can also drag an .epub file into the window',
    tabToc: 'Contents', tabSearch: 'Search', tabMarks: 'Marks', tabNotes: 'Notes', tabSet: 'Settings',
    import: 'Import', cancel: 'Cancel', ok: 'OK', del: 'Delete', close: 'Close', back: 'Back',
    qPh: 'Search whole book…', go: 'Go',
    statHits: '<b>{n}</b> matches in {m} chapters', statNone: 'No match for “{q}”',
    statIndexing: 'Building full-text index… {p}%',
    quick: 'Word frequency',
    noToc: 'This book has no table of contents', noMark: 'No marks yet. Tap the bookmark icon to mark this spot.',
    noNote: 'No notes yet. Select text to highlight or annotate.',
    setTheme: 'Theme', themeNight: 'Night', themePaper: 'Paper',
    setFont: 'Body font', setSize: 'Font size', setLh: 'Line height', setPad: 'Margins',
    setNote: 'End-of-chapter notes', noteFold: 'Collapse', noteShow: 'Show', noteHide: 'Hide',
    setLang: 'Language',
    fontSystem: 'System default', fontSerif: 'System serif', fontSans: 'System sans',
    fontFang: 'System FangSong', fontKai: 'System KaiTi',
    fontSySong: 'Noto Serif SC (open)', fontSyHei: 'Noto Sans SC (open)', fontLxwk: 'LXGW WenKai (open)',
    fontTip: 'Open fonts require files in fonts/. Missing ones fall back to system fonts.',
    dataZone: 'Data', clearProgress: 'Reset progress for this book', clearAll: 'Erase all data',
    clearAllAsk: 'This deletes the shelf, progress, marks and notes. It cannot be undone. Continue?',
    cleared: 'Cleared', progReset: 'Progress reset',
    noteTag: 'Note', noteMulti: '{n} entries', noteMissing: 'No matching note exists in the original book.',
    noteMissingSub: 'The text cites [{n}], but the note section has no such entry — an omission in the source book, not a reader issue.',
    npContext: 'Context: ',
    markAdd: 'Bookmarked', markDel: 'Mark removed', markExists: 'Already bookmarked here',
    hlNote: 'Note', hlCopy: 'Copy', hlHi: 'Highlight', hlCancel: 'Cancel',
    noteTitle: 'Note on this passage', notePh: 'Write something…', noteSaved: 'Note saved',
    copied: 'Copied', copyFail: 'Copy failed, long-press to select',
    saved: 'Saved', imported: 'Imported: ', importFail: 'Cannot open this book: ',
    loading: 'Parsing…', loadFail: 'Parse failed', notEpub: 'Not a valid EPUB file',
    chOf: 'Chapter {i} / {n}', loadingMore: 'Loading…',
    tocCur: 'Current position', tocGo: 'Go',
    fragMiss: 'Cannot locate this chapter', langName: 'English',
    fixedTip: 'Fixed layout (comics / picture books): swipe to turn pages',
    pageOf: 'Page {i} / {n}',
    noStore: '(Local storage is unavailable here: books will not persist in the shelf, but reading, notes and search all work. The APK build keeps everything.)',
  }
};
I18N['zh'] = I18N['zh-CN'];
I18N['zh-Hans'] = I18N['zh-CN'];

var LANG = 'zh-CN';
function t(k, vars) {
  var d = I18N[LANG] || I18N['zh-CN'];
  var s = (d[k] !== undefined) ? d[k] : (I18N['zh-CN'][k] !== undefined ? I18N['zh-CN'][k] : k);
  if (vars) for (var p in vars) s = s.split('{' + p + '}').join(vars[p]);
  return s;
}

/* ============================================================
   1. 工具
   ============================================================ */
var $ = function (id) { return document.getElementById(id); };
var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
var PREF = 'wbreader.pref.v1.';
var KEYBOOK = 'wbreader.book.';     // 每本书的进度 / 书签 / 高亮
var DB_NAME = 'wb-reader';
var DB_STORE = 'books';

function prefs(k, v) {           // 全局设置
  try {
    if (v === undefined) { var s = localStorage.getItem(PREF + k); return s === null ? undefined : JSON.parse(s); }
    localStorage.setItem(PREF + k, JSON.stringify(v));
  } catch (e) { }
}
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function debounce(fn, ms) {
  var id; return function () { var a = arguments, self = this; clearTimeout(id); id = setTimeout(function () { fn.apply(self, a); }, ms || 160); };
}
var toastTimer;
function toast(msg, ms) {
  var el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 1900);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* 路径拼接：base 是"文件所在目录"，rel 是相对引用 */
function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
function joinPath(baseDir, rel) {
  if (/^(https?:|data:|blob:)/i.test(rel)) return rel;
  rel = rel.replace(/\\/g, '/');
  var segs = (baseDir + rel).split('/'), out = [];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (s === '' && i > 0) continue;
    if (s === '.') continue;
    if (s === '..') { out.pop(); continue; }
    out.push(s);
  }
  return out.join('/');
}

/* ============================================================
   2. IndexedDB：书架（存 epub 原始字节）
   ============================================================ */
var DB = (function () {
  var p = null;
  function open() {
    if (p) return p;
    p = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () {
        var db = rq.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return p;
  }
  function tx(mode) { return open().then(function (db) { return db.transaction(DB_STORE, mode).objectStore(DB_STORE); }); }
  function wrap(rq) { return new Promise(function (res, rej) { rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); }; }); }
  return {
    put: function (o) { return tx('readwrite').then(function (s) { return wrap(s.put(o)); }); },
    get: function (id) { return tx('readonly').then(function (s) { return wrap(s.get(id)); }); },
    all: function () { return tx('readonly').then(function (s) { return wrap(s.getAll()); }); },
    del: function (id) { return tx('readwrite').then(function (s) { return wrap(s.delete(id)); }); },
    clear: function () { return tx('readwrite').then(function (s) { return wrap(s.clear()); }); }
  };
})();

/* ============================================================
   3. 设置
   ============================================================ */
var FONTS = {
  system: { serif: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif', sans: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif', fang: 'system-ui, sans-serif', kai: 'system-ui, sans-serif' },
  serif: { serif: 'Georgia, "Songti SC", SimSun, "Noto Serif CJK SC", serif', sans: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif', fang: '"FangSong", "STFangsong", Georgia, serif', kai: '"KaiTi", "Kaiti SC", "STKaiti", Georgia, serif' },
  sans: { serif: 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', sans: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif', fang: 'system-ui, sans-serif', kai: '"KaiTi", "Kaiti SC", Georgia, serif' },
  fang: { serif: '"FangSong", "STFangsong", "FangSong_GB2312", Georgia, serif', sans: 'system-ui, sans-serif', fang: '"FangSong", "STFangsong", Georgia, serif', kai: '"KaiTi", "STKaiti", Georgia, serif' },
  kai: { serif: '"KaiTi", "Kaiti SC", "STKaiti", Georgia, serif', sans: 'system-ui, sans-serif', fang: '"FangSong", "STFangsong", Georgia, serif', kai: '"KaiTi", "Kaiti SC", Georgia, serif' },
  sysong: { serif: '"WB-SongTi", "Noto Serif SC", "Source Han Serif SC", Georgia, "Songti SC", SimSun, serif', sans: '"WB-HeiTi", "Noto Sans SC", system-ui, sans-serif', fang: '"WB-SongTi", Georgia, serif', kai: '"WB-KaiTi", "KaiTi", Georgia, serif' },
  syhei: { serif: '"WB-HeiTi", "Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif', sans: '"WB-HeiTi", "Noto Sans SC", system-ui, sans-serif', fang: '"WB-HeiTi", system-ui, sans-serif', kai: '"WB-KaiTi", "KaiTi", Georgia, serif' },
  lxwk: { serif: '"WB-KaiTi", "LXGW WenKai", "KaiTi", Georgia, serif', sans: '"WB-HeiTi", "Noto Sans SC", system-ui, sans-serif', fang: '"WB-KaiTi", "KaiTi", Georgia, serif', kai: '"WB-KaiTi", "LXGW WenKai", "KaiTi", Georgia, serif' }
};
var FONT_KEYS = ['system', 'serif', 'sans', 'fang', 'kai', 'sysong', 'syhei', 'lxwk'];
var FONT_LABEL = { system: 'fontSystem', serif: 'fontSerif', sans: 'fontSans', fang: 'fontFang', kai: 'fontKai', sysong: 'fontSySong', syhei: 'fontSyHei', lxwk: 'fontLxwk' };

var S = {
  lang: prefs('lang') || ((navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : 'en'),
  theme: prefs('theme') || 'paper',
  font: prefs('font') || 'serif',
  size: prefs('size') || 100,        // %
  lh: prefs('lh') || 175,            // %
  pad: prefs('pad') === undefined ? 18 : prefs('pad'),
  noteZone: prefs('noteZone') || 'fold',
  zen: false
};
if (!I18N[S.lang]) S.lang = 'en';
LANG = S.lang;

function applyPrefs() {
  var h = document.documentElement;
  h.setAttribute('data-theme', S.theme);
  h.setAttribute('data-notezone', S.noteZone);
  h.lang = S.lang;
  var mt = $('metaTheme');
  if (mt) mt.setAttribute('content', S.theme === 'night' ? '#0e1116' : '#f4ecd8');
  var f = FONTS[S.font] || FONTS.serif;
  h.style.setProperty('--b-serif', f.serif);
  h.style.setProperty('--b-sans', f.sans);
  h.style.setProperty('--b-fang', f.fang);
  h.style.setProperty('--b-kai', f.kai);
  h.style.setProperty('--b-lh', (S.lh / 100).toFixed(3));
  h.style.setProperty('--pad-x', S.pad + 'px');
  document.title = BOOK ? (BOOK.meta.title || t('app')) : t('app');
}

/* 开源字体（可选）：fonts/fonts.css 存在才生效，500ms 内无响应也算失败，直接忽略 */
function loadFontsCss() {
  var l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = 'fonts/fonts.css';
  l.onerror = function () { };
  document.head.appendChild(l);
}

/* ============================================================
   4. 全局状态
   ============================================================ */
var BOOK = null;        // 当前书
var DBSTATE = null;     // 当前书的持久化数据 {progress, marks: [], notes: []}
var CHAPTERS = {};      // si -> {el, prep}
var TEXTIDX = null;     // 全文索引
var rendered = [];      // 已渲染章节的 si 列表
var curSi = 0;
var suppressScroll = 0;
var SHELF = [];         // 当前书架快照

/* ============================================================
   5. EPUB 解析
   ============================================================ */
function parseXml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
function parseHtml(s) { return new DOMParser().parseFromString(s, 'text/html'); }
function byLocalName(root, name) {
  var out = [], all = root.getElementsByTagName('*');
  for (var i = 0; i < all.length; i++) {
    var ln = all[i].localName || all[i].nodeName.replace(/^.*:/, '');
    if (ln === name) out.push(all[i]);
  }
  return out;
}
function attrAny(el, name) { return el.getAttribute(name) || el.getAttributeNS('http://www.idpf.org/2007/opf', name) || ''; }

async function readZipText(zip, path) {
  var f = zip.file(path);
  if (!f) {
    // 有些书路径大小写不一致
    var k = Object.keys(zip.files).find(function (n) { return n.toLowerCase() === path.toLowerCase(); });
    if (k) f = zip.file(k);
  }
  if (!f) return null;
  return await f.async('string');
}

async function parseEpub(buf, name) {
  var zip = await JSZip.loadAsync(buf);

  /* --- container.xml --- */
  var cont = await readZipText(zip, 'META-INF/container.xml');
  if (!cont) throw new Error(t('notEpub'));
  var cdoc = parseXml(cont);
  var rf = byLocalName(cdoc, 'rootfile')[0];
  if (!rf) throw new Error(t('notEpub'));
  var opfPath = rf.getAttribute('full-path');
  var opfDir = dirOf(opfPath);

  /* --- OPF --- */
  var opfText = await readZipText(zip, opfPath);
  if (!opfText) throw new Error(t('notEpub'));
  var od = parseXml(opfText);
  var pkg = byLocalName(od, 'package')[0] || od.documentElement;

  var meta = { title: '', creator: '', language: '', id: '', fixed: '' };
  function metaText(tag) {
    var els = byLocalName(pkg, tag);
    for (var i = 0; i < els.length; i++) if (els[i].textContent.trim()) return els[i].textContent.trim();
    return '';
  }
  meta.title = metaText('title'); meta.creator = metaText('creator');
  meta.language = metaText('language'); meta.id = metaText('identifier');
  // 固定版式判定
  var metas = byLocalName(pkg, 'meta');
  for (var i = 0; i < metas.length; i++) {
    var mn = metas[i].getAttribute('name') || metas[i].getAttribute('property') || '';
    var mc = metas[i].getAttribute('content') || metas[i].textContent || '';
    if (/fixed-layout/i.test(mn) && /true|pre-paginated/i.test(mc)) meta.fixed = 'pre-paginated';
    if (mn === 'rendition:layout' && /pre-paginated/i.test(mc)) meta.fixed = 'pre-paginated';
  }
  if (!meta.title) meta.title = name.replace(/\.epub$/i, '') || t('app');

  /* --- manifest --- */
  var items = {}, idById = {};
  byLocalName(pkg, 'item').forEach(function (it) {
    var href = it.getAttribute('href') || '';
    var full = joinPath(opfDir, href);
    var o = { id: it.getAttribute('id') || '', href: full, type: it.getAttribute('media-type') || '', props: attrAny(it, 'properties') };
    items[full] = o;
    if (o.id) idById[o.id] = o;
  });

  /* --- spine --- */
  var spine = [];
  byLocalName(pkg, 'itemref').forEach(function (r) {
    var idref = r.getAttribute('idref');
    if (idById[idref] && !/^no$/i.test(r.getAttribute('linear') || '')) spine.push(idById[idref].href);
  });
  if (!spine.length) throw new Error(t('notEpub'));

  /* --- 封面 --- */
  var coverHref = '';
  var cm = byLocalName(pkg, 'meta').filter(function (m) { return (m.getAttribute('name') || '') === 'cover'; })[0];
  if (cm) {
    var ci = idById[cm.getAttribute('content')];
    if (ci) coverHref = ci.href;
  }
  if (!coverHref) {
    var keys = Object.keys(items);
    for (var i = 0; i < keys.length; i++) {
      if (items[keys[i]].props && items[keys[i]].props.indexOf('cover-image') >= 0) { coverHref = keys[i]; break; }
    }
  }

  /* --- 目录：优先 NCX(EPUB2)，其次 nav(EPUB3) --- */
  var toc = [];
  var ncxItem = Object.keys(items).filter(function (k) { return items[k].type === 'application/x-dtbncx+xml'; })[0];
  if (ncxItem) {
    var ncxText = await readZipText(zip, ncxItem);
    if (ncxText) toc = parseNcx(ncxText, opfDir);
  }
  if (!toc.length) {
    var navItem = Object.keys(items).filter(function (k) { return /nav/.test(items[k].props || '') || /(^|\/)nav\.x?html?$/i.test(k); })[0];
    if (navItem) {
      var navText = await readZipText(zip, navItem);
      if (navText) toc = parseNav(navText, dirOf(navItem));
    }
  }

  var book = {
    id: '', name: name, meta: meta, zip: zip, opfDir: opfDir,
    items: items, spine: spine, toc: toc, tocCount: 0,
    cover: coverHref, blobs: {}, hrefIndex: {}
  };
  book.id = (meta.id || '').replace(/\s+/g, '') || ((name || '') + '::' + (buf.byteLength || 0));
  spine.forEach(function (h, i) { book.hrefIndex[h] = i; book.hrefIndex[h.split('/').pop()] = i; });

  var n = 0; (function cnt(a) { a.forEach(function (x) { n++; if (x.kids) cnt(x.kids); }); })(toc);
  book.tocCount = n;

  /* --- 图片 -> blob URL（只有几张，一次做完） --- */
  var imgKeys = Object.keys(items).filter(function (k) { return /^image\//.test(items[k].type); });
  for (var i = 0; i < imgKeys.length; i++) {
    try {
      var blob = await zip.file(imgKeys[i]).async('blob');
      book.blobs[imgKeys[i]] = URL.createObjectURL(new Blob([blob], { type: items[imgKeys[i]].type }));
      book.blobs[imgKeys[i].split('/').pop()] = book.blobs[imgKeys[i]];
    } catch (e) { }
  }
  book.coverUrl = book.blobs[coverHref] || book.blobs[dirOf(coverHref) + (coverHref.split('/').pop())] || '';
  return book;
}

function parseNcx(xmlText, opfDir) {
  var doc = parseXml(xmlText);
  var navMap = byLocalName(doc, 'navMap')[0];
  if (!navMap) return [];
  function walk(el) {
    var out = [];
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      var ln = c.localName || c.nodeName.replace(/^.*:/, '');
      if (ln !== 'navPoint') continue;
      var lab = null, con = null, cc = c.children;
      for (var j = 0; j < cc.length; j++) {
        var l2 = cc[j].localName || cc[j].nodeName.replace(/^.*:/, '');
        if (l2 === 'navLabel' && !lab) lab = cc[j].textContent.trim();
        if (l2 === 'content' && !con) con = cc[j].getAttribute('src') || '';
      }
      var node = { label: lab || '', src: con || '' };
      node.kids = walk(c);
      out.push(node);
    }
    return out;
  }
  return walk(navMap);
}

function parseNav(htmlText, navDir) {
  var doc = parseHtml(htmlText);
  var nav = doc.querySelector('nav[epub\\:type="toc"], nav[*|type="toc"], nav') || doc.body;
  var list = nav.querySelector('ol, ul');
  if (!list) return [];
  function walk(ul) {
    var out = [];
    Array.prototype.forEach.call(ul.children, function (li) {
      if (li.tagName.toLowerCase() !== 'li') return;
      var a = li.querySelector('a') || li.querySelector('span');
      var sub = li.querySelector('ol, ul');
      out.push({ label: a ? a.textContent.trim() : '', src: a && a.getAttribute ? (a.getAttribute('href') || '') : '', kids: sub ? walk(sub) : [] });
    });
    return out;
  }
  return walk(list);
}

/* ============================================================
   6. 章节 HTML 预处理
   - id 加章节前缀，避免 416 章互相撞车（每章都有 id0/id1a…）
   - 注释链接 -> data-note；跨文件链接 -> data-goto；图片 -> blob URL
   ============================================================ */
function chapterPath(si) { return BOOK.spine[si]; }

function imgUrl(chapterHref, src) {
  var full = joinPath(dirOf(chapterHref), src);
  return BOOK.blobs[full] || BOOK.blobs[src.split('/').pop()] || '';
}

function prepChapter(raw, si) {
  var href = chapterPath(si);
  var cd = dirOf(href);
  var doc = parseHtml(raw);
  var body = doc.body;
  if (!body) return '<p>（空白章节）</p>';
  // 去掉书里自带的 <style>（极少数章节有）
  Array.prototype.forEach.call(body.querySelectorAll('style, script'), function (n) { n.remove(); });

  var html = body.innerHTML;

  // 图片：<img src="...">
  html = html.replace(/(<img\b[^>]*?\ssrc=)(["'])([^"']+)\2/gi, function (m, a, q, src) {
    var u = imgUrl(href, src);
    return u ? a + '"' + u + '"' : m;
  });
  // 顺便记录 alt 为空的图，避免高度塌陷
  html = html.replace(/<img\b(?![^>]*\salt=)/gi, '<img alt=""');
  // SVG 里的 <image xlink:href="...">（封面就是用这个包 cover.jpg 的）
  html = html.replace(/(<image\b[^>]*?(?:xlink:href|[\s"']href)=)(["'])([^"']+)\2/gi, function (m, a, q, src) {
    if (/^(data:|blob:|https?:)/i.test(src)) return m;
    var u = imgUrl(href, src);
    return u ? a + '"' + u + '"' : m;
  });

  // 链接
  html = html.replace(/<a\b([^>]*)>/gi, function (m, ats) {
    var hm = /href\s*=\s*(["'])([^"']*)\1/i.exec(ats);
    if (!hm) return '<a' + ats.replace(/\shref\s*=\s*(["'])[^"']*\1/i, '') + '>';
    var h = hm[2];
    var rest = ats.replace(/\shref\s*=\s*(["'])[^"']*\1/i, '');
    if (h.charAt(0) === '#') {
      var cm2 = /class\s*=\s*(["'])([^"']*)\1/i.exec(rest);
      var cn = cm2 ? cm2[2] : '';
      // class 含 hl / hl1 的是"注释区里的回跳锚点"（注释 -> 正文原处），
      // 含 zy 的才是"正文里的引用角标"（正文 -> 注释弹窗）。
      if (/(^|\s)hl1?(\s|$)/.test(cn)) return '<a' + rest + ' data-back="' + esc(h.slice(1)) + '">';
      return '<a' + rest + ' data-note="' + esc(h.slice(1)) + '">';
    }
    var part = h.split('#');
    var target = joinPath(cd, part[0]);
    var idx = BOOK.hrefIndex[target];
    if (idx === undefined) idx = BOOK.hrefIndex[part[0].split('/').pop()];
    if (idx !== undefined) {
      return '<a' + rest + ' data-goto="' + idx + '"' + (part[1] ? ' data-frag="' + esc(part[1]) + '"' : '') + '>';
    }
    // 站外链接
    if (/^https?:/i.test(h)) return '<a' + rest + ' data-ext="' + esc(h) + '">';
    return '<a' + rest + '>';
  });

  // id 加前缀
  html = html.replace(/\sid\s*=\s*(["'])([^"']+)\1/gi, function (m, q, id) {
    return ' id="c' + si + '__' + esc(id).replace(/"/g, '') + '"';
  });

  return html;
}

/* ============================================================
   7. 章节渲染 / 虚拟滚动
   ============================================================ */
function chapterEl(si) { return CHAPTERS[si] && CHAPTERS[si].el; }

function makeChapter(si) {
  var el = document.createElement('section');
  el.className = 'chapter';
  el.setAttribute('data-si', si);
  return el;
}

async function renderChapter(si) {
  var cur = CHAPTERS[si];
  // 已经渲染完成（有内容、不在 loading）——直接复用
  if (cur && !cur.loading && cur.prep !== null) return cur.el;
  // 正在渲染中——复用同一个 Promise，避免并发重复读 zip
  if (cur && cur._p) return cur._p;
  // 走到这里：要么没有记录，要么记录只是个占位（loading）。

  // 调用方（gotoChapter / ensureWindow）通常已把占位 section 插进 DOM 了，
  // 这里沿用它的元素，保证 replaceChild 能成功；万一没有就自己建一个。
  var ph = (cur && cur.el) ? cur.el : makeChapter(si);
  if (!ph.innerHTML) ph.innerHTML = '<div class="chapter-loading">' + t('loading') + '</div>';

  var rec = { el: ph, prep: null, loading: true };
  CHAPTERS[si] = rec;

  var p = (async function () {
    var text = await readZipText(BOOK.zip, chapterPath(si));
    if (text === null) {
      if (ph.parentNode) {
        var miss = makeChapter(si);
        miss.innerHTML = '<p>（章节缺失：' + esc(chapterPath(si)) + '）</p>';
        ph.parentNode.replaceChild(miss, ph);
        rec.el = miss;
      } else {
        ph.innerHTML = '<p>（章节缺失：' + esc(chapterPath(si)) + '）</p>';
      }
      rec.loading = false;
      rec.prep = '';
      return rec.el;
    }

    var prep = prepChapter(text, si);
    var el = makeChapter(si);
    el.innerHTML = prep;
    if (ph.parentNode) {
      // 常规路径：占位已在 DOM 里，原地替换
      ph.parentNode.replaceChild(el, ph);
    } else {
      // 占位尚未插入 DOM（调用方还没 append）——把内容写回占位元素本身，
      // 这样调用方后续插入时就自带内容，不会白屏。
      ph.innerHTML = prep;
      el = ph;
    }

    wrapNoteZone(si, el);
    applyAnnotations(si, el);

    rec.el = el;
    rec.prep = prep;
    rec.loading = false;
    return el;
  })();

  rec._p = p;
  return p;
}

/* 章末注释区折叠 */
function wrapNoteZone(si, el) {
  var firstNote = null;
  var ps = el.querySelectorAll('p');
  for (var i = 0; i < ps.length; i++) {
    var cn = ' ' + (ps[i].className || '') + ' ';
    if (cn.indexOf(' zs ') >= 0 || cn.indexOf(' zs1 ') >= 0) { firstNote = ps[i]; break; }
  }
  if (!firstNote) return;
  // 往前找 3 段以内、内容很短的"注　释"标题
  var head = firstNote, sib = firstNote.previousElementSibling, hops = 0;
  while (sib && hops < 3) {
    var txt = (sib.textContent || '').replace(/\s/g, '');
    if (txt.length <= 12 && txt.indexOf('注') >= 0 && txt.indexOf('释') >= 0) { head = sib; break; }
    sib = sib.previousElementSibling; hops++;
  }
  var nodes = [], n = head;
  while (n) { nodes.push(n); n = n.nextElementSibling; }
  var wrap = document.createElement('div');
  wrap.className = 'notewrap';
  var cnt = el.querySelectorAll('a[data-back]').length;

  var btn = document.createElement('button');
  btn.className = 'notetoggle';
  btn.innerHTML = '<span class="arrow">&#9654;</span><span>' + esc(t('noteTag')) + '（' + cnt + '）</span>';
  var bodyEl = document.createElement('div');
  bodyEl.className = 'notebody';

  nodes.forEach(function (x) { bodyEl.appendChild(x); });
  wrap.appendChild(btn);
  wrap.appendChild(bodyEl);
  el.appendChild(wrap);
  btn.addEventListener('click', function () { wrap.classList.toggle('open'); });
}

/* ============================================================
   8. 注释解析与弹窗（核心）
   ============================================================ */
function findNoteNode(si, noteId) {
  var el = chapterEl(si);
  if (!el) return null;
  return el.querySelector('[id="c' + si + '__' + noteId.replace(/"/g, '') + '"]');
}

/* 取出该注释号下的全部注文。
   原书有 2 处把同一个注释号写了两条不同的注释（Section0820 的〔22〕、Section0838 的〔3〕），
   只取第一条会丢内容，所以这里全部收集。 */
function findAllNotes(si, noteId, root) {
  var el = root || chapterEl(si);
  if (!el) return [];
  var nodes = el.querySelectorAll('[id="c' + si + '__' + noteId.replace(/"/g, '') + '"]');
  var seen = [], out = [];
  Array.prototype.forEach.call(nodes, function (n) {
    var p = n.closest ? n.closest('p') : n.parentNode;
    if (!p || seen.indexOf(p) >= 0) return;
    seen.push(p);
    var tx = extractNote(p);
    if (tx) out.push(tx);
  });
  return out;
}

/* 由注释锚点取出注释正文（含 zs1 续段），并去掉〔N〕符号本身 */
function extractNote(pEl) {
  if (!pEl) return '';
  var parts = [pEl];
  var sib = pEl.nextElementSibling;
  while (sib && /(^|\s)(zs1)(\s|$)/.test(sib.className || '')) { parts.push(sib); sib = sib.nextElementSibling; }
  return parts.map(function (p) {
    var c = p.cloneNode(true);
    var a = c.querySelector('a[data-back], a[data-note], a.hl, a.hl1');
    if (a) a.remove();
    return (c.textContent || '').replace(/\u00a0/g, ' ').trim();
  }).filter(Boolean).join('\n');
}

/* 取正文引用处的上下文（弹窗底部显示，方便对回原文） */
function contextOf(aEl) {
  var p = aEl.closest ? aEl.closest('p, h1, h2, h3, h4, h5') : aEl.parentNode;
  if (!p) return '';
  var c = p.cloneNode(true);
  Array.prototype.forEach.call(c.querySelectorAll('a[data-note]'), function (n) {
    n.parentNode.replaceChild(document.createTextNode('〔' + (n.textContent || '').replace(/[〔〕*\s]/g, '') + '〕'), n);
  });
  var s = (c.textContent || '').replace(/\s+/g, ' ').trim();
  return s.length > 110 ? s.slice(0, 110) + '…' : s;
}

function showNote(si, aEl, noteId) {
  var tagTxt = (aEl.textContent || '').replace(/[〔〕\s*]/g, '') || '*';
  $('npTag').textContent = tagTxt;
  var list = findAllNotes(si, noteId);

  if (list.length) {
    $('npTitle').textContent = t('noteTag') + ' ' + tagTxt +
      (list.length > 1 ? '　（' + t('noteMulti', { n: list.length }) + '）' : '');
    $('npBody').innerHTML = list.map(function (tx, i) {
      return (list.length > 1 ? '<div class="np-sep">' + (i + 1) + '</div>' : '') + esc(tx);
    }).join('') +
      '<div class="np-ctx">' + esc(t('npContext')) + esc(contextOf(aEl)) + '</div>';
  } else {
    $('npTitle').textContent = t('noteTag') + ' ' + tagTxt;
    $('npBody').innerHTML = '<div class="np-miss"><b>' + esc(t('noteMissing')) + '</b><br>' +
      esc(t('noteMissingSub', { n: tagTxt })) + '</div>' +
      '<div class="np-ctx">' + esc(t('npContext')) + esc(contextOf(aEl)) + '</div>';
  }
  $('notepop').classList.add('show');
  // 原处角标闪一下，让用户知道点的是哪儿
  aEl.classList.add('flash');
  setTimeout(function () { aEl.classList.remove('flash'); }, 900);
}
function hideNote() { $('notepop').classList.remove('show'); }

/* ============================================================
   9. 进度 / 书签 / 高亮 持久化
   ============================================================ */
function loadState(bookId) {
  try {
    var s = localStorage.getItem(KEYBOOK + bookId);
    DBSTATE = s ? JSON.parse(s) : null;
  } catch (e) { DBSTATE = null; }
  if (!DBSTATE) DBSTATE = {};
  DBSTATE.progress = DBSTATE.progress || null;
  DBSTATE.marks = DBSTATE.marks || [];
  DBSTATE.notes = DBSTATE.notes || [];
  return DBSTATE;
}
function saveState() {
  if (!BOOK || !DBSTATE) return;
  try { localStorage.setItem(KEYBOOK + BOOK.id, JSON.stringify(DBSTATE)); } catch (e) { }
}

var saveProgress = debounce(function () {
  if (!BOOK || !DBSTATE) return;
  var pos = currentPosition();
  DBSTATE.progress = { si: pos.si, frac: pos.frac, ts: Date.now() };
  saveState();
}, 700);

function currentPosition() {
  var view = $('view');
  var si = curSi, frac = 0;
  var el = chapterEl(si);
  if (el) {
    var top = el.offsetTop, h = el.offsetHeight || 1;
    frac = Math.min(1, Math.max(0, (view.scrollTop - top) / h));
  }
  // 全书进度
  var total = BOOK ? BOOK.spine.length : 1;
  return { si: si, frac: frac, all: (si + frac) / total };
}

/* ---------- 文本偏移 <-> DOM ---------- */
function chapterTextNodes(el) {
  var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  var arr = [], acc = 0, n;
  while ((n = w.nextNode())) { arr.push({ n: n, s: acc, e: acc + n.nodeValue.length }); acc += n.nodeValue.length; }
  return arr;
}
function offsetAt(el, node, off) {
  var nodes = chapterTextNodes(el);
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].n === node) return nodes[i].s + off;
  }
  return null;
}
function rangeFromOffsets(el, start, len) {
  var nodes = chapterTextNodes(el), r = document.createRange(), gotS = false;
  for (var i = 0; i < nodes.length; i++) {
    var nd = nodes[i];
    if (!gotS && start >= nd.s && start < nd.e) { r.setStart(nd.n, start - nd.s); gotS = true; }
    if (gotS && start + len <= nd.e) { r.setEnd(nd.n, start + len - nd.s); break; }
  }
  return gotS ? r : null;
}

/* ---------- 高亮渲染 ---------- */
function applyAnnotations(si, el) {
  var items = (DBSTATE && DBSTATE.notes || []).filter(function (n) { return n.si === si; });
  if (!items.length) return;
  items.sort(function (a, b) { return a.start - b.start; });
  var nodes = chapterTextNodes(el);
  var total = nodes.length ? nodes[nodes.length - 1].e : 0;
  // 只处理不重叠的（后加的重复段落直接跳过）
  var last = -1, list = [];
  items.forEach(function (n) {
    if (n.start >= last && n.len > 0 && n.start + n.len <= total) { list.push(n); last = n.start + n.len; }
  });
  if (!list.length) return;
  // 从后往前，逐文本节点切分包裹
  for (var i = nodes.length - 1; i >= 0; i--) {
    var nd = nodes[i];
    var segs = [];
    list.forEach(function (it) {
      var a = Math.max(it.start, nd.s), b = Math.min(it.start + it.len, nd.e);
      if (b > a) segs.push({ a: a - nd.s, b: b - nd.s, it: it });
    });
    if (!segs.length) continue;
    segs.sort(function (x, y) { return y.a - x.a; });   // 从右往左
    var node = nd.n;
    for (var k = 0; k < segs.length; k++) {
      var s = segs[k];
      try {
        var tail = node.splitText(s.b);
        var mid = node.splitText(s.a);
        var mk = document.createElement('mark');
        mk.className = 'wb' + (s.it.note ? ' hasnote' : '');
        mk.setAttribute('data-c', s.it.color || 'y');
        mk.setAttribute('data-hid', s.it.id);
        mk.title = s.it.note || '';
        mid.parentNode.replaceChild(mk, mid);
        mk.appendChild(mid);
        node = node; // 左半段继续处理下一段
      } catch (e) { }
    }
  }
}

/* ============================================================
   10. 跳转
   ============================================================ */
async function gotoChapter(si, opt) {
  opt = opt || {};
  if (!BOOK) return;
  si = Math.max(0, Math.min(BOOK.spine.length - 1, si));

  if (BOOK.meta.fixed === 'pre-paginated') { renderFixedPage(si); curSi = si; updateBars(); saveProgress(); return; }

  var view = $('view');
  // 清空重排到目标章节附近
  suppressScroll++;
  $('book').innerHTML = '';
  CHAPTERS = {};
  rendered = [];
  var host = $('book');
  for (var i = Math.max(0, si - 1); i <= Math.min(BOOK.spine.length - 1, si + 1); i++) {
    var c = makeChapter(i);
    host.appendChild(c);
    CHAPTERS[i] = { el: c, prep: null, loading: true };
    rendered.push(i);
  }
  curSi = si;
  await Promise.all(rendered.slice().map(function (i) { return renderChapter(i); }));

  // 定位
  await new Promise(function (r) { requestAnimationFrame(r); });
  var el = chapterEl(si);
  var target = el ? offsetInView(el, view) : 0;
  if (opt.frag) {
    var tn = el && el.querySelector('[id="c' + si + '__' + opt.frag.replace(/"/g, '') + '"]');
    if (tn) { target = offsetInView(tn, view); flashEl(tn); }
  } else if (opt.offset !== undefined && el) {
    var r = rangeFromOffsets(el, opt.offset, Math.max(1, opt.len || 1));
    if (r) {
      var rc = r.getBoundingClientRect(), vc = view.getBoundingClientRect();
      target = view.scrollTop + (rc.top - vc.top) - Math.round(view.clientHeight * 0.32);
      flashRange(el, opt.offset, opt.len || 1);
    }
  } else if (opt.frac) {
    target = offsetInView(el, view) + (el ? el.offsetHeight : 0) * opt.frac;
  } else if (el) {
    /* 目录跳转：对准这一章的"标题"，而不是章节容器的顶边。
       原来取 el.offsetTop（参照系是 body），而 scrollTop 属于滚动容器坐标系，
       两者差的正是顶栏那一截 —— 实测跳完标题落在视口上方 25px，要往上翻才看得见。
       这里改成按 rect 定位到标题元素，再往上留 12px 呼吸位。 */
    var head = el.querySelector('h1,h2,h3,h4,h5,.toc1,.h1,.h2,.h3,.h4,.h5');
    target = offsetInView(head || el, view) - 12;
  }
  if (target < 0) target = 0;
  view.scrollTop = target;
  suppressScroll--;
  updateBars();
  saveProgress();
  markCurrentToc();
  if (opt.offset === undefined) window.scrollTo(0, 0);
}

function flashEl(el) {
  el.classList.add('wb-flash');
  setTimeout(function () { el.classList.remove('wb-flash'); }, 1150);
}
function scrollToEl(el, bias) {
  var view = $('view');
  var r = el.getBoundingClientRect(), vc = view.getBoundingClientRect();
  view.scrollTop += (r.top - vc.top) - view.clientHeight * (bias === undefined ? 0.42 : bias);
}
function flashRange(el, start, len) {
  var r = rangeFromOffsets(el, start, len);
  if (!r) return;
  try {
    var span = document.createElement('span');
    span.className = 'wb-flash';
    r.surroundContents(span);
    setTimeout(function () {
      if (span.parentNode) { span.parentNode.replaceChild(document.createTextNode(span.textContent), span); span.parentNode.normalize(); }
    }, 1150);
  } catch (e) { }
}

/* ============================================================
   11. 滚动窗口管理
   ============================================================ */
/* 元素在 #view 滚动坐标系里的位置。
   必须用 rect 算：el.offsetTop 的参照系是 offsetParent（这里一路是 body），
   而 view.scrollTop 是相对滚动容器的，两者差的正好是顶栏那一截 ——
   直接混用会让跳转位置系统性偏移（实测标题跑到视口上方 25px）。 */
function offsetInView(el, view) {
  if (!el) return 0;
  var r = el.getBoundingClientRect(), v = view.getBoundingClientRect();
  return view.scrollTop + (r.top - v.top);
}

function onScroll() {
  if (!BOOK || suppressScroll) return;
  var view = $('view');
  var vTop = view.scrollTop;
  // 视口顶部落在哪一章 —— 只用于状态栏与进度，不再用它驱动窗口扩展
  var best = curSi, bestTop = -1e9;
  rendered.forEach(function (si) {
    var el = chapterEl(si); if (!el || !el.parentNode) return;
    var t = offsetInView(el, view);
    if (t <= vTop + 8 && t > bestTop) { bestTop = t; best = si; }
  });
  if (best !== curSi) { curSi = best; updateBars(); markCurrentToc(); }
  saveProgress();
  ensureWindow();
}

/* ---------- 滚动锚点 ----------
   原来"补章后的补偿"是空操作、回收章节时完全没补偿，会让阅读位置跳。
   现在统一成滚动锚点，但**只补 DOM 变动造成的那段增量**，不要用绝对位置回写 ——
   否则用户在异步渲染期间自己滚了，会被硬拽回旧位置（表现为"划不动"）。 */
function pickAnchor() {
  var view = $('view');
  var vTop = view.scrollTop;
  var cands = [];
  rendered.forEach(function (si) {
    var el = chapterEl(si);
    if (el && el.parentNode) cands.push(el);
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) { return offsetInView(a, view) - offsetInView(b, view); });
  var best = cands[cands.length - 1];
  for (var i = 0; i < cands.length; i++) {
    if (offsetInView(cands[i], view) >= vTop - 2) { best = cands[i]; break; }
  }
  return { el: best, top: offsetInView(best, view) };
}
function restoreAnchor(a) {
  if (!a || !a.el || !a.el.parentNode) return;
  var view = $('view');
  var d = offsetInView(a.el, view) - a.top;   // 锚点被 DOM 变动推走了多少
  if (Math.abs(d) > 0.5) {
    suppressScroll++;
    view.scrollTop = view.scrollTop + d;      // 只补增量，保留用户自己的滚动
    suppressScroll--;
  }
}

var ensureWindow = debounce(function () {
  if (!BOOK) return;
  var host = $('book');
  var view = $('view');
  var vTop = view.scrollTop, vBot = vTop + view.clientHeight;
  /* ★ 用"视口实际覆盖到的章节范围"驱动窗口，而不是 curSi ± 1。
     原来那套在滚动末端会死锁：
       视口顶部永远追不上下一章的 offsetTop → curSi 卡住
       → 待挂的 [curSi-1, curSi+1] 全都已存在 → 下一章永不挂载
       → 内容高度不再增长 → 彻底滚不动。
     换成按可视范围取 from..to，并各向外多留一章，就永远还能继续往下滚。 */
  var topSi = -1, botSi = -1;
  rendered.slice().sort(function (a, b) { return a - b; }).forEach(function (si) {
    var el = chapterEl(si);
    if (!el || !el.parentNode) return;
    var t = offsetInView(el, view);
    if (topSi < 0 && t + el.offsetHeight > vTop) topSi = si;
    if (t < vBot) botSi = si;
  });
  if (topSi < 0) { topSi = curSi; botSi = curSi; }
  if (botSi < 0) botSi = topSi;
  var from = Math.max(0, topSi - 1);
  var to = Math.min(BOOK.spine.length - 1, botSi + 1);
  var want = [];
  for (var w = from; w <= to; w++) want.push(w);
  var anchor = pickAnchor();
  var pending = [];
  // 补充缺失
  want.forEach(function (si) {
    if (CHAPTERS[si]) return;
    var el = makeChapter(si);
    el.innerHTML = '<div class="chapter-loading">' + t('loading') + '</div>';
    CHAPTERS[si] = { el: el, loading: true };
    var after = null;
    for (var i = si + 1; i < BOOK.spine.length; i++) if (CHAPTERS[i]) { after = CHAPTERS[i].el; break; }
    var before = null;
    for (var j = si - 1; j >= 0; j--) if (CHAPTERS[j]) { before = CHAPTERS[j].el; break; }
    if (after && after.parentNode === host) host.insertBefore(el, after);
    else if (before && before.parentNode === host) host.appendChild(el);
    else host.appendChild(el);
    rendered.push(si);
    pending.push(renderChapter(si));
  });
  // 回收窗口外的（拿掉上方内容同样会位移，靠锚点补回来）
  rendered.slice().forEach(function (si) {
    if ((si < from || si > to) && CHAPTERS[si] && !CHAPTERS[si].loading) {
      var el = chapterEl(si);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      delete CHAPTERS[si];
      rendered = rendered.filter(function (x) { return x !== si; });
    }
  });
  restoreAnchor(anchor);
  if (pending.length) {
    // 占位符换成正文会让高度大变，渲染完必须再钉一次
    Promise.all(pending).then(function () { restoreAnchor(anchor); });
  }
}, 120);

function updateBars() {
  var pos = currentPosition();
  var el = chapterEl(curSi);
  var name = '';
  if (el) {
    var h = el.querySelector('h1,h2,h3,h4,h5,.toc1');
    name = h ? (h.textContent || '').trim() : '';
  }
  if (!name) name = labelForChapter(curSi) || t('chOf', { i: curSi + 1, n: BOOK.spine.length });
  $('sbName').textContent = name;
  $('sbPct').textContent = Math.round(pos.all * 100) + '%';
  $('progressbar').firstElementChild.style.width = (pos.all * 100).toFixed(2) + '%';
  $('btnMark').classList.toggle('on', hasMarkAt(curSi));
}

function labelForChapter(si) {
  if (!BOOK) return '';
  var found = '';
  (function walk(arr) {
    if (found) return;
    arr.forEach(function (n) {
      if (found) return;
      var idx = tocIndex(n.src);
      if (idx === si) { found = n.label; return; }
      if (n.kids && n.kids.length) walk(n.kids);
    });
  })(BOOK.toc);
  return found;
}
function tocIndex(src) {
  if (!src) return undefined;
  var p = src.split('#')[0];
  var full = joinPath(BOOK.opfDir, p);
  var i = BOOK.hrefIndex[full];
  if (i === undefined) i = BOOK.hrefIndex[p.split('/').pop()];
  return i;
}

/* ============================================================
   12. 目录面板
   ============================================================ */
function buildToc() {
  var pane = $('paneToc');
  pane.innerHTML = '';
  if (!BOOK || !BOOK.toc.length) { pane.innerHTML = '<div class="empty-hint">' + t('noToc') + '</div>'; return; }
  var frag = document.createDocumentFragment();
  BOOK.toc.forEach(function (n) { frag.appendChild(tocNode(n, 0)); });
  pane.appendChild(frag);
  markCurrentToc();
}
/* 展开 / 收起一个目录分支 */
function tocToggle(row, kids, on) {
  if (!kids) return;
  if (on === undefined) on = !kids.classList.contains('open');
  kids.classList.toggle('open', on);
  var c = row.querySelector('.caret');
  if (c) c.classList.toggle('open', on);
}
function tocNode(n, depth) {
  var wrap = document.createElement('div');
  wrap.className = 'toc-node';
  var hasKids = n.kids && n.kids.length;
  var si = tocIndex(n.src);
  var row = document.createElement('div');
  row.className = 'toc-row' + (hasKids ? ' branch' : '');
  /* 有子节点：整行点击 = 展开/收起（这才符合直觉），
     跳转交给右侧独立按钮，两个动作不再互相打架。
     叶子节点：整行点击 = 跳转。 */
  row.innerHTML = '<span class="caret' + (hasKids ? '' : ' leaf') + '">&#9654;</span>' +
    '<span class="lb">' + esc(n.label) + '</span>' +
    (si === undefined ? '' : '<span class="go">' + esc(t('tocGo')) + '</span>');
  row.setAttribute('data-si', si === undefined ? '' : si);
  row.setAttribute('data-label', n.label);
  wrap.appendChild(row);
  var kids = null;
  if (hasKids) {
    kids = document.createElement('div');
    kids.className = 'toc-kids';
    n.kids.forEach(function (k) { kids.appendChild(tocNode(k, depth + 1)); });
    wrap.appendChild(kids);
  }
  row.addEventListener('click', function (ev) {
    var hitGo = !!(ev.target && ev.target.closest && ev.target.closest('.go'));
    if (hitGo || !hasKids) {
      if (si === undefined) { toast(t('fragMiss')); return; }
      var frag = n.src.indexOf('#') >= 0 ? n.src.split('#')[1] : '';
      gotoChapter(si, frag ? { frag: frag } : {});
      closePanel();
      return;
    }
    tocToggle(row, kids);
  });
  return wrap;
}
function markCurrentToc() {
  var pane = $('paneToc');
  if (!pane) return;
  $$('.toc-row.cur', pane).forEach(function (r) { r.classList.remove('cur'); });
  // 找出"最后一个 si <= curSi"的目录项
  var rows = $$('.toc-row[data-si]', pane);
  var best = null;
  rows.forEach(function (r) {
    var si = parseInt(r.getAttribute('data-si'), 10);
    if (isNaN(si) || si > curSi) return;
    if (!best || si >= parseInt(best.getAttribute('data-si'), 10)) best = r;
  });
  if (best) {
    best.classList.add('cur');
    // 展开祖先
    var p = best.parentNode;
    while (p && p !== pane) {
      if (p.classList.contains('toc-kids')) {
        p.classList.add('open');
        var pr = p.previousElementSibling;
        if (pr) { var c = pr.querySelector('.caret'); if (c) c.classList.add('open'); }
      }
      p = p.parentNode;
    }
  }
}

/* ============================================================
   13. 全文搜索 + 词频统计
   ============================================================ */
async function buildIndex(onProg) {
  if (TEXTIDX) return TEXTIDX;
  TEXTIDX = new Array(BOOK.spine.length);
  var batch = 24;
  for (var i = 0; i < BOOK.spine.length; i += batch) {
    await Promise.all(BOOK.spine.slice(i, i + batch).map(function (h, k) {
      var si = i + k;
      return readZipText(BOOK.zip, h).then(function (s) {
        TEXTIDX[si] = s ? plainText(s) : '';
      });
    }));
    if (onProg) onProg(Math.round((i + batch) / BOOK.spine.length * 100));
  }
  return TEXTIDX;
}
function plainText(html) {
  var s = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return s.replace(/[\s\u3000]+/g, ' ').trim();
}

var lastResults = [];
async function doSearch(q, keep) {
  q = (q || '').trim();
  var statsEl = $('searchStats'), listEl = $('searchList');
  if (!q) { statsEl.innerHTML = ''; listEl.innerHTML = ''; return; }
  statsEl.innerHTML = t('statIndexing', { p: 0 });
  var texts = await buildIndex(function (p) { statsEl.innerHTML = t('statIndexing', { p: p }); });

  var lower = q.toLowerCase(), useLower = q !== lower;
  var total = 0, chaptersHit = 0, results = [];
  for (var si = 0; si < texts.length; si++) {
    var tx = texts[si]; if (!tx) continue;
    var hay = useLower ? tx.toLowerCase() : tx;
    var from = 0, cnt = 0, firstIdx = -1;
    while (true) {
      var at = hay.indexOf(lower, from);
      if (at < 0) break;
      if (firstIdx < 0) firstIdx = at;
      cnt++; from = at + q.length;
      if (results.length < 800 && cnt <= 6) results.push({ si: si, offset: at, len: q.length });
    }
    if (cnt) { total += cnt; chaptersHit++; }
  }
  lastResults = results;
  statsEl.innerHTML = total ? t('statHits', { n: total, m: chaptersHit }) : t('statNone', { q: esc(q) });

  // 按章节汇总
  var byCh = {};
  results.forEach(function (r) { (byCh[r.si] = byCh[r.si] || []).push(r); });
  var keys = Object.keys(byCh).map(Number).sort(function (a, b) { return a - b; });
  var html = '';
  keys.slice(0, 200).forEach(function (si) {
    var label = labelForChapter(si) || t('chOf', { i: si + 1, n: BOOK.spine.length });
    var list = byCh[si];
    var head = snippetAround(texts[si], list[0].offset, q.length);
    html += '<div class="item" data-si="' + si + '" data-off="' + list[0].offset + '">' +
      '<div class="l1">' + head + '</div>' +
      '<div class="l2"><span>' + esc(label) + '</span><span>' + list.length + ' 处</span></div></div>';
  });
  if (keys.length > 200) html += '<div class="empty-hint">…</div>';
  listEl.innerHTML = html || '';
  Array.prototype.forEach.call(listEl.querySelectorAll('.item'), function (it) {
    it.addEventListener('click', function () {
      gotoChapter(parseInt(it.getAttribute('data-si'), 10), { offset: parseInt(it.getAttribute('data-off'), 10), len: q.length })
        .then(function () { closePanel(); });
    });
  });
}
function snippetAround(text, at, len) {
  var a = Math.max(0, at - 26), b = Math.min(text.length, at + len + 34);
  var s = esc(text.slice(a, b));
  var rel = at - a;
  return (a > 0 ? '…' : '') + s.slice(0, rel) + '<mark>' + s.slice(rel, rel + len) + '</mark>' + s.slice(rel + len) + (b < text.length ? '…' : '');
}

/* ============================================================
   14. 书签 / 笔记面板
   ============================================================ */
function hasMarkAt(si) {
  return !!(DBSTATE && DBSTATE.marks || []).filter(function (m) { return m.si === si; }).length;
}
function toggleMark() {
  if (!BOOK) return;
  var si = curSi;
  var ex = DBSTATE.marks.filter(function (m) { return m.si === si; });
  if (ex.length) {
    DBSTATE.marks = DBSTATE.marks.filter(function (m) { return m.si !== si; });
    toast(t('markDel'));
  } else {
    var pos = currentPosition();
    var el = chapterEl(si);
    var label = labelForChapter(si) || t('chOf', { i: si + 1, n: BOOK.spine.length });
    var snip = '';
    if (el) {
      var tn = chapterTextNodes(el), target = null;
      for (var i = 0; i < tn.length; i++) if (tn[i].e >= 0) { target = tn[i]; break; }
      snip = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46);
    }
    DBSTATE.marks.push({ id: uid(), si: si, frac: pos.frac, label: label, snip: snip, ts: Date.now() });
    toast(t('markAdd'));
  }
  saveState(); updateBars(); buildMarks();
}
function buildMarks() {
  var pane = $('paneMarks');
  var ms = (DBSTATE && DBSTATE.marks || []).slice().sort(function (a, b) { return b.ts - a.ts; });
  if (!ms.length) { pane.innerHTML = '<div class="empty-hint">' + t('noMark') + '</div>'; return; }
  pane.innerHTML = ms.map(function (m) {
    return '<div class="item" data-id="' + m.id + '" data-si="' + m.si + '" data-frac="' + (m.frac || 0) + '">' +
      '<div class="l1">' + esc(m.label || '') + '</div>' +
      '<div class="l2"><span>' + esc(m.snip || '') + '</span></div>' +
      '<div class="l2"><span>' + new Date(m.ts).toLocaleString() + '</span><span style="margin-left:auto">' + t('del') + '</span></div></div>';
  }).join('');
  Array.prototype.forEach.call(pane.querySelectorAll('.item'), function (it) {
    it.addEventListener('click', function (ev) {
      if (ev.target.tagName === 'SPAN' && ev.target.style.marginLeft) {
        DBSTATE.marks = DBSTATE.marks.filter(function (x) { return x.id !== it.getAttribute('data-id'); });
        saveState(); buildMarks(); updateBars(); toast(t('markDel')); return;
      }
      gotoChapter(parseInt(it.getAttribute('data-si'), 10), { frac: parseFloat(it.getAttribute('data-frac')) || 0 })
        .then(function () { closePanel(); });
    });
  });
}
function buildNotes() {
  var pane = $('paneNotes');
  var ns = (DBSTATE && DBSTATE.notes || []).slice().sort(function (a, b) { return b.ts - a.ts; });
  if (!ns.length) { pane.innerHTML = '<div class="empty-hint">' + t('noNote') + '</div>'; return; }
  pane.innerHTML = ns.map(function (n) {
    return '<div class="item" data-id="' + n.id + '" data-si="' + n.si + '" data-off="' + n.start + '" data-len="' + n.len + '">' +
      '<div class="l1"><mark>' + esc((n.text || '').slice(0, 70)) + '</mark></div>' +
      (n.note ? '<div class="l1" style="color:var(--fg-dim);font-size:12px;margin-top:4px">' + esc(n.note) + '</div>' : '') +
      '<div class="l2"><span>' + esc(labelForChapter(n.si) || '') + '</span><span style="margin-left:auto">' + t('del') + '</span></div></div>';
  }).join('');
  Array.prototype.forEach.call(pane.querySelectorAll('.item'), function (it) {
    it.addEventListener('click', function (ev) {
      if (ev.target.tagName === 'SPAN' && ev.target.style.marginLeft) {
        DBSTATE.notes = DBSTATE.notes.filter(function (x) { return x.id !== it.getAttribute('data-id'); });
        saveState(); buildNotes(); toast(t('del')); return;
      }
      gotoChapter(parseInt(it.getAttribute('data-si'), 10),
        { offset: parseInt(it.getAttribute('data-off'), 10), len: parseInt(it.getAttribute('data-len'), 10) })
        .then(function () { closePanel(); });
    });
  });
}

/* ============================================================
   15. 划词：高亮 / 笔记
   ============================================================ */
var selInfo = null;
function onSelection() {
  var sel = window.getSelection();
  var menu = $('selmenu');
  if (!sel || sel.isCollapsed || !sel.rangeCount) { menu.classList.remove('show'); selInfo = null; return; }
  var range = sel.getRangeAt(0);
  var host = range.startContainer;
  while (host && host.parentNode && !(host.classList && host.classList.contains('chapter'))) host = host.parentNode;
  if (!host || !host.classList || !host.classList.contains('chapter')) { menu.classList.remove('show'); return; }
  var txt = sel.toString().replace(/\s+/g, ' ').trim();
  if (!txt || txt.length > 3000) { menu.classList.remove('show'); return; }

  var si = parseInt(host.getAttribute('data-si'), 10);
  var start = offsetAt(host, range.startContainer, range.startOffset);
  if (start === null) { menu.classList.remove('show'); return; }
  var len = range.toString().length;
  selInfo = { si: si, start: start, len: len, text: sel.toString() };

  var r = range.getBoundingClientRect();
  menu.innerHTML =
    '<button data-act="hl-y" title="' + t('hlHi') + '"><i class="dot" style="background:#ffe58a"></i></button>' +
    '<button data-act="hl-g" title="' + t('hlHi') + '"><i class="dot" style="background:#b7e8b0"></i></button>' +
    '<button data-act="hl-b" title="' + t('hlHi') + '"><i class="dot" style="background:#a8d5f5"></i></button>' +
    '<button data-act="hl-r" title="' + t('hlHi') + '"><i class="dot" style="background:#f7b3b3"></i></button>' +
    '<button data-act="note" title="' + t('hlNote') + '">&#9998;</button>' +
    '<button data-act="copy" title="' + t('hlCopy') + '">&#128203;</button>';
  var top = Math.max(6, r.top - 52), left = Math.min(window.innerWidth - 250, Math.max(6, r.left + r.width / 2 - 120));
  menu.style.top = top + 'px'; menu.style.left = left + 'px';
  menu.classList.add('show');
}
function addAnnotation(color, noteText) {
  if (!selInfo) return;
  var ex = DBSTATE.notes.filter(function (n) { return n.si === selInfo.si && n.start === selInfo.start && n.len === selInfo.len; })[0];
  if (ex) { ex.color = color || ex.color; if (noteText !== undefined) ex.note = noteText; ex.ts = Date.now(); }
  else {
    DBSTATE.notes.push({
      id: uid(), si: selInfo.si, start: selInfo.start, len: selInfo.len,
      text: selInfo.text, color: color || 'y', note: noteText || '', ts: Date.now()
    });
  }
  saveState();
  rerenderChapter(selInfo.si).then(function () { buildNotes(); });
}
async function rerenderChapter(si) {
  if (!CHAPTERS[si]) return;
  var raw = await readZipText(BOOK.zip, chapterPath(si));
  var el = makeChapter(si);
  el.innerHTML = prepChapter(raw, si);
  var old = chapterEl(si);
  if (old && old.parentNode) old.parentNode.replaceChild(el, old);
  CHAPTERS[si] = { el: el, prep: raw };
  wrapNoteZone(si, el);
  applyAnnotations(si, el);
}

/* ============================================================
   16. 固定版式
   ============================================================ */
var FIXEDPAGE = 0;
async function renderFixedPage(si) {
  var host = $('book');
  var raw = await readZipText(BOOK.zip, chapterPath(si));
  var doc = parseHtml(raw);
  var body = doc.body;
  Array.prototype.forEach.call(body.querySelectorAll('img'), function (im) {
    var u = imgUrl(chapterPath(si), im.getAttribute('src') || '');
    if (u) im.setAttribute('src', u);
  });
  var w = body.style.width || doc.documentElement.style.width || '';
  host.innerHTML = '<div id="fixedwrap" style="' + (w ? 'width:' + w + ';max-width:100%;' : '') + '">' + body.innerHTML + '</div>';
  var wrap = $('fixedwrap');
  var imgs = wrap.querySelectorAll('img');
  if (imgs.length === 1) { imgs[0].style.maxWidth = '100%'; imgs[0].style.height = 'auto'; }
  FIXEDPAGE = si;
  $('sbName').textContent = t('pageOf', { i: si + 1, n: BOOK.spine.length });
  $('sbPct').textContent = Math.round((si + 1) / BOOK.spine.length * 100) + '%';
  $('progressbar').firstElementChild.style.width = ((si + 1) / BOOK.spine.length * 100) + '%';
  $('view').scrollTop = 0;
}

/* ============================================================
   17. 打开 / 书架
   ============================================================ */
async function openBook(book, opt) {
  opt = opt || {};
  BOOK = book;
  loadState(book.id);
  applyPrefs();
  $('empty').hidden = true;
  $('shelf').hidden = true;
  $('book').hidden = false;
  $('barTitle').textContent = book.meta.title;
  document.title = book.meta.title;
  $('q').placeholder = t('qPh');

  var p = DBSTATE.progress;
  if (opt.fresh || !p) {
    if (book.meta.fixed === 'pre-paginated') { renderFixedPage(0); curSi = 0; }
    else await gotoChapter(0, {});
  } else {
    if (book.meta.fixed === 'pre-paginated') { renderFixedPage(p.si || 0); curSi = p.si || 0; }
    else await gotoChapter(p.si || 0, { frac: p.frac || 0 });
  }
  buildToc(); buildMarks(); buildNotes();
  updateBars();
}

/* ---------- 书架封面 ----------
   ⚠ 绝对不能把 blob: URL 存进 IndexedDB。
   blob URL 的生命周期只跟创建它的那个 document 绑定 —— 页面一重载 / App 一重启就失效，
   封面会变成碎图标（导入当次会话看着正常，重启后必坏，所以很难被发现）。
   所以库里存的是封面的**字节**（coverData），渲染时现做一个 blob URL。 */
var _coverUrls = [];
function coverUrlOf(rec) {
  if (!rec) return '';
  if (rec.coverData) {
    try {
      var blob = (rec.coverData instanceof Blob) ? rec.coverData : new Blob([rec.coverData]);
      var u = URL.createObjectURL(blob);
      _coverUrls.push(u);
      return u;
    } catch (e) { return ''; }
  }
  // 兼容旧记录：blob: 那批已经失效（返回空 → 退回默认图标）；data: / http(s): 仍然可用
  if (rec.coverUrl && /^(data:|https?:)/i.test(rec.coverUrl)) return rec.coverUrl;
  return '';
}
function revokeCoverUrls() {
  _coverUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { } });
  _coverUrls = [];
}

/* 书架条目：只保留需要的字段。
   ⚠ 别把整条记录（含 epub 的 data，几 MB）塞进 SHELF —— 那会让电子书字节常驻内存。
   封面只带 coverData / coverUrl 两个原始字段，blob URL 留给 showShelf 现建。 */
function shelfItems(recs) {
  return (recs || []).map(function (r) {
    return { id: r.id, name: r.name, title: r.title, coverData: r.coverData, coverUrl: r.coverUrl };
  });
}

/* 老版本把失效的 blob: URL 存进了库，那批记录没有 coverData。
   这里在后台补一次：从库里的 epub 字节重新解析出封面并存进去，补完刷新书架。
   补过之后就有 coverData 了，不会重复跑。 */
async function repairCovers(recs) {
  var need = recs.filter(function (r) { return !r.coverData && r.data; });
  if (!need.length) return;
  var fixed = false;
  for (var i = 0; i < need.length; i++) {
    try {
      var b = await parseEpub(need[i].data, need[i].name);
      if (!b.coverUrl) continue;
      var cd = await (await fetch(b.coverUrl)).arrayBuffer();
      var r2 = await DB.get(need[i].id);
      if (!r2 || r2.coverData) continue;
      r2.coverData = cd;
      await DB.put(r2);
      fixed = true;
    } catch (e) { /* 单本失败不影响其它 */ }
  }
  if (fixed) {
    try {
      var recs2 = await DB.all();
      showShelf(shelfItems(recs2));
    } catch (e) { }
  }
}

function showShelf(list) {
  revokeCoverUrls();
  if (list) SHELF = list;
  else list = SHELF;
  BOOK = null; CHAPTERS = {}; TEXTIDX = null; rendered = [];
  $('book').hidden = true; $('book').innerHTML = '';
  $('barTitle').textContent = t('app');
  $('sbName').textContent = '—'; $('sbPct').textContent = '0%';
  $('progressbar').firstElementChild.style.width = '0';
  if (!list.length) { $('empty').hidden = false; $('shelf').hidden = true; return; }
  $('empty').hidden = true; $('shelf').hidden = false;
  $('shelfTitle').textContent = t('shelf');
  var grid = $('shelfGrid');
  grid.innerHTML = list.map(function (b) {
    // ⚠ 封面的 blob URL 必须在本函数里现建，不能由调用方建好再传进来：
    //   本函数第一行就 revokeCoverUrls() 撤上一轮的 URL，
    //   而参数是在调用之前求值的 —— 调用方建的会被当场撤掉，图片加载失败。
    var u = (b.cover !== undefined && b.cover !== null) ? b.cover : coverUrlOf(b);
    var cover = u ? '<img src="' + u + '" alt="">' : '&#128214;';
    return '<div class="shelf-item" data-id="' + esc(b.id) + '">' +
      '<div class="del" data-del="1">&#10005;</div>' +
      '<div class="cover">' + cover + '</div>' +
      '<div class="name">' + esc(b.title || b.name) + '</div></div>';
  }).join('');
  Array.prototype.forEach.call(grid.querySelectorAll('.shelf-item'), function (it) {
    it.addEventListener('click', async function (ev) {
      if (ev.target.getAttribute && ev.target.getAttribute('data-del')) {
        ev.stopPropagation();
        var id = it.getAttribute('data-id');
        await DB.del(id);
        try { localStorage.removeItem(KEYBOOK + id); } catch (e) { }
        var l = await DB.all();
        showShelf(shelfItems(l));
        return;
      }
      var id2 = it.getAttribute('data-id');
      var rec = await DB.get(id2);
      if (!rec) return;
      await importBuffer(rec.data, rec.name, { fromShelf: true });
    });
  });
}

async function importBuffer(buf, name, opt) {
  toast(t('loading'), 9000);
  try {
    var book = await parseEpub(buf, name);
    // 存书架。封面存**字节**而不是 blob: URL —— 后者活不过页面重载（见 coverUrlOf 处的说明）
    var coverData = null;
    if (book.coverUrl) {
      try { coverData = await (await fetch(book.coverUrl)).arrayBuffer(); } catch (e) { coverData = null; }
    }
    try {
      await DB.put({ id: book.id, name: name, title: book.meta.title, data: buf, added: Date.now(), coverData: coverData });
    } catch (e) { /* 隐私模式等，忽略 */ }
    hideNote(); closePanel();
    await openBook(book, {});
    toast(t('imported') + book.meta.title);
  } catch (e) {
    console.error(e);
    toast(t('importFail') + (e && e.message ? e.message : e), 4200);
  }
}

async function boot() {
  applyPrefs();
  loadFontsCss();
  wireUI();
  var list = [], okStore = true;
  try {
    var recs = await DB.all();
    list = shelfItems(recs);   // 封面 URL 由 showShelf 内部现建（见那儿的注释）
    repairCovers(recs);   // 后台给老记录补封面字节，补完自动刷新书架
  } catch (e) { okStore = false; }
  // 手机浏览器用 file:// 打开时，Chrome 会禁用 IndexedDB，
  // 这时书架存不住，但阅读功能完全正常，所以只提示、不阻断。
  if (!okStore) {
    var h = $('emptyHint');
    if (h) h.innerHTML = esc(t('emptyHint')) + '<br><span style="color:var(--fg-dim)">' +
      esc(t('noStore')) + '</span>';
  }
  showShelf(list);
}

/* ============================================================
   18. UI 绑定
   ============================================================ */
function openPanel(tab) {
  if (tab) switchTab(tab);
  $('panel').classList.add('show');
  $('scrim').classList.add('show');
}
function closePanel() {
  $('panel').classList.remove('show');
  $('scrim').classList.remove('show');
  hideModal();
}
function switchTab(name) {
  $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); });
  $$('.pane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === name); });
  if (name === 'search') setTimeout(function () { $('q').focus(); }, 60);
}

function hideModal() { $('modal').classList.remove('show'); }
function showModal(title, bodyHtml, buttons) {
  $('mdTitle').textContent = title;
  $('mdBody').innerHTML = bodyHtml;
  $('mdFoot').innerHTML = '';
  (buttons || []).forEach(function (b) {
    var el = document.createElement('button');
    el.className = 'btn' + (b.ghost ? ' ghost' : '');
    el.textContent = b.label;
    el.addEventListener('click', function () { b.onClick && b.onClick($('mdBody')); });
    $('mdFoot').appendChild(el);
  });
  $('modal').classList.add('show');
}

function buildSetPane() {
  var p = $('paneSet');
  function seg(name, cur, opts) {
    return '<div class="seg" data-name="' + name + '">' + opts.map(function (o) {
      return '<button data-v="' + o.v + '"' + (cur === o.v ? ' class="on"' : '') + '>' + o.t + '</button>';
    }).join('') + '</div>';
  }
  p.innerHTML =
    '<div class="set"><label>' + t('setTheme') + '</label><div class="ctrl">' +
    seg('theme', S.theme, [{ v: 'paper', t: t('themePaper') }, { v: 'night', t: t('themeNight') }]) + '</div></div>' +

    '<div class="set"><label>' + t('setFont') + '</label><div class="ctrl">' +
    '<select id="selFont">' + FONT_KEYS.map(function (k) {
      return '<option value="' + k + '"' + (S.font === k ? ' selected' : '') + '>' + t(FONT_LABEL[k]) + '</option>';
    }).join('') + '</select></div>' +
    '<div style="font-size:11px;color:var(--fg-dim);margin-top:6px">' + t('fontTip') + '</div></div>' +

    '<div class="set"><label>' + t('setSize') + '</label><div class="ctrl">' +
    '<input type="range" id="rSize" min="75" max="220" step="5" value="' + S.size + '">' +
    '<span class="val" id="vSize">' + S.size + '%</span></div></div>' +

    '<div class="set"><label>' + t('setLh') + '</label><div class="ctrl">' +
    '<input type="range" id="rLh" min="130" max="260" step="5" value="' + S.lh + '">' +
    '<span class="val" id="vLh">' + S.lh + '%</span></div></div>' +

    '<div class="set"><label>' + t('setPad') + '</label><div class="ctrl">' +
    '<input type="range" id="rPad" min="0" max="64" step="2" value="' + S.pad + '">' +
    '<span class="val" id="vPad">' + S.pad + 'px</span></div></div>' +

    '<div class="set"><label>' + t('setNote') + '</label><div class="ctrl">' +
    seg('noteZone', S.noteZone, [{ v: 'show', t: t('noteShow') }, { v: 'fold', t: t('noteFold') }, { v: 'hide', t: t('noteHide') }]) +
    '</div></div>' +

    '<div class="set"><label>' + t('setLang') + '</label><div class="ctrl">' +
    seg('lang', S.lang, [{ v: 'zh-CN', t: '简体中文' }, { v: 'en', t: 'English' }]) + '</div></div>' +

    '<div class="set"><label>' + t('dataZone') + '</label><div class="ctrl" style="flex-wrap:wrap;gap:8px">' +
    '<button class="btn ghost" id="btnResetProg" style="min-height:38px;padding:0 14px;font-size:13px">' + t('clearProgress') + '</button>' +
    '<button class="btn ghost" id="btnClearAll" style="min-height:38px;padding:0 14px;font-size:13px">' + t('clearAll') + '</button>' +
    '</div></div>';

  // 字号除了改 --b-* 变量，还要缩放正文基准字号
  function setSize(v) { S.size = v; prefs('size', v); $('vSize').textContent = v + '%'; $('book').style.fontSize = (v / 100 * 16) + 'px'; }
  function setLh(v) { S.lh = v; prefs('lh', v); $('vLh').textContent = v + '%'; document.documentElement.style.setProperty('--b-lh', (v / 100).toFixed(3)); }
  function setPad(v) { S.pad = v; prefs('pad', v); $('vPad').textContent = v + 'px'; document.documentElement.style.setProperty('--pad-x', v + 'px'); }

  $('rSize').addEventListener('input', function () { setSize(parseInt(this.value, 10)); });
  $('rLh').addEventListener('input', function () { setLh(parseInt(this.value, 10)); });
  $('rPad').addEventListener('input', function () { setPad(parseInt(this.value, 10)); });
  $('book').style.fontSize = (S.size / 100 * 16) + 'px';

  Array.prototype.forEach.call(p.querySelectorAll('.seg'), function (sg) {
    sg.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button[data-v]') : null;
      if (!b) return;
      var name = sg.getAttribute('data-name'), v = b.getAttribute('data-v');
      Array.prototype.forEach.call(sg.querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
      if (name === 'theme') { S.theme = v; prefs('theme', v); applyPrefs(); }
      else if (name === 'noteZone') { S.noteZone = v; prefs('noteZone', v); applyPrefs(); }
      else if (name === 'lang') {
        S.lang = v; prefs('lang', v); LANG = v;
        applyPrefs(); retranslate();
        buildSetPane(); buildToc(); buildMarks(); buildNotes();
      }
    });
  });
  $('selFont').addEventListener('change', function () { S.font = this.value; prefs('font', this.value); applyPrefs(); });
  $('btnResetProg').addEventListener('click', function () { DBSTATE.progress = null; saveState(); toast(t('progReset')); });
  $('btnClearAll').addEventListener('click', function () {
    showModal(t('clearAll'), t('clearAllAsk'), [
      { label: t('cancel'), ghost: true, onClick: hideModal },
      {
        label: t('ok'), onClick: async function () {
          try { await DB.clear(); } catch (e) { }
          try {
            Object.keys(localStorage).filter(function (k) { return k.indexOf(KEYBOOK) === 0 || k.indexOf(PREF) === 0; })
              .forEach(function (k) { localStorage.removeItem(k); });
          } catch (e) { }
          hideModal(); location.reload();
        }
      }
    ]);
  });
}

function retranslate() {
  $('emptyTitle').textContent = t('emptyTitle');
  $('emptyDesc').innerHTML = t('emptyDesc');
  $('emptyBtn').textContent = t('emptyBtn');
  $('emptyHint').textContent = t('emptyHint');
  $('btnPanel').setAttribute('title', t('tabToc'));
  $('btnSearch').setAttribute('title', t('tabSearch'));
  $('btnMark').setAttribute('title', t('tabMarks'));
  $('btnSet').setAttribute('title', t('tabSet'));
  $('q').placeholder = t('qPh');
  $('btnQ').textContent = t('go');
  var tabs = { toc: t('tabToc'), search: t('tabSearch'), marks: t('tabMarks'), notes: t('tabNotes'), set: t('tabSet') };
  $$('#tabs button').forEach(function (b) { b.textContent = tabs[b.getAttribute('data-tab')]; });
  if (!BOOK) $('barTitle').textContent = t('app');
  else { $('barTitle').textContent = BOOK.meta.title; }
  $('shelfTitle').textContent = t('shelf');
  document.title = BOOK ? BOOK.meta.title : t('app');
}

function wireUI() {
  buildSetPane();
  retranslate();

  $('btnPanel').addEventListener('click', function () { if (BOOK) openPanel('toc'); else openPanel('set'); });
  $('btnSet').addEventListener('click', function () { openPanel('set'); });
  $('btnSearch').addEventListener('click', function () {
    if (!BOOK) { toast(t('emptyHint')); return; }
    openPanel('search');
  });
  $('btnMark').addEventListener('click', function () { if (BOOK) toggleMark(); });
  $('scrim').addEventListener('click', closePanel);
  $$('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });
  $('npClose').addEventListener('click', hideNote);
  $('notepop').addEventListener('click', function (ev) {
    if (ev.target === $('notepop')) hideNote();
  });
  $('modal').addEventListener('click', function (ev) { if (ev.target === $('modal')) hideModal(); });

  // 导入
  $('btnImport').addEventListener('click', function () { $('fileInput').click(); });
  $('fileInput').addEventListener('change', async function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var buf = await f.arrayBuffer();
    await importBuffer(buf, f.name);
  });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', async function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    await importBuffer(await f.arrayBuffer(), f.name);
  });

  // 搜索
  var run = function () { doSearch($('q').value); };
  $('btnQ').addEventListener('click', run);
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); this.blur(); } });

  // 滚动
  var view = $('view');
  view.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', debounce(function () { updateBars(); }, 200));

  // 点击正文
  $('book').addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a') : null;
    if (!a) return;
    if (a.hasAttribute('data-ext')) { ev.preventDefault(); window.open(a.getAttribute('data-ext'), '_blank'); return; }

    var chEl = a.closest ? a.closest('.chapter') : null;
    if (!chEl) return;
    var si = parseInt(chEl.getAttribute('data-si'), 10);

    // 注释区 -> 正文原处
    var back = a.getAttribute('data-back');
    if (back !== null) {
      ev.preventDefault();
      var t = findNoteNode(si, back);
      if (t) { scrollToEl(t); flashEl(t); }
      else toast(t('fragMiss'));
      return;
    }
    // 正文角标 -> 注释弹窗
    var nid = a.getAttribute('data-note');
    if (nid !== null) { ev.preventDefault(); showNote(si, a, nid); return; }

    var g = a.getAttribute('data-goto');
    if (g !== null) {
      ev.preventDefault();
      gotoChapter(parseInt(g, 10), a.getAttribute('data-frag') ? { frag: a.getAttribute('data-frag') } : {});
      return;
    }
    ev.preventDefault();
  });

  // 划词
  document.addEventListener('selectionchange', debounce(onSelection, 220));
  document.addEventListener('mouseup', function () { setTimeout(onSelection, 10); });
  document.addEventListener('touchend', function () { setTimeout(onSelection, 60); });

  $('selmenu').addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button') : null;
    if (!b) return;
    var act = b.getAttribute('data-act');
    $('selmenu').classList.remove('show');
    if (act && act.indexOf('hl-') === 0) { addAnnotation(act.slice(3)); toast(t('saved')); }
    else if (act === 'copy') {
      var txt = selInfo ? selInfo.text : '';
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast(t('copied')); }, function () { toast(t('copyFail')); });
      else toast(t('copyFail'));
      window.getSelection().removeAllRanges();
    } else if (act === 'note') {
      var info = selInfo;
      showModal(t('noteTitle'), '<textarea id="noteTa" placeholder="' + t('notePh') + '"></textarea>' +
        '<div style="margin-top:10px;font-size:12px;color:var(--fg-dim)">' + esc((info.text || '').slice(0, 90)) + '</div>', [
        { label: t('cancel'), ghost: true, onClick: function () { hideModal(); window.getSelection().removeAllRanges(); } },
        {
          label: t('ok'), onClick: function () {
            addAnnotation('y', ($('noteTa').value || '').trim());
            hideModal(); toast(t('noteSaved')); window.getSelection().removeAllRanges();
          }
        }
      ]);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closePanel(); hideNote(); $('selmenu').classList.remove('show'); }
  });

  // 点正文空白处收起顶栏/底栏
  var lastTap = 0;
  $('view').addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('a, mark.wb, .notetoggle')) return;
    if (window.getSelection && String(window.getSelection()).length) return;
    var now = Date.now();
    if (now - lastTap < 320) {
      S.zen = !S.zen;
      document.body.classList.toggle('zen', S.zen);
      if (S.zen) hideNote();
    }
    lastTap = now;
  });

  // 固定版式翻页：横向滑动
  var tx = 0, ty = 0;
  $('view').addEventListener('touchstart', function (e) {
    if (!BOOK || BOOK.meta.fixed !== 'pre-paginated') return;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  $('view').addEventListener('touchend', function (e) {
    if (!BOOK || BOOK.meta.fixed !== 'pre-paginated') return;
    if (!e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    gotoChapter(FIXEDPAGE + (dx < 0 ? 1 : -1), {});
  }, { passive: true });
}

/* ============================================================
   19. 对外接口（安卓壳 / 自动化调用）
   ============================================================ */
window.WB = {
  version: '1.0',
  loadBase64: function (b64, name) {
    var bin = atob(b64), len = bin.length, u8 = new Uint8Array(len);
    for (var i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return importBuffer(u8.buffer, name || 'book.epub');
  },
  /* 安卓壳用：文件由原生侧放到可访问的 URL 上，这里取回来（避免 base64 撑爆内存） */
  loadFromUrl: function (url, name) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (b) { return importBuffer(b, name || 'book.epub'); });
  },
  /* 安卓返回键：返回 true 表示已被阅读器消费掉，不用退出 App */
  onBack: function () {
    if ($('notepop').classList.contains('show')) { hideNote(); return true; }
    if ($('modal').classList.contains('show')) { hideModal(); return true; }
    if ($('selmenu').classList.contains('show')) { $('selmenu').classList.remove('show'); return true; }
    if ($('panel').classList.contains('show')) { closePanel(); return true; }
    if (S.zen) { S.zen = false; document.body.classList.remove('zen'); return true; }
    if (BOOK) { showShelf(SHELF); return true; }
    return false;
  },
  goto: function (si, opt) { return gotoChapter(si, opt || {}); },
  toc: function () { return BOOK ? BOOK.toc : []; },
  info: function () {
    return BOOK ? {
      title: BOOK.meta.title, creator: BOOK.meta.creator, language: BOOK.meta.language,
      chapters: BOOK.spine.length, tocNodes: BOOK.tocCount, fixed: BOOK.meta.fixed
    } : null;
  },
  setTheme: function (v) { S.theme = v; prefs('theme', v); applyPrefs(); },
  setFont: function (v, px) {
    if (v) { S.font = v; prefs('font', v); }
    if (px) { S.size = px; prefs('size', px); $('book').style.fontSize = (px / 100 * 16) + 'px'; }
    applyPrefs();
  },
  /* 内部接口：仅供离线自动化验证使用，不影响正常阅读 */
  _internals: {
    parseEpub: function (buf, name) { return parseEpub(buf, name); },
    setBook: function (b) { BOOK = b; if (b) { loadState(b.id); } return b; },
    prepChapter: function (raw, si) { return prepChapter(raw, si); },
    wrapNoteZone: wrapNoteZone,
    findNoteNode: findNoteNode,
    findAllNotes: findAllNotes,
    extractNote: extractNote,
    prepWithNote: function (raw, si, host) {
      // 返回该章全部注释的 {id, tag, text}，用于校验 2653 处注释能否全部取到
      host.innerHTML = prepChapter(raw, si);
      wrapNoteZone(si, host);
      var out = [];
      Array.prototype.forEach.call(host.querySelectorAll('a[data-note], a[data-back]'), function (a) {
        var isBack = a.hasAttribute('data-back');
        var nid = a.getAttribute(isBack ? 'data-back' : 'data-note');
        var node = host.querySelector('[id="c' + si + '__' + nid + '"]');
        var p = node ? (node.closest ? node.closest('p') : node.parentNode) : null;
        // 注释区锚点取"正文那一侧"的注文没有意义，只对正文角标取注文
        var text = isBack ? '' : extractNote(p);
        out.push({ id: nid, tag: (a.textContent || '').trim(), cls: a.className || '', back: isBack, text: text });
      });
      return out;
    },
    plainText: plainText,
    buildIndex: function () { return buildIndex(null); },
    doSearch: doSearch,
    tocIndex: function (src) { return tocIndex(src); },
    state: function () { return { BOOK: BOOK, S: S, DBSTATE: DBSTATE, TEXTIDX: TEXTIDX }; },
    openText: function (path) { return readZipText(BOOK.zip, path); }
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
