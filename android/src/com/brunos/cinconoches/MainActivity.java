package com.brunos.cinconoches;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Contenedor Android del juego: una WebView a pantalla completa (modo inmersivo, horizontal,
// pantalla siempre encendida) que carga el index.html autocontenido desde los assets del APK.
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) {
                    // sin navegador disponible
                }
                return true;
            }
        });
        setContentView(web);
        immersive();
        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl("file:///android_asset/index.html");
    }

    private void immersive() {
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
        if (hasFocus) immersive();
    }

    // Al salir de la app se pausa la noche y se silencia el audio; al volver se reanuda el audio.
    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.evaluateJavascript("(function(){var g=window.__game;if(!g)return;if(g.state==='night')g.togglePause();if(g.audio&&g.audio.ctx)g.audio.ctx.suspend();})()", null);
            web.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("(function(){var g=window.__game;if(g&&g.audio&&g.audio.ctx)g.audio.ctx.resume();})()", null);
            immersive();
        }
    }

    // Botón atrás: equivale a Esc dentro del juego (pausa / volver); en el menú sale de la app.
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){var g=window.__game;if(!g)return 'exit';"
                        + "var b=document.querySelector('.screen.active [data-action=\"back\"]');if(b){b.click();return 'ok';}"
                        + "if(g.state==='menu'||g.state==='loading'||g.state==='preload')return 'exit';"
                        + "if(g.state==='gameover'||g.state==='win'){var m=document.querySelector('.screen.active [data-action=\"menu\"]');if(m){m.click();return 'ok';}}"
                        + "window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'}));return 'ok';})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if (v != null && v.contains("exit")) finish();
                    }
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
