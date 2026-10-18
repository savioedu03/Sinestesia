package com.leitortts.app;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "Sintese")
public class SintesePlugin extends Plugin {

    private TextToSpeech tts;
    private volatile boolean pronto = false;
    private volatile boolean idiomaOk = false;
    private volatile boolean falhouInicio = false;
    private PluginCall chamadaIniciar = null;
    private final Map<String, PluginCall> pendentes = new ConcurrentHashMap<>();
    private final Map<String, String> caminhos = new ConcurrentHashMap<>();

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    int r = tts.setLanguage(new Locale("pt", "BR"));
                    idiomaOk = !(r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED);
                    tts.setSpeechRate(1.0f);
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {}

                        @Override
                        public void onDone(String utteranceId) {
                            terminar(utteranceId, null);
                        }

                        @Override
                        public void onError(String utteranceId) {
                            terminar(utteranceId, "Falha ao gerar audio");
                        }

                        @Override
                        public void onError(String utteranceId, int errorCode) {
                            terminar(utteranceId, "Falha ao gerar audio (codigo " + errorCode + ")");
                        }
                    });
                    pronto = true;
                } else {
                    falhouInicio = true;
                }
                responderIniciar();
            }
        });
    }

    private synchronized void responderIniciar() {
        if (chamadaIniciar == null) return;
        PluginCall c = chamadaIniciar;
        chamadaIniciar = null;
        if (pronto) {
            JSObject o = new JSObject();
            o.put("idiomaOk", idiomaOk);
            c.resolve(o);
        } else {
            c.reject("Motor de voz do Android nao iniciou");
        }
        getBridge().releaseCall(c);
    }

    @PluginMethod
    public synchronized void iniciar(PluginCall call) {
        if (pronto || falhouInicio) {
            if (pronto) {
                JSObject o = new JSObject();
                o.put("idiomaOk", idiomaOk);
                call.resolve(o);
            } else {
                call.reject("Motor de voz do Android nao iniciou");
            }
            return;
        }
        getBridge().saveCall(call);
        chamadaIniciar = call;
    }

    @PluginMethod
    public void gerar(PluginCall call) {
        String texto = call.getString("texto");
        String id = call.getString("id");
        if (texto == null || id == null) {
            call.reject("Faltou texto ou id");
            return;
        }
        if (!pronto) {
            call.reject("Motor de voz nao esta pronto");
            return;
        }
        Float taxaF = call.getFloat("taxa", 1.0f);
        float taxa = (taxaF == null) ? 1.0f : taxaF.floatValue();
        File dir = new File(getContext().getCacheDir(), "tts");
        dir.mkdirs();
        File arquivo = new File(dir, id + ".wav");
        tts.setSpeechRate(taxa);
        getBridge().saveCall(call);
        pendentes.put(id, call);
        caminhos.put(id, arquivo.getAbsolutePath());
        int r = tts.synthesizeToFile(texto, null, arquivo, id);
        if (r != TextToSpeech.SUCCESS) {
            terminar(id, "Nao consegui iniciar a geracao do audio");
        }
    }

    private void terminar(String id, String erro) {
        PluginCall c = pendentes.remove(id);
        String caminho = caminhos.remove(id);
        if (c == null) return;
        if (erro == null) {
            JSObject o = new JSObject();
            o.put("path", caminho);
            o.put("duracao", lerDuracao(new File(caminho)));
            c.resolve(o);
        } else {
            c.reject(erro);
        }
        getBridge().releaseCall(c);
    }

    private double lerDuracao(File f) {
        try {
            RandomAccessFile r = new RandomAccessFile(f, "r");
            try {
                long len = r.length();
                if (len <= 44) return 0;
                byte[] h = new byte[44];
                r.readFully(h);
                long byteRate = (h[28] & 0xFFL) | ((h[29] & 0xFFL) << 8) | ((h[30] & 0xFFL) << 16) | ((h[31] & 0xFFL) << 24);
                if (byteRate <= 0) return 0;
                return (len - 44.0) / byteRate;
            } finally {
                r.close();
            }
        } catch (Exception e) {
            return 0;
        }
    }

    @PluginMethod
    public void parar(PluginCall call) {
        try {
            if (tts != null) tts.stop();
        } catch (Exception e) {
        }
        List<String> ids = new ArrayList<>(pendentes.keySet());
        for (String id : ids) {
            terminar(id, "Cancelado");
        }
        call.resolve();
    }

    @PluginMethod
    public void limpar(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "tts");
        File[] lista = dir.listFiles();
        if (lista != null) {
            for (File f : lista) {
                f.delete();
            }
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (tts != null) {
                tts.stop();
                tts.shutdown();
            }
        } catch (Exception e) {
        }
        super.handleOnDestroy();
    }
}
