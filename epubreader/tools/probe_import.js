/* 诊断探针：复现「导入后无法阅读」。
   在 jsdom 中走完整链路：loadBase64 -> importBuffer -> openBook -> gotoChapter
   每一步都 try/catch 并打印，定位断链点。只读，不改任何源码。 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'dist', 'reader.html');
const EPUB = 'C:/Users/yansuan/Desktop/书/书.zip';

const log = (...a) => console.log(...a);

(async () => {
  if (!fs.existsSync(HTML)) { log('!! reader.html 不存在'); process.exit(1); }
  if (!fs.existsSync(EPUB)) { log('!! epub 不存在'); process.exit(1); }

  const buf = fs.readFileSync(EPUB);
  log('[0] epub 字节数 =', buf.length);

  const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
    url: 'http://localhost/reader.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.setImmediate = function (fn) {
        var a = [].slice.call(arguments, 1);
        return window.setTimeout(function () { fn.apply(null, a); }, 0);
      };
      var n = 0;
      window.URL.createObjectURL = function (b) { n++; return 'blob:jsdom/' + n + '/' + (b && b.size ? b.size : 0); };
      window.URL.revokeObjectURL = function () {};
      // 记录所有未捕获错误
      window.__errs = [];
      window.addEventListener('error', e => window.__errs.push('window.error: ' + (e.message || e)));
      window.addEventListener('unhandledrejection', e => window.__errs.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)));
    }
  });

  const w = dom.window;
  await new Promise(r => w.addEventListener('load', r, { once: true }));

  log('[1] window.WB =', typeof w.WB);
  log('[1] window.JSZip =', typeof w.JSZip);

  // loadBase64 要的是纯 base64（不含 dataURL 前缀），模拟 FileReader 结果里剥前缀后的字符串
  const b64 = buf.toString('base64');

  log('[2] 调用 WB.loadBase64 ...');
  try {
    await w.WB.loadBase64(b64, '书.zip');
    log('    loadBase64 返回 OK');
  } catch (e) {
    log('    !! loadBase64 抛错:', e && (e.stack || e));
  }

  // 给异步队列一点时间
  await new Promise(r => setTimeout(r, 2500));

  log('--- 导入后状态 ---');
  log('empty.hidden =', w.document.getElementById('empty') && w.document.getElementById('empty').hidden);
  log('book.hidden  =', w.document.getElementById('book') && w.document.getElementById('book').hidden);
  const content = w.document.getElementById('content');
  log('#content 子节点 =', content ? content.children.length : 'n/a');
  log('#content 文本长度 =', content ? (content.textContent || '').length : 'n/a');
  const book = w.document.getElementById('book');
  if (book) {
    log('#book 子节点 =', book.children.length);
    log('#book innerHTML 前 300 字 =', (book.innerHTML || '').slice(0, 300).replace(/\s+/g, ' '));
  }

  // 内部状态
  if (w.WB && w.WB._internals) {
    const I = w.WB._internals;
    log('internals keys =', Object.keys(I).join(','));
    try {
      log('BOOK.spine 长度 =', I.BOOK && I.BOOK.spine ? I.BOOK.spine.length : 'no BOOK');
      if (I.BOOK && I.BOOK.spine) log('spine[0..2] =', I.BOOK.spine.slice(0, 3).map(s => s.href || JSON.stringify(s)).join(' | '));
      if (I.BOOK && I.BOOK.zip) log('zip 文件数 =', Object.keys(I.BOOK.zip.files || {}).length);
    } catch (e) { log('读 internals 出错:', e.message); }
  }

  log('--- 捕获到的错误 ---');
  (w.__errs || []).forEach(e => log(' *', String(e).slice(0, 500)));
  if (!w.__errs || !w.__errs.length) log(' (无)');

  // 逐 section 体检
  log('--- 每个 section 的文字量 ---');
  Array.prototype.forEach.call(w.document.querySelectorAll('#book > section'), function (s) {
    var t = (s.textContent || '').replace(/\s/g, '');
    log('  data-si=' + s.getAttribute('data-si') + '  字数=' + t.length +
        '  loading=' + /chapter-loading/.test(s.innerHTML) +
        '  首40字=' + JSON.stringify(t.slice(0, 40)));
  });

  // 手动追加第二章，看是否能渲染
  log('--- 手动 goto 到第 8 章（应含正文）---');
  try {
    await w.WB.goto(8);
  } catch (e) { log('  WB.goto 报错:', e.message); }
  await new Promise(r => setTimeout(r, 2000));
  Array.prototype.forEach.call(w.document.querySelectorAll('#book > section'), function (s) {
    var t = (s.textContent || '').replace(/\s/g, '');
    log('  data-si=' + s.getAttribute('data-si') + '  字数=' + t.length + '  首40字=' + JSON.stringify(t.slice(0, 40)));
  });

  if (w.__errs && w.__errs.length) {
    // 打印完整栈
    log('--- 完整栈 ---');
    w.__errs.forEach(e => log(e));
  }

  process.exit(0);
})().catch(e => { log('探针自身异常:', e && e.stack || e); process.exit(1); });
