# EpubReader

一个 **Android 中文 EPUB 阅读器**：阅读内核用 HTML/JS 写，安卓端只是一个薄薄的 WebView 外壳。

**不用 Gradle、不用 Android Studio** —— 只靠 JDK 17 + Android SDK 的 build-tools，
几条命令就能从源码编译出可安装的 APK。

---

## 为什么做这个

现有的安卓阅读器要么体积庞大，要么对**中文电子书的注释**支持不好。

这个项目只围绕一个核心诉求：**点正文里的注释角标，弹出注文 —— 页面一动不动、不丢阅读位置。**

（中文老书大量使用"页内锚点"式注释，很多阅读器点一下就会跳走，回来时阅读位置已经丢了。）

## 功能

| 功能 | 说明 |
|---|---|
| **注释弹窗**（核心） | 点角标弹窗显示注文，**页面完全不移动**；弹窗里还带一截"正文原处"的上下文；章末注释区可折叠 |
| 三级目录 | 可折叠树，自动展开到当前位置并高亮；跳转**对准文章标题**而不是章节容器顶边 |
| 全文搜索 + 词频统计 | 跨全书搜索，显示"共 N 处、分布在 M 章"+ 上下文片段；也支持统计某个词在全书出现多少次 |
| 书签 / 高亮 / 笔记 | 4 色高亮、划词写笔记、复制；退出重进仍在原位 |
| 阅读进度记忆 | 关掉再打开回到原处 |
| 排版调节 | 字号 / 行距 / 页边距三个滑杆，实时生效并记住 |
| 主题 | **仅夜间 + 护眼纸色两套**（刻意不做日间模式） |
| 界面语言 | 简体中文 / English |
| 书架 | 导入多本书、显示封面 |
| 固定版式 EPUB | 识别 `pre-paginated`，按左右滑动翻页（漫画 / 绘本） |

## 下载

- **APK**：[`epubreader/dist/epub-reader-1.0.apk`](epubreader/dist/epub-reader-1.0.apk) — 约 87 KB，`minSdk 24`（Android 7.0+）
  自签名调试包，安装时需允许「未知来源」。
- 单文件网页版：跑 `python tools/build.py` 生成 `epubreader/dist/reader.html`，
  手机浏览器直接打开即可阅读（无需安装）。

## 自己编译

**环境**：JDK 17（Temurin）+ Android SDK 的 `build-tools` 与 `platforms;android-34`。
不需要 Gradle，也不需要 Android Studio。

```bash
winget install EclipseAdoptium.Temurin.17.JDK
# Android cmdline-tools 解压到 C:\Android\sdk\cmdline-tools\latest\
C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

**出包**：

```bash
cd epubreader
python tools/build.py            # src/ -> dist/reader.html（单文件阅读器）
python android/tools/build_apk.py # -> dist/epub-reader-1.0.apk
```

或者直接双击 `build_apk.bat`。构建脚本会自己去找 JDK 和 SDK，找不到会给出明确提示。

> 路径含中文也没问题：`aapt2` / `zipalign` 是原生程序、读不了非 ASCII 路径，
> 构建脚本检测到这种情况会自动把工程镜像到临时目录里编译，再把产物拷回来。

## 测试

内核有一整套**离线断言**（用 jsdom 加载真实的 `dist/reader.html` 跑真实代码，
不需要浏览器、不截图）：

```bash
node tools/verify.js        # 59 项
```

覆盖解析、注释提取（逐条核对锚点配对）、目录定位、全文索引与词频、端到端渲染。

## 项目结构

```
epubreader/
├─ src/                阅读器源码
│  ├─ index.html           骨架
│  ├─ reader.css           样式（含两套主题）
│  ├─ reader.js            内核：解析 / 排版 / 注释 / 搜索 / 标注
│  └─ vendor/jszip.min.js  ZIP 解压库（MIT）
├─ tools/
│  ├─ build.py             把 src/ 合成单文件 reader.html
│  ├─ verify.js            离线断言
│  ├─ serve.py             本地 HTTP 服务（开发模式用）
│  └─ analyze.py           EPUB 只读勘查
├─ android/            安卓外壳
│  ├─ java/.../MainActivity.java   只有几百行
│  ├─ res/                         图标、主题、字符串、网络安全配置
│  └─ tools/build_apk.py           不用 Gradle 的 APK 构建
├─ dist/               产物（APK 入库，reader.html 可重建故忽略）
└─ README.md           详细文档：构建、调试、踩过的坑
```

## 开发调试

阅读器 95% 是纯 HTML/JS，APK 只是外壳 —— 所以**绝大多数改动根本不用重新打包**。

最省事的一档：APK 内置了「开发模式」开关，打开后 WebView 不再加载内置副本，
而是从电脑上的 HTTP 服务取页面。**APK 只装一次**，之后改代码只要在手机上刷新。

具体用法、以及 `chrome://inspect` 远程调试、常见坑，都写在
[`epubreader/README.md`](epubreader/README.md) 里。

## 说明

- 本仓库**不包含任何电子书原文**。
- 阅读器的解析与渲染部分与书籍内容无关，可读任意标准 EPUB 2 / EPUB 3 文件。

## 许可证

尚未指定。
