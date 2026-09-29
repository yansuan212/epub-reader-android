package com.wb.epubreader;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * EPUB 阅读器 —— 安卓外壳。
 *
 * 设计取向：外壳尽量薄。
 *   · 阅读、排版、注释、搜索全部在 WebView 里的 reader.html 中完成（与网页版同一份代码）。
 *   · 外壳只做三件事：把内置资源喂给 WebView、接管文件选择、接管返回键。
 *
 * 不用 Gradle / 不用 AndroidX，只用 android.jar + build-tools，
 * 所以只需要装 JDK17 + cmdline-tools 就能编译出 APK。
 *
 * 资源通过一个"虚拟域名"注入（appassets.androidplatform.net），
 * 而不是用 file:// —— 因为 file:// 源在 Android WebView 下
 * localStorage / IndexedDB 会不可靠，而阅读进度、书签、笔记都靠它们。
 */
public class MainActivity extends Activity {

    /** 虚拟域名。requests 全部在本进程内拦截，不会真的联网。 */
    private static final String HOST = "appassets.androidplatform.net";
    private static final String BASE = "https://" + HOST + "/";
    private static final String START = BASE + "index.html";

    /** 外部打开的文件会被拷进私有缓存，用固定文件名，避免路径穿越 */
    private static final String CACHE_NAME = "imported.epub";

    private static final int REQ_FILE = 0x2711;

    /* ---------------- 开发模式（第 5 层：改完代码只需刷新，不必重装） ----------------
       打开后 WebView 不再加载内置 assets，而是从电脑上的 HTTP 服务取 reader.html。
       开关会持久化，重启 App 依然生效。

       开 / 关（改完立刻生效）：
           adb shell am start -n com.wb.epubreader/.MainActivity --ez dev true
           adb shell am start -n com.wb.epubreader/.MainActivity --ez dev false

       换地址（比如不想插线、走局域网）：
           adb shell am start -n com.wb.epubreader/.MainActivity --es devurl "http://192.168.0.182:8777/reader.html"

       推荐配合 adb reverse 用 localhost —— 这样电脑换网络、换 IP 都不用改地址：
           adb reverse tcp:8777 tcp:8777

       连不上电脑时会自动退回内置副本并提示，不会白屏。
       ---------------------------------------------------------------------------- */
    private static final String PREF_DEV = "devMode";
    private static final String PREF_DEV_URL = "devUrl";
    private static final String DEV_URL_DEFAULT = "http://localhost:8777/reader.html";

    private boolean devMode = false;
    private String devUrl = DEV_URL_DEFAULT;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean pageReady = false;
    private String pendingUrl = null;
    private String pendingName = null;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        SharedPreferences sp = getSharedPreferences("wb", MODE_PRIVATE);
        applyDevIntent(getIntent(), sp);
        devMode = sp.getBoolean(PREF_DEV, false);
        devUrl = sp.getString(PREF_DEV_URL, DEV_URL_DEFAULT);

        web = new WebView(this);
        web.setBackgroundColor(0xFFF4ECD8);
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);                 // 字号完全由阅读器自己控制，避免系统字体设置二次缩放
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);        // 不走 file://，全部用虚拟域名
        s.setAllowContentAccess(false);
        s.setLoadsImagesAutomatically(true);
        // 开发模式必须每次都拿最新的一份，绝不能吃缓存
        s.setCacheMode(devMode ? WebSettings.LOAD_NO_CACHE : WebSettings.LOAD_DEFAULT);
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            s.setSafeBrowsingEnabled(false);
        }
        WebView.setWebContentsDebuggingEnabled(true);   // 需要时可用 chrome://inspect 调试

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return serve(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // 只允许虚拟域名（以及开发模式下的调试地址），其它一律用系统浏览器打开
                String h = req.getUrl().getHost();
                if (HOST.equals(h)) return false;
                if (devMode && h != null && h.equals(devHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                pageReady();
                if (devMode && url != null && url.startsWith("http")) markDev(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req,
                                        android.webkit.WebResourceError err) {
                // 开发模式连不上电脑时回退到内置副本，别让 App 变成白屏
                if (!devMode || req == null || !req.isForMainFrame()) return;
                Toast.makeText(MainActivity.this,
                        "开发模式加载失败，已回退到内置版本（电脑上的 serve.py 起了吗？）",
                        Toast.LENGTH_LONG).show();
                devMode = false;
                view.loadUrl(START);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");   // 用 */* 才不会把 .zip 后缀的 epub 藏起来
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "application/epub+zip", "application/zip", "application/octet-stream"});
                try {
                    startActivityForResult(Intent.createChooser(i, "选择 EPUB 文件"), REQ_FILE);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        if (saved == null) {
            if (devMode) {
                Toast.makeText(this, "开发模式：" + devUrl, Toast.LENGTH_LONG).show();
                web.loadUrl(devUrl);
            } else {
                web.loadUrl(START);
            }
        }
        handleViewIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        // adb 传来的开发模式开关：一变就立刻重新加载，不用杀进程重开
        SharedPreferences sp = getSharedPreferences("wb", MODE_PRIVATE);
        boolean wasDev = devMode;
        String wasUrl = devUrl;
        applyDevIntent(intent, sp);
        devMode = sp.getBoolean(PREF_DEV, false);
        devUrl = sp.getString(PREF_DEV_URL, DEV_URL_DEFAULT);
        if (wasDev != devMode || !devUrl.equals(wasUrl)) {
            Toast.makeText(this, devMode ? "开发模式：" + devUrl : "已关闭开发模式",
                    Toast.LENGTH_LONG).show();
            web.getSettings().setCacheMode(
                    devMode ? WebSettings.LOAD_NO_CACHE : WebSettings.LOAD_DEFAULT);
            web.loadUrl(devMode ? devUrl : START);
            return;
        }
        handleViewIntent(intent);
    }

    /** 从文件管理器"用其他应用打开"进来的 epub */
    private void handleViewIntent(Intent it) {
        if (it == null || !Intent.ACTION_VIEW.equals(it.getAction())) return;
        Uri u = it.getData();
        if (u == null) return;
        try {
            File dst = new File(getCacheDir(), CACHE_NAME);
            InputStream in = getContentResolver().openInputStream(u);
            if (in == null) return;
            OutputStream os = new FileOutputStream(dst);
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) os.write(b, 0, n);
            os.close();
            in.close();
            pendingUrl = BASE + "cache/" + CACHE_NAME;
            pendingName = guessName(u);
            pageReady();
        } catch (Exception ignored) {
        }
    }

    private String guessName(Uri u) {
        String s = u.getLastPathSegment();
        if (s == null || s.length() == 0) return "book.epub";
        int i = s.lastIndexOf('/');
        if (i >= 0) s = s.substring(i + 1);
        return s;
    }

    private void pageReady() {
        if (!pageReady || pendingUrl == null || web == null) return;
        final String u = jsStr(pendingUrl), n = jsStr(pendingName);
        pendingUrl = null;
        web.evaluateJavascript("window.WB && WB.loadFromUrl(" + u + ", " + n + ")", null);
    }

    private static String jsStr(String s) {
        if (s == null) return "''";
        StringBuilder sb = new StringBuilder("'");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '\'': sb.append("\\'"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\u2028': sb.append("\\u2028"); break;
                case '\u2029': sb.append("\\u2029"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('\'').toString();
    }

    /* ---------------- 开发模式辅助 ---------------- */

    /** 处理 adb 传来的开发模式开关；会持久化，下次启动仍然生效 */
    private void applyDevIntent(Intent it, SharedPreferences sp) {
        if (it == null) return;
        SharedPreferences.Editor e = sp.edit();
        boolean changed = false;
        if (it.hasExtra("dev")) {
            e.putBoolean(PREF_DEV, it.getBooleanExtra("dev", false));
            changed = true;
        }
        String u = it.getStringExtra("devurl");
        if (u != null && u.length() > 0) {
            e.putString(PREF_DEV_URL, u);
            changed = true;
        }
        if (changed) e.apply();
    }

    /** 开发地址里的主机名（用于放行 WebView 内部跳转） */
    private String devHost() {
        try {
            return Uri.parse(devUrl).getHost();
        } catch (Exception e) {
            return null;
        }
    }

    /** 开发模式挂个角标，免得分不清当前跑的是哪一份代码 */
    private void markDev(WebView view) {
        view.evaluateJavascript(
                "(function(){if(document.getElementById('__devbadge'))return;"
              + "var d=document.createElement('div');d.id='__devbadge';d.textContent='DEV';"
              + "d.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483647;"
              + "font:11px/1.8 sans-serif;padding:0 8px;border-radius:10px;"
              + "background:#d85a30;color:#fff;opacity:.85;pointer-events:none';"
              + "document.body.appendChild(d);})()", null);
    }

    /** 虚拟域名 -> assets / 私有缓存 */
    private WebResourceResponse serve(Uri u) {
        if (!HOST.equals(u.getHost())) return null;
        String path = u.getPath();
        if (path == null || path.length() == 0 || "/".equals(path)) path = "index.html";
        else if (path.startsWith("/")) path = path.substring(1);

        try {
            Map<String, String> h = new HashMap<String, String>();
            h.put("Cache-Control", "no-cache");
            if (path.equals("cache/" + CACHE_NAME)) {
                File f = new File(getCacheDir(), CACHE_NAME);
                if (!f.exists()) return notFound();
                return new WebResourceResponse("application/epub+zip", null, 200, "OK", h,
                        new java.io.FileInputStream(f));
            }
            return new WebResourceResponse(mime(path), null, 200, "OK", h, getAssets().open(path));
        } catch (Exception e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(), null);
    }

    private static String mime(String p) {
        String s = p.toLowerCase();
        if (s.endsWith(".html") || s.endsWith(".htm")) return "text/html";
        if (s.endsWith(".css")) return "text/css";
        if (s.endsWith(".js")) return "application/javascript";
        if (s.endsWith(".json")) return "application/json";
        if (s.endsWith(".png")) return "image/png";
        if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
        if (s.endsWith(".gif")) return "image/gif";
        if (s.endsWith(".svg")) return "image/svg+xml";
        if (s.endsWith(".webp")) return "image/webp";
        if (s.endsWith(".woff2")) return "font/woff2";
        if (s.endsWith(".woff")) return "font/woff";
        if (s.endsWith(".otf")) return "font/otf";
        if (s.endsWith(".ttf")) return "font/ttf";
        if (s.endsWith(".epub")) return "application/epub+zip";
        if (s.endsWith(".xhtml")) return "application/xhtml+xml";
        if (s.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                } else if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    out = new Uri[n];
                    for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
                }
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(out);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /** 返回键：先让阅读器处理（关面板 / 回书架），它说没处理才退出 App */
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("!!(window.WB && WB.onBack && WB.onBack())",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if (!"true".equals(v)) MainActivity.super.onBackPressed();
                    }
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.setWebChromeClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
