package io.github.lagilava.pingpong;

import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * The real game, bundled: assets/game/ is the repo's game/ folder, served to
 * a full-screen WebView from https://appassets.androidplatform.net/game/.
 * Every mode, shader, sound and touch layout is the web build's own code, so
 * the app plays offline and matches the site exactly. Online play uses the
 * network as it does in a browser.
 */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 7;
    private WebView web;
    private long lastBack;
    private ValueCallback<Uri[]> filePicker;

    private final AssetServer server = new AssetServer(new AssetServer.Source() {
        @Override public AssetServer.Blob open(String path) throws IOException {
            AssetManager am = getAssets();
            try {
                // Media and images are stored uncompressed: openFd gives the length for Range.
                AssetFileDescriptor fd = am.openFd(path);
                return new AssetServer.Blob(fd.createInputStream(), fd.getLength());
            } catch (FileNotFoundException notStored) {
                // Compressed text assets (js, css, json): small, read whole.
                try {
                    byte[] all = AssetServer.readAll(am.open(path, AssetManager.ACCESS_STREAMING));
                    return new AssetServer.Blob(new java.io.ByteArrayInputStream(all), all.length);
                } catch (FileNotFoundException missing) {
                    return null;
                }
            }
        }
    });

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        // No display-cutout override: the game stays clear of the notch.
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#05060F"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " PingPongAndroid/1.0");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = cb;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    filePicker = null;
                    return false;
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!"https".equals(u.getScheme()) || !AssetServer.isOurHost(u.getHost())) return null;
                if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
                AssetServer.Response r = server.serve(u.getPath(), req.getRequestHeaders().get("Range"));
                return new WebResourceResponse(r.mime, null, r.status, r.reason, r.headers, r.body);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (AssetServer.isOurHost(uri.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception e) { /* no browser */ }
                return true;
            }
        });
        setContentView(web);
        hideSystemBars();
        if (state != null) web.restoreState(state);
        else web.loadUrl(AssetServer.START_URL);
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req != REQ_FILE || filePicker == null) { super.onActivityResult(req, result, data); return; }
        Uri[] picked = null;
        if (result == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                picked = new Uri[n];
                for (int i = 0; i < n; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                picked = new Uri[] {data.getData()};
            }
        }
        filePicker.onReceiveValue(picked);
        filePicker = null;
    }

    private void hideSystemBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // Back acts like Escape in the game (pause / close menus); a second
    // press within two seconds leaves the app.
    @Override
    public void onBackPressed() {
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { super.onBackPressed(); return; }
        lastBack = now;
        web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ESCAPE));
        web.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ESCAPE));
        Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onPause() {
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.resumeTimers();
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
