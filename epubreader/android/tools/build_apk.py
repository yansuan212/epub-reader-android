# -*- coding: utf-8 -*-
"""
构建 APK —— 只用 JDK + Android SDK build-tools，不需要 Gradle。

流程：
    aapt2 compile   ->  编译 res/
    aapt2 link      ->  生成资源表 + 打进 assets/
    javac           ->  编译 Java 源码（对 android.jar）
    d8              ->  生成 classes.dex
    合并 zip        ->  classes.dex 塞进 APK
    zipalign        ->  4 字节对齐（Android 11+ 对 resources.arsc 有硬性要求）
    apksigner       ->  用调试证书签名（首次会自动生成证书）

用法：
    python tools/build_apk.py
环境变量（不设就自动去常见位置找）：
    JAVA_HOME      JDK 17 目录
    ANDROID_HOME   Android SDK 目录（应含 build-tools/ 与 platforms/）
"""

import io
import os
import re
import shutil
import subprocess
import sys
import zipfile

IS_WIN = os.name == "nt"
HERE = os.path.dirname(os.path.abspath(__file__))
AND = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(AND, ".."))
BUILD = os.path.join(AND, "build")
DIST = os.path.join(ROOT, "dist")

MANIFEST = os.path.join(AND, "AndroidManifest.xml")
RES = os.path.join(AND, "res")
JAVA_SRC = os.path.join(AND, "java")
ASSETS = os.path.join(AND, "assets")
WEB_SRC = os.path.join(ROOT, "dist", "reader.html")

MIN_SDK = "24"
TARGET_SDK = "34"
OUT_NAME = "epub-reader-1.0.apk"

KEYSTORE = os.path.join(AND, "debug.keystore")
KS_PASS = "android"
KS_ALIAS = "androiddebugkey"

# 真实路径：走临时目录构建时，产物要拷回这里
REAL_ROOT = ROOT
REAL_AND = AND


# ------------------------------------------------- 非 ASCII 路径修正（Windows）
# aapt2.exe / zipalign.exe 是原生 C++ 程序，命令行里带中文路径会直接报
#     xxx: error: failed to open directory: 系统找不到指定的文件。 (2).
# （同一份文件放到纯英文路径下就正常，与文件本身无关）
# 所以只要项目路径含非 ASCII 字符，就把构建整体搬到系统临时目录里跑，
# 结束时把 APK 和调试证书拷回来。用户不必把项目挪到英文路径。
STAGED = False
STAGE_DIR = None
# 传给外部命令的环境（含 JAVA_HOME），在 main() 里定位到 JDK 后填好
CHILD_ENV = None


def _copy_into(src, dst):
    if os.path.isdir(src):
        if os.path.isdir(dst):
            shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(src, dst)
    elif os.path.isfile(src):
        d = os.path.dirname(dst)
        if d:
            os.makedirs(d, exist_ok=True)
        shutil.copy2(src, dst)


def _stage():
    global AND, ROOT, BUILD, DIST, MANIFEST, RES, JAVA_SRC, ASSETS, WEB_SRC, KEYSTORE
    global STAGED, STAGE_DIR
    if not (IS_WIN and not ROOT.isascii()):
        return
    import tempfile
    stage = os.path.join(tempfile.gettempdir(), "epubreader_build")
    if os.path.isdir(stage):
        shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage)
    _copy_into(os.path.join(AND, "res"), os.path.join(stage, "android", "res"))
    _copy_into(os.path.join(AND, "java"), os.path.join(stage, "android", "java"))
    _copy_into(MANIFEST, os.path.join(stage, "android", "AndroidManifest.xml"))
    _copy_into(WEB_SRC, os.path.join(stage, "dist", "reader.html"))
    _copy_into(os.path.join(ROOT, "web", "fonts"), os.path.join(stage, "web", "fonts"))
    if os.path.isfile(KEYSTORE):
        shutil.copy2(KEYSTORE, os.path.join(stage, "android", "debug.keystore"))

    STAGE_DIR = stage
    STAGED = True
    AND = os.path.join(stage, "android")
    ROOT = stage
    BUILD = os.path.join(AND, "build")
    DIST = os.path.join(stage, "dist")
    MANIFEST = os.path.join(AND, "AndroidManifest.xml")
    RES = os.path.join(AND, "res")
    JAVA_SRC = os.path.join(AND, "java")
    ASSETS = os.path.join(AND, "assets")
    WEB_SRC = os.path.join(DIST, "reader.html")
    KEYSTORE = os.path.join(AND, "debug.keystore")


_stage()


class Bad(Exception):
    pass


def log(s=""):
    print(s, flush=True)


def step(s):
    log("")
    log("== " + s)


def _decode(raw):
    """javac / d8 这类 Java 工具在中文 Windows 上输出的是 GBK，先按 UTF-8 试，失败退回本地编码。"""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("mbcs" if IS_WIN else "latin-1", "replace")


def run(cmd, **kw):
    pretty = " ".join('"%s"' % c if " " in c else c for c in cmd)
    print("   $ " + pretty, flush=True)
    # d8.bat / apksigner.bat 是批处理包装，靠 JAVA_HOME 找 java，
    # 所以即使脚本自己定位到了 JDK，也得显式把它塞进子进程环境。
    if CHILD_ENV is not None:
        kw.setdefault("env", CHILD_ENV)
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **kw)
    out = _decode(p.stdout)
    if out.strip():
        for line in out.strip().splitlines():
            print("     " + line)
    if p.returncode != 0:
        raise Bad("命令失败（退出码 %d）：%s" % (p.returncode, pretty))
    return out


def exe(name):
    return name + ".exe" if IS_WIN else name


def bat(name):
    return name + ".bat" if IS_WIN else name


# ------------------------------------------------------------------ 环境探测
def find_jdk():
    cands = []
    if os.environ.get("JAVA_HOME"):
        cands.append(os.environ["JAVA_HOME"])
    for base in (r"C:\Program Files\Eclipse Adoptium", r"C:\Program Files\Java",
                 r"C:\Program Files\Microsoft", r"C:\Program Files\Zulu",
                 r"C:\Program Files\Amazon Corretto", "/usr/lib/jvm",
                 os.path.expanduser("~/Library/Java/JavaVirtualMachines")):
        if os.path.isdir(base):
            for d in sorted(os.listdir(base)):
                cands.append(os.path.join(base, d))
    cands.append(os.path.join(os.environ.get("JAVA_HOME", ""), ""))
    for c in cands:
        jc = os.path.join(c, "bin", exe("javac"))
        if c and os.path.isfile(jc):
            return c
    # PATH 里找
    w = shutil.which("javac")
    if w:
        return os.path.dirname(os.path.dirname(w))
    return None


def find_sdk():
    cands = []
    for k in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if os.environ.get(k):
            cands.append(os.environ[k])
    cands += [r"C:\Android\sdk", r"C:\Android\Sdk",
              os.path.expanduser("~/Android/Sdk"),
              os.path.expanduser("~/Library/Android/sdk")]
    for c in cands:
        if c and os.path.isdir(os.path.join(c, "build-tools")):
            return c
    return None


def pick_build_tools(sdk):
    d = os.path.join(sdk, "build-tools")
    vers = [x for x in os.listdir(d) if os.path.isdir(os.path.join(d, x))]
    if not vers:
        raise Bad("build-tools 目录是空的，请执行：sdkmanager \"build-tools;%s.0.0\"" % TARGET_SDK)
    def key(v):
        return [int(n) for n in re.findall(r"\d+", v)]
    vers.sort(key=key)
    for v in reversed(vers):
        if os.path.isfile(os.path.join(d, v, exe("aapt2"))):
            return os.path.join(d, v), v
    raise Bad("在 %s 里找不到 aapt2" % d)


def pick_android_jar(sdk):
    d = os.path.join(sdk, "platforms")
    if not os.path.isdir(d):
        raise Bad("缺少 platforms 目录，请执行：sdkmanager \"platforms;android-%s\"" % TARGET_SDK)
    names = [x for x in os.listdir(d) if x.startswith("android-")]
    if not names:
        raise Bad("platforms 下没有任何 android-* 平台")
    names.sort(key=lambda v: [int(n) for n in re.findall(r"\d+", v)] or [0])
    for n in reversed(names):
        j = os.path.join(d, n, "android.jar")
        if os.path.isfile(j):
            return j, n
    raise Bad("找不到 android.jar")


# ------------------------------------------------------------------ 主流程
def main():
    log("=" * 66)
    log("  EPUB 阅读器 — APK 构建")
    log("=" * 66)

    jdk = find_jdk()
    sdk = find_sdk()
    if not jdk:
        log("")
        log("!! 没有找到 JDK。")
        log("   到 https://adoptium.net 装 Temurin 17，装完把 JAVA_HOME 指到安装目录，")
        log("   或者干脆重开一个命令行（安装包一般会自动配好）。")
        return 2
    if not sdk:
        log("")
        log("!! 没有找到 Android SDK（需要 build-tools 和 platforms）。")
        log("   设一个环境变量 ANDROID_HOME=C:\\Android\\sdk 后重试。")
        return 2

    global CHILD_ENV
    CHILD_ENV = dict(os.environ)
    CHILD_ENV["JAVA_HOME"] = jdk
    CHILD_ENV["PATH"] = os.path.join(jdk, "bin") + os.pathsep + CHILD_ENV.get("PATH", "")
    log("")
    log("  JAVA_HOME    已注入子进程环境（d8.bat / apksigner.bat 依赖它）")

    bt_dir, bt_ver = pick_build_tools(sdk)
    android_jar, plat = pick_android_jar(sdk)
    aapt2 = os.path.join(bt_dir, exe("aapt2"))
    zipalign = os.path.join(bt_dir, exe("zipalign"))
    apksigner = os.path.join(bt_dir, bat("apksigner"))
    d8 = os.path.join(bt_dir, bat("d8"))
    javac = os.path.join(jdk, "bin", exe("javac"))
    keytool = os.path.join(jdk, "bin", exe("keytool"))

    log("")
    log("  JDK          %s" % jdk)
    log("  SDK          %s" % sdk)
    log("  build-tools  %s" % bt_ver)
    log("  platform     %s" % plat)
    log("  android.jar  %s" % android_jar)

    for p, what in ((aapt2, "aapt2"), (zipalign, "zipalign"), (apksigner, "apksigner"),
                    (d8, "d8"), (javac, "javac"), (keytool, "keytool")):
        if not os.path.isfile(p):
            raise Bad("找不到 %s：%s" % (what, p))

    if not os.path.isfile(WEB_SRC):
        raise Bad("找不到 %s ，请先在项目根目录跑 python tools/build.py" % WEB_SRC)

    # ---------------- 准备 ----------------
    step("准备目录与内置资源")
    if os.path.isdir(BUILD):
        shutil.rmtree(BUILD)
    for d in (BUILD, os.path.join(BUILD, "gen"), os.path.join(BUILD, "classes"),
              os.path.join(BUILD, "dex"), DIST, ASSETS):
        os.makedirs(d, exist_ok=True)

    shutil.copy2(WEB_SRC, os.path.join(ASSETS, "index.html"))
    log("   reader.html -> assets/index.html  (%d KB)" % (os.path.getsize(WEB_SRC) // 1024))

    fonts_dir = os.path.join(ROOT, "web", "fonts")
    if os.path.isdir(fonts_dir):
        # 只搬字体和 fonts.css，README.txt 这类说明文件不进包
        keep = [f for f in os.listdir(fonts_dir)
                if f.lower().endswith((".ttf", ".otf", ".woff", ".woff2", ".css"))]
        if keep:
            dst = os.path.join(ASSETS, "fonts")
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            os.makedirs(dst)
            total = 0
            for f in keep:
                shutil.copy2(os.path.join(fonts_dir, f), os.path.join(dst, f))
                total += os.path.getsize(os.path.join(dst, f))
            log("   web/fonts -> assets/fonts（%d 个文件，%.1f MB）" % (len(keep), total / 1048576.0))

    for folder in sorted(os.listdir(RES)):
        if folder.startswith("mipmap-") and not os.listdir(os.path.join(RES, folder)):
            raise Bad("图标目录 %s 是空的，先跑 python android/tools/make_icons.py" % folder)

    # ---------------- 资源 ----------------
    step("aapt2 compile（编译资源）")
    reszip = os.path.join(BUILD, "res.zip")
    run([aapt2, "compile", "--dir", RES, "-o", reszip])

    step("aapt2 link（生成资源表 + 打包 assets）")
    base_apk = os.path.join(BUILD, "base.apk")
    # 必须把 res.zip 解开、以位置参数形式传 .flat 文件。
    # 不能写成 "-R res.zip"：-R 会让 aapt2 进入 overlay 模式，逐个报
    #   error: resource xxx does not override an existing resource
    # 因为我们是新建资源表，根本没有可覆盖的对象。
    flat_dir = os.path.join(BUILD, "flat")
    os.makedirs(flat_dir, exist_ok=True)
    flats = []
    with zipfile.ZipFile(reszip) as z:
        for it in z.infolist():
            if it.filename.endswith(".flat"):
                z.extract(it, flat_dir)
                flats.append(os.path.join(flat_dir, it.filename))
    if not flats:
        raise Bad("res.zip 里没有 .flat 文件")
    flats.sort()
    log("   .flat 文件 %d 个" % len(flats))
    run([aapt2, "link", "-o", base_apk,
         "-I", android_jar,
         "--manifest", MANIFEST,
         "-A", ASSETS,
         "--java", os.path.join(BUILD, "gen"),
         "--min-sdk-version", MIN_SDK,
         "--target-sdk-version", TARGET_SDK] + flats)

    # ---------------- Java ----------------
    step("javac（编译 Java）")
    java_files = []
    for dirpath, _, files in os.walk(JAVA_SRC):
        java_files += [os.path.join(dirpath, f) for f in files if f.endswith(".java")]
    for dirpath, _, files in os.walk(os.path.join(BUILD, "gen")):
        java_files += [os.path.join(dirpath, f) for f in files if f.endswith(".java")]
    if not java_files:
        raise Bad("没有找到任何 .java 文件")
    log("   源文件 %d 个" % len(java_files))
    run([javac, "-encoding", "UTF-8", "-source", "8", "-target", "8",
         "-bootclasspath", android_jar, "-Xlint:-options", "-nowarn",
         "-d", os.path.join(BUILD, "classes")] + java_files)

    # ---------------- dex ----------------
    step("d8（生成 classes.dex）")
    classes = []
    for dirpath, _, files in os.walk(os.path.join(BUILD, "classes")):
        classes += [os.path.join(dirpath, f) for f in files if f.endswith(".class")]
    log("   class 文件 %d 个" % len(classes))
    run([d8, "--release", "--min-api", MIN_SDK, "--lib", android_jar,
         "--output", os.path.join(BUILD, "dex")] + classes)
    dex = os.path.join(BUILD, "dex", "classes.dex")
    if not os.path.isfile(dex):
        raise Bad("d8 没有产出 classes.dex")
    log("   classes.dex  %d KB" % (os.path.getsize(dex) // 1024))

    step("合并 classes.dex 进 APK")
    unaligned = os.path.join(BUILD, "unaligned.apk")
    with zipfile.ZipFile(base_apk, "r") as zin, \
            zipfile.ZipFile(unaligned, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            # resources.arsc 必须保持不压缩（Android 11+ 的硬要求）
            if item.filename == "resources.arsc":
                item.compress_type = zipfile.ZIP_STORED
            zout.writestr(item, data)
        zi = zipfile.ZipInfo("classes.dex", (2020, 1, 1, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = 0o644 << 16
        zout.writestr(zi, open(dex, "rb").read())
    log("   unaligned.apk  %d KB" % (os.path.getsize(unaligned) // 1024))

    step("zipalign（4 字节对齐）")
    aligned = os.path.join(BUILD, "aligned.apk")
    run([zipalign, "-f", "-p", "4", unaligned, aligned])

    # ---------------- 签名 ----------------
    step("签名")
    if not os.path.isfile(KEYSTORE):
        log("   没有调试证书，自动生成一个（只用于本机安装，不上架）")
        run([keytool, "-genkeypair", "-keystore", KEYSTORE,
             "-storepass", KS_PASS, "-keypass", KS_PASS,
             "-alias", KS_ALIAS, "-keyalg", "RSA", "-keysize", "2048",
             "-validity", "10950",
             "-dname", "CN=WB EPUB Reader, OU=dev, O=local, L=, S=, C=CN"])

    out_apk = os.path.join(DIST, OUT_NAME)
    if os.path.exists(out_apk):
        os.remove(out_apk)
    run([apksigner, "sign",
         "--ks", KEYSTORE, "--ks-pass", "pass:" + KS_PASS,
         "--key-pass", "pass:" + KS_PASS, "--ks-key-alias", KS_ALIAS,
         "--v1-signing-enabled", "true", "--v2-signing-enabled", "true",
         "--out", out_apk, aligned])

    step("校验签名")
    run([apksigner, "verify", "--print-certs", out_apk])

    if STAGED:
        real_dist = os.path.join(REAL_ROOT, "dist")
        os.makedirs(real_dist, exist_ok=True)
        real_apk = os.path.join(real_dist, OUT_NAME)
        if os.path.exists(real_apk):
            os.remove(real_apk)
        shutil.copy2(out_apk, real_apk)
        real_ks = os.path.join(REAL_AND, "debug.keystore")
        if os.path.isfile(KEYSTORE) and not os.path.isfile(real_ks):
            shutil.copy2(KEYSTORE, real_ks)
            log("   调试证书已留存：%s" % real_ks)
        out_apk = real_apk

    size = os.path.getsize(out_apk)
    step("完成")
    log("   %s" % out_apk)
    log("   %.2f MB" % (size / 1048576.0))
    log("")
    log("   装到手机：把 APK 拷过去点一下装；或用 USB 调试跑")
    log("     adb install -r \"%s\"" % out_apk)
    log("")
    if STAGED:
        log("   注：项目路径含中文，aapt2 读不了，已在临时目录完成构建：")
        log("       %s" % STAGE_DIR)
        log("")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        log("")
        log("!! " + str(e))
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        log("")
        log("!! 外部命令失败：%s" % e)
        sys.exit(1)
