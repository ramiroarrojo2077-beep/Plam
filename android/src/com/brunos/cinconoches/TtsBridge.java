package com.brunos.cinconoches;

import android.app.Activity;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.util.Locale;

// Voz de la llamada telefónica: la WebView no trae Web Speech API, así que el juego habla a
// través del motor TextToSpeech del sistema (window.AndroidTTS). Al terminar cada frase se
// avisa al juego con window.__ttsDone(id, ok).
public class TtsBridge implements TextToSpeech.OnInitListener {
    private final Activity activity;
    private final WebView web;
    private final TextToSpeech tts;
    private boolean ready = false;
    private String[] pending = null;

    public TtsBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        this.tts = new TextToSpeech(activity, this);
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) return;
        Locale dev = Locale.getDefault();
        Locale[] prefs = {
            "es".equals(dev.getLanguage()) ? dev : new Locale("es", "ES"),
            new Locale("es", "ES"), new Locale("es", "US"), new Locale("es", "MX"), new Locale("es")
        };
        for (Locale l : prefs) {
            int r = tts.isLanguageAvailable(l);
            if (r >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(l);
                break;
            }
        }
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {
            }

            @Override
            public void onDone(String id) {
                notifyJs(id, true);
            }

            @Override
            public void onError(String id) {
                notifyJs(id, false);
            }

            @Override
            public void onStop(String id, boolean interrupted) {
                // cortada a propósito (pausa o silenciar): no avanza la llamada
            }
        });
        ready = true;
        if (pending != null) {
            String[] p = pending;
            pending = null;
            say(p[0], Float.parseFloat(p[1]), Float.parseFloat(p[2]), Float.parseFloat(p[3]), p[4]);
        }
    }

    private void notifyJs(final String id, final boolean ok) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.__ttsDone&&window.__ttsDone('" + id.replace("'", "") + "'," + ok + ")", null);
            }
        });
    }

    private void say(String text, float rate, float pitch, float volume, String id) {
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        Bundle b = new Bundle();
        b.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, b, id);
    }

    @JavascriptInterface
    public void speak(String text, float rate, float pitch, float volume, String id) {
        if (!ready) {
            pending = new String[] {text, String.valueOf(rate), String.valueOf(pitch), String.valueOf(volume), id};
            return;
        }
        say(text, rate, pitch, volume, id);
    }

    @JavascriptInterface
    public void stop() {
        pending = null;
        if (ready) tts.stop();
    }

    @JavascriptInterface
    public boolean isReady() {
        return ready;
    }

    public void shutdown() {
        tts.stop();
        tts.shutdown();
    }
}
