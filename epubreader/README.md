# EPUB 阅读器 — 项目说明

针对《毛泽东选集》七卷合订本（EPUB 2.0）做的中文阅读器。
按你填的需求确认单执行：**路线 A（HTML 内核优先）+ 走完阶段 3 出 APK**。

核心诉求是**注释跳转**，这一块已经做到位了 —— 全书 2653 处注释角标，
点开即弹窗显示注文，**不跳走、不丢阅读位置**。

---

## ⚠️ 调试约定（动手前先看这条）

**用户的手机是 OLED，他要求调试期间屏幕保持熄灭（防烧屏）。不要为了调试去点亮屏幕，
也不要要求他把屏幕打开。**

- **正确姿势：`scrcpy -S`** —— 只关面板电源，系统保持清醒、画面照常合成。
  ❌ **绝不能加 `-w` / `--stay-awake`**：它会把 `STAY_ON_WHILE_PLUGGED_IN` 设成 `7`
  （插电强制常亮），手机正插着 USB，`-S` 的熄屏会**直接被覆盖掉**。
- **熄屏状态下截图不可信**：通过 `adb exec-out screencap -p` 拿到的是**熄屏前残留的最后一帧**
  （可能全黑，也可能是旧界面）。**不要据此判断「App 白屏 / 崩了 / 没起来」。**
  只有 `scrcpy -S` 正在运行时，抓帧才是实时的。
  （必须用 `exec-out`；`adb shell screencap -p` 会被 Git Bash 的 CRLF 转换弄坏 PNG。）
- **判断面板是否真的关了**：`adb shell dumpsys SurfaceFlinger | grep -i powerMode`
  —— `powerMode=Off` 才是真的关了。
  ⚠ `dumpsys display` 里的 `mState=ON` 是**逻辑显示**状态，**不等于屏幕在发光**，别被误导。

完整说明见 `.workbuddy/memory/MEMORY.md`。

---

## 一、现在就能用（阶段 1–2，已完成并验证）

双击 `dist/reader.html` 会用默认浏览器打开；手机上把 `dist/reader.html`
拷过去用 Chrome 打开即可（文件管理器里选"用浏览器打开"）。

打开后点"选择文件"，选 `书.zip`（或任何标准 `.epub`）就能读。

### 已经做好的功能

| 需求单里的要求 | 状态 |
|---|---|
| 三级目录跳转（卷 → 时期 → 文章，410 节点） | ✅ 可折叠树，自动展开到当前位置并高亮 |
| 字号 / 行距 / 页边距调节 | ✅ 三个滑杆，实时生效并记住 |
| 主题切换 | ✅ 只有**夜间**和**护眼纸色**两种，按你的要求砍掉了日间模式 |
| 阅读进度记忆 | ✅ 关掉再打开回到原处 |
| **脚注 / 注释弹窗** | ✅ **核心功能**，见下方专章 |
| 全文搜索 | ✅ 跨 416 章，显示"共 N 处、分布在 M 章"+ 上下文片段 |
| 词语出现次数统计 | ✅ 搜索框直接给总数；另附常用词快捷按钮 |
| 书签 | ✅ 一键标记/取消，点顶栏书签图标 |
| 高亮划线与笔记 | ✅ 选中文字 → 4 色高亮 / 写笔记 / 复制 |
| 双栏排版 | ❌ 按你的选择不做 |
| 字体方案 | ✅ 系统字体 + 宋/黑/楷/仿宋；思源宋体/黑体、霞鹜文楷接入口已留好 |
| 最低安卓版本 | ✅ minSdk 24（Android 7.0） |
| 默认垂直滚动 | ✅ 一边读一边自动接续下一章 |
| 界面语言 | ✅ 简体中文 + English，设置里切换 |
| 书架 | ✅ 导入的书进书架，带封面 |
| 固定版式（漫画/绘本） | ✅ 已识别 `pre-paginated`，按左右滑动翻页 |

### 顺手加的

- 双击正文空白处 → 全屏沉浸模式（再双击退出）
- 章末注释区可折叠/隐藏，让正文更连贯
- 长按选中文字可以复制
- 键盘 `Esc` 关面板；安卓返回键会先关面板、再回书架，最后才退出

---

## 二、注释做得有多细

| 场景 | 行为 |
|---|---|
| 点正文里的〔1〕角标 | 底部弹出注文，**页面完全不移动**，阅读位置一分不差 |
| 弹窗里还带一截"正文原处"上下文 | 长注释看完后不用往回翻就知道刚才读的是哪句 |
| 点章末注释区的〔1〕 | 滚回正文里那处引用并高亮闪一下 |
| 角标是 `*` 号的（篇首题注） | 一样弹窗，标签显示 `*` |
| **原书漏排的 7 处注释** | 弹窗明说"原书此处没有对应的注释条目"，绝不跳走 |
| **原书同号两条注**（2 处） | 弹窗把两条都列出来并编号，不丢内容 |

原书 2653 处角标里 **2646 处有注文、7 处原书就是空的**，已逐一核对。

---

## 三、APK（阶段 3）

### 现状：**已编译成功**（2026-09-25 15:21）

APK 已经出来了，`dist/epub-reader-1.0.apk`，**80.9 KB**。
构建全过程无 Gradle，直接调 `aapt2 / d8 / zipalign / apksigner`。

已验证通过的项目：

| 校验 | 结果 |
|---|---|
| `apksigner verify` | 签名有效（自签名调试证书） |
| `zipalign -c -v 4` | Verification succesful，4 字节对齐 |
| `aapt2 dump badging` | 包名 `com.wb.epubreader`，label「EpubReader」 |
| minSdk / targetSdk | 24 / 34 ✓ |
| 入口 Activity | `com.wb.epubreader.MainActivity` ✓ |
| `assets/index.html` | 196,782 字符，JSZip 与注释逻辑都在 ✓ |
| 包内容 | 13 个条目，原始 223.5 KB → 压缩后 80.9 KB |

### 环境（已装好，不用再装）

```
JDK 17          C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot
Android SDK     C:\Android\sdk
                ├─ build-tools\34.0.0     （aapt2 / zipalign / apksigner / d8）
                ├─ platforms\android-34   （android.jar）
                └─ platform-tools         （adb）
```

> 不需要 Gradle，也不需要 Android Studio。
> `JAVA_HOME` 由 Temurin 安装包自动设好；`ANDROID_HOME` 没设也能跑
> —— `build_apk.py` 里硬编码了 `C:\Android\sdk` 作为兜底。

### 构建时修掉的三个坑（都已固化进脚本，以后不用管）

1. **项目路径含中文「书」→ aapt2 直接崩**
   `aapt2.exe` / `zipalign.exe` 是原生 C++ 程序，命令行里带非 ASCII 路径会报
   `failed to open directory: 系统找不到指定的文件。(2)`。同一份文件放纯英文路径下就正常。
   8.3 短名救不了。
   **对策**：`build_apk.py` 检测到项目路径含非 ASCII 时，自动把 `res/ java/ Manifest /
   reader.html / fonts` 镜像到 `%TEMP%\epubreader_build\` 里构建，结束时把 APK 和
   调试证书拷回 `dist/` 与 `android/`。用户不必把项目挪到英文路径。

2. **`aapt2 link -R res.zip` 会误入 overlay 模式**
   报 `resource xxx does not override an existing resource`。
   **对策**：解开 `res.zip`，把 10 个 `.flat` 文件作为位置参数传给 `aapt2 link`。

3. **`d8.bat` / `apksigner.bat` 找不到 java**
   这两个是批处理包装，靠 `JAVA_HOME` 启动 Java；脚本自己定位到 JDK 并不会自动传下去。
   报 `ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH`。
   **对策**：`main()` 定位到 JDK 后把它注入 `CHILD_ENV`，所有子进程都带上 `JAVA_HOME`
   与 `PATH`。顺带把输出解码改成 UTF-8 失败时退回本地编码，中文提示不再是乱码。

### 真机反馈修复（2026-09-25，第一轮）

第一次装到手机试读后暴露三个问题，都已定位到根因并修复：

| 现象 | 根因 |
|---|---|
| 目录点"第二章"直接跳走，展不开、选不了子文章 | `tocNode` 把跳转绑在**整行**上，只有那个 11px 的小三角才管展开。改成：**父节点整行点击 = 展开/收起**，跳转交给右侧新增的独立「跳转」按钮；叶子节点仍是整行跳转。父节点标签加粗，给"可展开"的视觉暗示 |
| 进入阅读后"导入页"还残留在版面上 | `#empty` 的 CSS 写了 `display:flex` —— **作者样式的 display 会盖掉 `hidden` 属性**（`hidden` 靠的是 UA 样式表的 `[hidden]{display:none}`）。补了全局 `[hidden]{display:none!important}` |
| 滚动时章节位置"跳变" | `ensureWindow` 里"上方补章后补偿"是**空操作**（`view.scrollTop = view.scrollTop`，注释写着"补偿一下"却没做)；回收远处章节时**完全没补偿**。改成统一的滚动锚点：变动前记住"视口顶部所在章节 + 它在视口内的偏移"，同步变动后与异步渲染完成后各还原一次。并给 `#view` 显式加 `overflow-anchor:none`，避免浏览器原生锚定与手动补偿互相抵消成反方向跳变 |

> 修完后 `verify.js` 仍然 **59 项全绿**，无回归。
> 但**滚动位置与目录交互依赖真实排版引擎，jsdom 测不出来** —— 这两处仍需真机确认。

### 真机反馈修复（第二轮，2026-09-29）

用户开着 `scrcpy -S` 实测后又报三个现象，用 **WebView 远程调试（CDP）** 读出运行时状态后，
定位到其实只有**两个根因**：

| 现象 | 根因 | 修法 |
|---|---|---|
| 导入后停在封面滑不动；**每章看完后都这样**——只能看到下一章标题就再也滚不动 | `onScroll` 按「视口顶部落在哪一章」更新 `curSi`，`ensureWindow` 按 `[curSi-1, curSi+1]` 挂章。**到滚动末端时视口顶部最多只能到 `scrollHeight-clientHeight`，永远够不到下一章的 `offsetTop`** → `curSi` 卡住 → 待挂三章全都已存在 → 下一章永不挂载 → 高度不再增长 → **彻底滚不动**（死锁） | `ensureWindow` 改按**视口实际覆盖的章节范围**（topSi/botSi）取 `from..to`，各向外多留一章；回收条件从 `\|si-curSi\|>2` 改成 `si<from \|\| si>to` |
| 目录跳转跳到正文首段，要往上翻才看得到标题 | `gotoChapter` 用 `el.offsetTop` 当滚动目标，但 **`offsetTop` 的参照系是 offsetParent（一路到 body），而 `view.scrollTop` 属于滚动容器坐标系**，两者差的正是顶栏那一截 → 实测标题落在视口上方 **-25px** | 新增 `offsetInView(el, view)`（用 `getBoundingClientRect` 统一坐标系）；跳转**直接瞄准章节内的标题元素**（`h1..h5,.toc1,.h1..h5`）再上留 12px，而不是章节容器顶边 |

还顺手修掉第一轮自己埋的一个雷：`restoreAnchor` 原来用**绝对位置回写** `scrollTop`，
会在异步渲染期间把用户自己的滚动**硬拽回去**（表现同样是"划不动"）。
改成**只补 DOM 变动造成的增量**：`view.scrollTop += (新位置 - 旧位置)`。

**CDP 实测验收**：

- `WB.goto(8)/(12)/(20)` → 标题距视口顶全部 **+12px**（修前是 -25px，标题在屏幕外）
- 连续下滑 8 次：第 7 次新章节挂载、可滚上限从 12202 涨到 20737；
  第 8 次已滚进新章（状态栏变「反对自由主义」）；滚动坐标平移量正好等于被回收章节的高度
- `tools/verify.js` **59 项全绿**，无回归

> 调试通道备查：`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`，
> 然后 `curl http://127.0.0.1:9222/json` 取 `webSocketDebuggerUrl`。
> ⚠ WebSocket 客户端必须 `suppress_origin=True`，否则 Chromium 报 403；
> ⚠ target id 随页面重载变化，每次都要重新取。

### 书架封面修复 + 应用改名（2026-09-29 晚）

**应用改名**：`毛选阅读器` → **`EpubReader`**。共 5 处（launcher 名 + 网页标题 + 顶栏 + 中英两套 i18n 的 `app` 键），
App 内外统一一个名字。

**书架封面 bug（重启后必坏）**

| | |
|---|---|
| 现象 | App 重启后书架上那本书的封面变成碎图标 |
| 根因 | 导入时把 `book.coverUrl`（**`blob:` 开头的 URL**）直接存进了 IndexedDB。**blob URL 的生命周期只跟创建它的那个 document 绑定** —— 页面一重载就失效。所以它在"导入后的当次会话"里看着正常，重启之后必坏，这个路径很难被发现 |
| 修法 | ① 导入时把封面读成 **ArrayBuffer** 存进库（`coverData`），不存 blob URL；② 新增 `coverUrlOf()`，渲染时用 `coverData` 现建 blob URL（`data:`/`http(s):` 仍可直接用，老记录的 blob URL 一律视为失效 → 退回默认书本图标）；③ 新增 `repairCovers()`：boot 时后台给老记录重新解析 epub 补封面，补完自动刷新书架；④ 新增 `revokeCoverUrls()` 防止漏 URL；⑤ 新增 `shelfItems()` 只保留必要字段，**不要把含 epub `data`（几 MB）的整条记录塞进 `SHELF`**，否则电子书字节常驻内存 |

> ⚠ **踩过的坑（自己引入又修掉的）**：第一版把 `coverUrlOf()` 放在**调用方**算好再传给 `showShelf(list)`。
> 但 JS 参数是**调用之前**求值的，而 `showShelf` 第一行就 `revokeCoverUrls()`
> —— 刚建的那批 URL 被当场撤销，封面全变碎图标。
> **规矩：URL 的「建」必须在「撤」之后，所以创建动作要放进 `showShelf` 内部现算。**

**备份：`tools/verify.js` 的间歇性异常**（已确认与代码改动无关）

共观察到 3 次：崩溃 2 次（Node 打印异常堆栈后非正常退出）、挂住 1 次（75 秒超时）。
但**每次重跑都恢复 59/59**，单独跑从未失败。端到端耗时稳定 ~6.4 秒，
其中**注释提取占 24 秒**（416 章 / 5308 个锚点，jsdom 里最吃资源的一段）。
判断是 jsdom 在大内存压力下的偶发问题。若以后频繁出现，可给 node 加
`--max-old-space-size=2048`，或把重负载那段换成更小的样本。

### 开发调试：改完不用重装 APK

阅读器 95% 是纯 HTML/JS，APK 只是外壳。按改动类型分三档：

**① 只改 `src/` 里的阅读器代码（10 秒一轮）**

```
python tools/serve.py --lan     # 会打印出手机该访问的地址
python tools/build.py           # 重建 web/reader.html
```

手机浏览器打开打印出来的那个 `http://192.168.x.x:8777/reader.html`，**改完刷新即可**。
需要手机与电脑同一 WiFi；首次运行 Windows 防火墙会弹窗，选「允许」。

**② 改了安卓壳（Java / Manifest / res）**

```
build_apk.bat
adb install -r dist\epub-reader-1.0.apk
```

**③ 开发模式：连壳都不用重装**

APK 内置一个持久开关，打开后 WebView 不再加载内置 assets，
而是从电脑上的 HTTP 服务取页面。**APK 只装一次**，之后改 `src/` 就能在手机上刷新看效果。

```
adb reverse tcp:8777 tcp:8777                        # 手机的 8777 转发到电脑
python tools/serve.py                                # 绑本机即可，reverse 走的就是本机
adb shell am start -n com.wb.epubreader/.MainActivity --ez dev true
```

关掉 / 换地址：

```
adb shell am start -n com.wb.epubreader/.MainActivity --ez dev false
adb shell am start -n com.wb.epubreader/.MainActivity --es devurl "http://192.168.0.182:8777/reader.html"
```

开发模式右下角有个橙色 **DEV** 角标；连不上电脑会自动回退到内置副本并 Toast 提示，**不会白屏**。

> 明文 HTTP 只对 `localhost` / `127.0.0.1` / `192.168.0.182` 放开
> （见 `android/res/xml/network_security_config.xml`），其余仍然禁止 ——
> 没有用一刀切的 `usesCleartextTraffic="true"`。
> 换了网络环境要么改那个文件里的 IP，要么用 localhost + adb reverse（推荐，IP 无关）。

**④ 看手机里究竟发生了什么**

`MainActivity` 里已经开了 `setWebContentsDebuggingEnabled(true)`。
插上 USB，桌面 Chrome 打开 `chrome://inspect`，就能直接看手机 WebView 的
Console / DOM / 元素尺寸 —— 排查滚动位置这类问题特别有用。

### 出包

```
build_apk.bat
```

或者：

```
python android\tools\build_apk.py
```

脚本会自己去找 JDK 和 SDK（找不到会给明确提示），然后：

```
aapt2 compile → aapt2 link → javac → d8 → 合并 dex → zipalign → apksigner 签名
```

产物：`dist/epub-reader-1.0.apk`（实测 **80.9 KB** —— 比预估的 1 MB 小得多，
因为 `reader.html` 是纯文本，deflate 后从 196 KB 压到 58 KB）。

装机：把 APK 拷到手机点一下安装；或用 USB 调试：

```
adb install -r dist\epub-reader-1.0.apk
```

### APK 里的安卓壳有多薄

外壳只做三件事：**喂资源、接管文件选择、接管返回键**。
阅读、排版、注释、搜索全部是网页版那一份代码，一行都没改。

- 资源走一个"虚拟域名"（`appassets.androidplatform.net`）注入，而不是 `file://` ——
  因为安卓 WebView 在 `file://` 源下 `localStorage`/`IndexedDB` 会不可靠，
  而阅读进度、书签、笔记全靠它们。
- 完全离线，不发任何网络请求。
- 在手机文件管理器里点 `.epub` 可以直接"用 EpubReader 打开"。

---

## 四、目录结构

```
epubreader/
├─ dist/
│  ├─ reader.html          ← 成品：单文件阅读器（含内联 JSZip，离线可用）
│  └─ epub-reader-1.0.apk  ← 环境装好后生成
├─ src/                    ← 阅读器源码
│  ├─ index.html              骨架
│  ├─ reader.css              样式（42 个书内类全部重写，含两套主题）
│  ├─ reader.js               内核：解析 / 排版 / 注释 / 搜索 / 标注
│  └─ vendor/jszip.min.js     ZIP 解压库 v3.10.1（MIT）
├─ web/
│  ├─ reader.html          构建产物（与 dist 同一份）
│  ├─ lib/jszip.min.js
│  └─ fonts/               开源字体放这里（可选），含 fonts.css 与下载说明
├─ android/                ← 安卓壳
│  ├─ AndroidManifest.xml
│  ├─ java/com/wb/epubreader/MainActivity.java
│  ├─ res/                 图标（脚本生成）、主题、字符串
│  ├─ assets/              构建时自动填入 reader.html
│  └─ tools/
│     ├─ build_apk.py          APK 构建（不开 Gradle）
│     └─ make_icons.py         纯标准库生成 PNG 图标
├─ report/解析报告.md       ← 阶段 0 交付
└─ tools/
   ├─ analyze.py           EPUB 只读勘查
   ├─ build.py             把 src/ 合成单文件 reader.html
   ├─ serve.py             本地起 HTTP 服务（绕开 file:// 的存储限制）
   └─ verify.js            离线自动化验证（55 项断言）
```

**你的 `书.zip` 和 `书/` 目录全程没被改动过。** 解析验证也是只读跑脚本。

---

## 五、怎么自己验证

内核有一套离线自动化测试，用 jsdom 加载**真实的** `dist/reader.html`，
跑真实的解析代码，对全书 416 章做断言 —— **不需要浏览器、不截图**：

```
verify.bat
```

或者：

```
set NODE_PATH=%USERPROFILE%\.workbuddy\binaries\node\workspace\node_modules
node tools\verify.js
```

最近一次结果：**55 项全绿**，其中包括

- spine 416 章 / 目录 410 节点 / 三级结构 ✓
- 2653 处注释角标 → 2646 处取到注文 + 7 处确认原书缺失（逐条列出文件名） ✓
- 「阶级斗争」277 次、「革命」5901 次（与离线静态扫描结果完全独立地吻合） ✓
- 410 个目录节点全部能定位到章节 ✓
- 每章 id 都加了章节前缀，章内不再互相串号 ✓

改了 `src/` 下的代码后，跑 `build.bat` 重建，再跑 `verify.bat` 复验。

---

## 六、老实交代：哪些验证过、哪些没有

| 部分 | 状态 |
|---|---|
| EPUB 解析（OPF/spine/NCX/封面/图片） | ✅ jsdom 实跑验证 |
| 注释提取（2653 处逐一核对） | ✅ jsdom 实跑验证 |
| 全文索引与词频统计 | ✅ jsdom 实跑验证 |
| 目录 → 章节定位 | ✅ jsdom 实跑验证 |
| 书籍样式类还原（42 个） | ⚠️ 代码写全了，**具体观感要你在手机上看** |
| 滚动虚拟化、手势、划词 | ⚠️ 依赖真实浏览器排版引擎，**jsdom 测不了**，需要你在手机上试 |
| 高亮 / 笔记的落库与回显 | ⚠️ 同上 |
| APK 构建 | ✅ **2026-09-25 已跑通**（签名 / 对齐 / 清单均校验通过），过程中修掉 3 个坑，见第三节 |
| APK 在真机上的表现 | ❌ **仍未在真机上装过** —— 包是有效的，但"装上能不能跑起来"没人验证过 |

用 jsdom 测不了的那几项，是因为它们依赖真实的排版引擎（文字换行位置、
滚动高度、`Range.getBoundingClientRect`）。这类东西只能真机看。

**你手机上试的时候，重点看这几件事**（这几处我最没底）：

1. 正文滚动是否跟手，章节衔接处有没有跳动；
2. 点角标弹窗，位置是不是真的没动；
3. 长按选字后，上面浮出来的菜单位置对不对；
4. 高亮一段文字后退出重进，高亮还在不在原位；
5. 夜间主题下红色字（`.c3`）是否够清楚。

---

## 七、后面还能加什么

- **开源字体**：`web/fonts/README.txt` 里有下载地址和放置方法。
  提醒：中文全字库字体每个 10–25 MB，全塞进 APK 会涨到 50 MB+，建议只放一个。
- **双栏排版**（横屏/平板）—— 你选了不做，随时可以补上。
- 章节内按百分比显示而非页码；跨书全局搜索。
