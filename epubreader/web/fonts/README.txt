开源字体放这里（可选）
========================================================================

把下载到的字体文件改名成下面这些名字，直接丢进这个目录就行：

  NotoSerifSC-Regular.otf    思源宋体（正文，最像纸质书）
  NotoSansSC-Regular.otf     思源黑体（标题清晰）
  LXGWWenKai-Regular.ttf     霞鹜文楷（偏手写的温柔感）

（粗体可选：NotoSerifSC-Bold.otf / NotoSansSC-Bold.otf，不放就用系统合成粗体）


下载地址
------------------------------------------------------------------------
1) 思源宋体 / 思源黑体（Noto CJK，SIL OFL 1.1）
   https://github.com/notofonts/noto-cjk/releases
   下载 "Serif" 里的 SC（简体） Regular，和 "Sans" 里的 SC Regular。
   注意选 **OTF / Static** 版本，不要选 Variable（老安卓 WebView 支持不好）。

2) 霞鹜文楷（LXGW WenKai，SIL OFL 1.1）
   https://github.com/lxgw/LxgwWenKai/releases
   推荐下 "LXGWWenKaiLite" 或 "LXGWWenKaiGB" 版本，比全量版小一半。


体积提醒（重要）
------------------------------------------------------------------------
中文全字库字体每个 10~25 MB。

  · 只做网页版试读：不放字体也完全没问题，手机自带的字体就够用。
  · 打包 APK：建议最多放一个（比如只要思源宋体），
    否则 APK 会从 1 MB 涨到 50 MB 以上。
  · 真想要"小巧又有变化"，可以只放霞鹜文楷的 Lite 版（约 8 MB）。


放好之后
------------------------------------------------------------------------
  · 网页版：重新打开 reader.html，设置 -> 正文字体 里就会多出这三项。
  · APK：重新跑一次 tools/build_apk.py，脚本会自动把本目录打进去。

字体文件不存在不会报错，只是设置里选了也会静默回落到系统字体。
