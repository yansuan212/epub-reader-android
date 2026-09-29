/* ============================================================
   离线自动化验证（不需要浏览器、不截图）
   用 jsdom 加载真实的 dist/reader.html，跑真实的解析内核，
   对《毛泽东选集》全部 416 章做一次完整断言。

   运行：
     set NODE_PATH=C:\Users\yansuan\.workbuddy\binaries\node\workspace\node_modules
     node tools/verify.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
/* 电子书位置可能会变：原来是固定的 ../书.zip，但用户可能把它改名或挪走。
   依次探测几个常见位置（也支持命令行传路径：node tools/verify.js "D:\x\book.epub"）。 */
const BOOK_CANDS = [
  process.argv[2],
  path.resolve(ROOT, '..', '书.zip'),
  path.resolve(ROOT, '..', '书.epub'),
];
// 再兜底：往上两级（通常就是桌面）以及用户桌面里的任意 .epub
[path.resolve(ROOT, '..', '..'), path.join(require('os').homedir(), 'Desktop')].forEach(function (d) {
  try {
    fs.readdirSync(d).forEach(function (f) {
      if (/\.epub$/i.test(f)) BOOK_CANDS.push(path.join(d, f));
    });
  } catch (e) { }
});
const BOOKZIP = BOOK_CANDS.filter(Boolean).find(function (p) { return fs.existsSync(p); })
  || BOOK_CANDS[1];
const HTML = path.join(ROOT, 'dist', 'reader.html');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; fails.push(name); console.log('  \u2717 ' + name + (extra ? '   ' + extra : '')); }
}
function head(s) { console.log('\n' + s); }

(async function main() {
  console.log('='.repeat(64));
  console.log(' EPUB 阅读器内核 — 离线验证');
  console.log('='.repeat(64));

  if (!fs.existsSync(BOOKZIP)) { console.error('找不到 ' + BOOKZIP); process.exit(2); }
  if (!fs.existsSync(HTML)) { console.error('找不到 ' + HTML + '，请先运行 tools/build.py'); process.exit(2); }

  head('[1] 加载 reader.html（jsdom，执行真实脚本）');
  const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
    url: 'http://localhost/reader.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    // jsdom 自带的 setImmediate 不会触发（浏览器里根本没有这个 API），
    // JSZip 内部依赖它做异步解压，这里补一个真能跑的。
    beforeParse(window) {
      window.setImmediate = function (fn) {
        var a = Array.prototype.slice.call(arguments, 1);
        return window.setTimeout(function () { fn.apply(null, a); }, 0);
      };
      // jsdom 没有 URL.createObjectURL，补一个假实现，好让封面/插图那条代码路径真的被跑到
      var n = 0;
      window.URL.createObjectURL = function (b) { n++; return 'blob:jsdom/' + n + '/' + (b && b.size ? b.size : 0); };
      window.URL.revokeObjectURL = function () { };
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 300));

  ok('window.JSZip 已内联可用', typeof w.JSZip === 'function');
  ok('window.WB 对外接口存在', !!w.WB && w.WB.version === '1.0');
  ok('空态可见（首次打开无书）', w.document.getElementById('empty') && !w.document.getElementById('empty').hidden);

  head('[2] 解析 EPUB（书.zip 2.9MB）');
  const buf = fs.readFileSync(BOOKZIP);
  // 注意：必须在 jsdom 的 realm 里建 Uint8Array，否则 JSZip 的 instanceof 检查会失败
  const u8 = new w.Uint8Array(buf.length);
  u8.set(buf);
  const ab = u8.buffer;
  const t0 = Date.now();
  const book = await w.WB._internals.parseEpub(ab, '书.zip');
  const tParse = Date.now() - t0;
  w.WB._internals.setBook(book);

  ok('书名', book.meta.title === '毛泽东选集', '= ' + book.meta.title);
  ok('作者', book.meta.creator === '毛泽东', '= ' + book.meta.creator);
  ok('语言', book.meta.language === 'zh-CN', '= ' + book.meta.language);
  ok('spine 章节数 = 416', book.spine.length === 416, '= ' + book.spine.length);
  ok('目录节点数 = 410', book.tocCount === 410, '= ' + book.tocCount);
  ok('目录三层', (function () {
    let d = 0; (function w2(a, lv) { a.forEach(n => { d = Math.max(d, lv); if (n.kids) w2(n.kids, lv + 1); }); })(book.toc, 1); return d === 3;
  })());
  ok('顶级节点 7 卷', book.toc.filter(n => true).length === 7 && book.toc[0].label === '第一卷',
    '= ' + book.toc.map(n => n.label).join('/'));
  ok('封面已解出 blob URL', typeof book.coverUrl === 'string');
  ok('图片资源已 blob 化（5 张）', Object.keys(book.blobs).length >= 10, '= ' + Object.keys(book.blobs).length + ' 个键（含文件名短名）');
  ok('封面 URL 已生成', /^blob:/.test(book.coverUrl), '= ' + book.coverUrl);
  ok('非固定版式', !book.meta.fixed || book.meta.fixed !== 'pre-paginated');

  head('[3] 全书 416 章注释提取（本项目核心）');
  const host = w.document.createElement('div');
  w.document.body.appendChild(host);

  let nRef = 0, nAnchor = 0, nGot = 0, nMissing = 0, nBackAsRef = 0, nAnchorNotBack = 0;
  const missingList = [];

  const t1 = Date.now();
  for (let si = 0; si < book.spine.length; si++) {
    const raw = await w.WB._internals.openText(book.spine[si]);
    if (raw === null) continue;
    let list;
    try { list = w.WB._internals.prepWithNote(raw, si, host); }
    catch (e) { fail++; fails.push('第 ' + si + ' 章预处理抛异常: ' + e.message); continue; }

    list.forEach(n => {
      if (/\bzy\b/.test(n.cls)) {
        nRef++;
        if (n.back) nBackAsRef++;
        if (n.text) nGot++;
        else { nMissing++; missingList.push({ si: si, file: book.spine[si], id: n.id, tag: n.tag }); }
      } else if (/\bhl\b/.test(n.cls)) {
        nAnchor++;
        if (!n.back) nAnchorNotBack++;
      }
    });
  }
  const tNotes = Date.now() - t1;

  ok('正文注释引用数 = 2653', nRef === 2653, '= ' + nRef);
  ok('注释区锚点数 = 2655', nAnchor === 2655, '= ' + nAnchor);
  ok('正文角标全部走 data-note（走弹窗）', nBackAsRef === 0, '= ' + nBackAsRef);
  ok('注释区锚点全部走 data-back（走回跳）', nAnchorNotBack === 0, '= ' + nAnchorNotBack);
  ok('成功取到注释原文 = 2646', nGot === 2646, '= ' + nGot);
  ok('2646 + 7 = 2653（无遗漏）', nGot + nMissing === nRef);
  ok('原书缺失注释 = 7 处', nMissing === 7, '= ' + nMissing);
  ok('缺失项与离线分析完全一致', missingList.every(m => /Section(0427|0610|0650|0820|0838)\.xhtml/.test(m.file)),
    missingList.map(m => path.basename(m.file) + '#' + m.id).join(', '));
  ok('抽取速度可接受（<30s，jsdom 比真机慢约 5~10 倍）', tNotes < 30000, tNotes + ' ms');
  ok('全部 416 章无异常', fails.filter(f => /预处理抛异常/.test(f)).length === 0);

  // 找出「中国社会各阶级的分析」的真实章节号（不靠硬编码下标）
  let SI_SAMPLE = -1;
  (function find(a) { a.forEach(n => { if (n.label === '中国社会各阶级的分析') SI_SAMPLE = w.WB._internals.tocIndex(n.src); if (n.kids) find(n.kids); }); })(book.toc);

  head('[4] 单章细查：' + (SI_SAMPLE >= 0 ? book.spine[SI_SAMPLE] : '未找到') + '（中国社会各阶级的分析）');
  {
    ok('目录中定位到该篇', SI_SAMPLE >= 0, 'spine[' + SI_SAMPLE + ']');
    const raw = await w.WB._internals.openText(book.spine[SI_SAMPLE]);
    const tA = Date.now();
    const list = w.WB._internals.prepWithNote(raw, SI_SAMPLE, host);
    const tB = Date.now() - tA;
    const refs = list.filter(x => /\bzy\b/.test(x.cls));
    const anchors = list.filter(x => /\bhl\b/.test(x.cls));
    ok('该篇注释引用 18 条（* + 〔1〕~〔17〕）', refs.length === 18, '= ' + refs.length);
    ok('该篇 18 条注释全部可取', refs.filter(x => x.text).length === 18, '= ' + refs.filter(x => x.text).length);
    ok('该篇注释区锚点 18 个且都走回跳', anchors.length === 18 && anchors.every(x => x.back), '= ' + anchors.length);
    ok('DOM 中 data-back 数量与锚点数一致',
      host.querySelectorAll('a[data-back]').length === 18,
      '= ' + host.querySelectorAll('a[data-back]').length);
    ok('DOM 中 data-note 只出现在正文（18 - 注释区）',
      host.querySelectorAll('a[data-note]').length === 18,
      '= ' + host.querySelectorAll('a[data-note]').length);
    ok('首条为 * 号注（毛泽东此文是为反对…）',
      refs[0].tag === '*' && /毛泽东此文是为反对当时党内存在着的两种倾向而写的/.test(refs[0].text),
      JSON.stringify(refs[0].text.slice(0, 30)));
    ok('〔1〕注正确（国家主义派…）',
      /国家主义派指中国青年党/.test((refs.find(x => x.tag === '〔1〕') || {}).text || ''));
    ok('〔17〕注正确（三合会…）',
      /三合会、哥老会、大刀会/.test((refs.find(x => x.tag === '〔17〕') || {}).text || ''));
    ok('单章预处理 < 400ms（真机会更快）', tB < 400, tB + ' ms');
    const allIds = Array.from(host.querySelectorAll('[id]')).map(e => e.id);
    ok('id 已加章节前缀', allIds.length > 0 && allIds.every(i => i.indexOf('c' + SI_SAMPLE + '__') === 0),
      '前 3 个: ' + allIds.slice(0, 3).join(','));
    ok('章内无重复 id', new Set(allIds).size === allIds.length, allIds.length + ' 个 id');
    ok('所有锚点链接不再带 href（不会跳走丢位置）', host.querySelectorAll('a[href]').length === 0);
    ok('注释区已包成可折叠块', !!host.querySelector('.notewrap'));
    ok('正文文字未丢（>4000 字）', host.textContent.replace(/\s/g, '').length > 4000,
      '= ' + host.textContent.replace(/\s/g, '').length + ' 字');
  }

  head('[5] 全文索引与词频统计');
  const t2 = Date.now();
  const idx = await w.WB._internals.buildIndex();
  const tIdx = Date.now() - t2;
  ok('索引覆盖 416 章', idx.length === 416 && idx.every(x => typeof x === 'string'), '= ' + idx.length);
  ok('索引总字数 > 180 万', idx.join('').length > 1800000, '= ' + idx.join('').length);
  ok('索引用时 < 40s', tIdx < 40000, tIdx + ' ms');

  function countWord(word) {
    let n = 0;
    for (const tx of idx) { let f = 0; while ((f = tx.indexOf(word, f)) >= 0) { n++; f += word.length; } }
    return n;
  }
  const c1 = countWord('阶级斗争');
  const c2 = countWord('革命');
  const c3 = countWord('毛泽东');
  ok('「阶级斗争」全书出现 277 次', c1 === 277, '= ' + c1);
  ok('「革命」全书出现 5901 次', c2 === 5901, '= ' + c2);
  console.log('      参考：毛泽东 ' + c3 + ' 次');

  // 走一遍 UI 搜索路径
  w.document.getElementById('q').value = '阶级斗争';
  await w.WB._internals.doSearch('阶级斗争');
  const statTxt = w.document.getElementById('searchStats').textContent;
  const items = w.document.querySelectorAll('#searchList .item').length;
  ok('搜索面板显示命中数与章数', /277/.test(statTxt) && /82/.test(statTxt), '= ' + statTxt.trim());
  ok('结果按章聚合（82 条，与命中章数一致）', items === 82, '= ' + items + ' 条');
  ok('结果片段带高亮标记', w.document.querySelectorAll('#searchList mark').length === items, '= ' + items);

  head('[6] 目录 -> 章节定位');
  {
    let bad = 0, checked = 0;
    (function walk(a) {
      a.forEach(n => {
        const i = w.WB._internals.tocIndex(n.src);
        checked++;
        if (i === undefined || i < 0 || i >= book.spine.length) { bad++; if (bad < 4) console.log('        未定位: ' + n.label + ' -> ' + n.src); }
        if (n.kids) walk(n.kids);
      });
    })(book.toc);
    ok('410 个目录节点全部能定位到章节', checked === 410 && bad === 0, checked + ' 个，失败 ' + bad);
  }

  head('[7] 重复注释号（原书缺陷）能否拿到全部注文');
  {
    const cases = [{ file: 'Section0820.xhtml', id: 'id22a', expect: 2, kw: '刘建勋' },
                   { file: 'Section0838.xhtml', id: 'id3a', expect: 2, kw: '十条' }];
    for (const c of cases) {
      const si = book.spine.findIndex(h => h.endsWith(c.file));
      ok('定位到 ' + c.file, si >= 0, 'spine[' + si + ']');
      const raw = await w.WB._internals.openText(book.spine[si]);
      w.WB._internals.prepWithNote(raw, si, host);
      const ns = w.WB._internals.findAllNotes(si, c.id, host);
      ok(c.file + ' #' + c.id + ' 取到 ' + c.expect + ' 条注文', ns.length === c.expect, '= ' + ns.length);
      ok(c.file + ' 第二条未丢失（含「' + c.kw + '」）', ns.some(x => x.indexOf(c.kw) >= 0),
        JSON.stringify((ns[1] || '').slice(0, 20)));
    }
    // 全书扫一遍，确认"同一注释号多条注"的情况只有这两处
    let dupChapters = 0;
    for (let si = 0; si < book.spine.length; si++) {
      const raw = await w.WB._internals.openText(book.spine[si]);
      if (!raw) continue;
      const list = w.WB._internals.prepWithNote(raw, si, host);
      const ids = list.filter(x => x.back).map(x => x.id);
      if (new Set(ids).size !== ids.length) dupChapters++;
    }
    ok('全书重复注释号的章节数 = 2', dupChapters === 2, '= ' + dupChapters);
  }

  /* ---------- [8] 端到端回归：真实「导入 → DOM 里真的有正文」 ----------
     之前的 55 项都是绕过 UI 直接调 internals，因此漏掉了
     「gotoChapter 建了空 section 后 renderChapter 被短路」这类装配 bug。
     这里起一个干净 jsdom，走 loadBase64 真实入口，断言 DOM 里有正文。 */
  head('[8] 端到端：导入 epub 后 #book 里必须有正文（回归 白屏 bug）');
  {
    const fs2 = require('fs');
    const dom2 = new JSDOM(fs2.readFileSync(HTML, 'utf8'), {
      url: 'http://localhost/reader.html', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(window) {
        window.setImmediate = function (fn) {
          var a = [].slice.call(arguments, 1);
          return window.setTimeout(function () { fn.apply(null, a); }, 0);
        };
        var n = 0;
        window.URL.createObjectURL = function (b) { n++; return 'blob:e2e/' + n + '/' + (b && b.size ? b.size : 0); };
        window.URL.revokeObjectURL = function () {};
        window.__errs = [];
        window.addEventListener('error', e => window.__errs.push('error: ' + (e.message || e)));
        window.addEventListener('unhandledrejection', e => window.__errs.push('rej: ' + (e.reason && e.reason.stack || e.reason)));
      }
    });
    const w2 = dom2.window;
    await new Promise(r => w2.addEventListener('load', r, { once: true }));

    const epubPath = fs.existsSync(BOOKZIP) ? BOOKZIP : 'C:/Users/yansuan/Desktop/书/书.zip';
    if (require('fs').existsSync(epubPath)) {
      const t0 = Date.now();
      await w2.WB.loadBase64(require('fs').readFileSync(epubPath).toString('base64'), '书.zip');
      // 等异步渲染队列
      await new Promise(r => setTimeout(r, 3000));
      const book = w2.document.getElementById('book');
      const secs = book ? book.querySelectorAll('section.chapter') : [];
      const txt = book ? (book.textContent || '').replace(/\s/g, '') : '';
      // 开篇是封面（0 字）+ 题词（12 字），文字少是原书结构，不能拿它当白屏判据。
      // 先看默认打开位置确实装配出了 DOM（这是本次 bug 的核心症状），
      // 再跳到正文首章验证真的有大量文字。
      ok('#book 里建出了章节 section（打开就有 DOM）', secs.length >= 1, secs.length + ' 个');
      ok('封面 <image> 已换成 blob（不再指向包内相对路径）',
        /<image[^>]*xlink:href="blob:/.test(book ? book.innerHTML : ''),
        (book && /xlink:href="([^"]*)"/.exec(book.innerHTML) || [,''])[1].slice(0, 30));

      // 跳到正文首章
      let SI_TXT = -1;
      (function find(a) { a.forEach(n => { if (n.label && n.label.indexOf('中国社会各阶级的分析') >= 0) SI_TXT = w2.WB._internals.tocIndex(n.src); if (n.kids) find(n.kids); }); })(w2.WB.toc());
      if (SI_TXT < 0) SI_TXT = 8;
      await w2.WB.goto(SI_TXT);
      await new Promise(r => setTimeout(r, 2500));
      const book2 = w2.document.getElementById('book');
      const secs2 = book2 ? book2.querySelectorAll('section.chapter') : [];
      let maxLen = 0, probe = '';
      for (const s of secs2) {
        const tt = (s.textContent || '').replace(/\s/g, '');
        if (tt.length > maxLen) { maxLen = tt.length; probe = tt.slice(0, 40); }
      }
      ok('跳到正文后某一章渲染出大量文字（不是白屏）', maxLen > 3000, maxLen + ' 字：' + probe);
      ok('渲染期间无未捕获错误', w2.__errs.length === 0, w2.__errs.slice(0, 2).join(' | ') || '无');
      console.log('      端到端耗时 ' + (Date.now() - t0) + ' ms');
      w2.close();
    } else {
      console.log('      (跳过：未找到 书.zip)');
    }
  }

  head('[9] 结论');
  console.log('  解析用时      ' + tParse + ' ms');
  console.log('  注释提取用时  ' + tNotes + ' ms（416 章，5308 个锚点）');
  console.log('  索引用时      ' + tIdx + ' ms');
  console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail) { console.log('  失败项：'); fails.forEach(f => console.log('    - ' + f)); }

  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\n验证脚本异常：', e); process.exit(3); });
