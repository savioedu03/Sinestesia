var TTS = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins.TextToSpeech : null;

var palavras = [];
var idx = 0;
var tocando = false;
var velocidade = 1;
var ficha = 0;

function $(id) { return document.getElementById(id); }
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function preparar(texto) {
  return texto.split(/\s+/).filter(function (x) { return x.length > 0; }).map(function (bruta) {
    var limpa = bruta.replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/g, '');
    var fim = bruta.charAt(bruta.length - 1);
    var pausa = 0;
    if (fim === ',' || fim === ';' || fim === ':') pausa = 300;
    else if (fim === '.') pausa = 700;
    else if (fim === '?' || fim === '!') pausa = 500;
    return { bruta: bruta, limpa: limpa, pausa: pausa, classe: classificar(limpa || bruta) };
  });
}

function mostrar() {
  var p = palavras[idx];
  var el = $('palavra');
  el.textContent = p.bruta;
  el.className = 'c-' + p.classe;
  $('contador').textContent = (idx + 1) + '/' + palavras.length;
}

async function falar(texto) {
  if (!TTS) { throw new Error('Plugin de voz nao encontrado (so funciona no APK)'); }
  await TTS.speak({ text: texto, lang: 'pt-BR', rate: velocidade, pitch: 1.0, volume: 1.0, category: 'playback' });
}

async function rodar() {
  var minha = ++ficha;
  tocando = true;
  $('btnPlay').textContent = 'PAUSE';
  try {
    while (tocando && minha === ficha && idx < palavras.length) {
      mostrar();
      var p = palavras[idx];
      if (p.limpa) await falar(p.limpa);
      if (minha !== ficha) return;
      var pausa = p.pausa;
      if (velocidade > 1) pausa = pausa / velocidade;
      if (pausa > 0) await esperar(pausa);
      if (minha !== ficha) return;
      idx++;
    }
  } catch (e) {
    if (minha === ficha) { mostrarErro('ERRO NA VOZ: ' + (e && e.message ? e.message : e)); }
  }
  if (minha === ficha) {
    tocando = false;
    $('btnPlay').textContent = 'PLAY';
    if (idx >= palavras.length) { idx = palavras.length - 1; }
  }
}

async function parar() {
  ficha++;
  tocando = false;
  $('btnPlay').textContent = 'PLAY';
  try { if (TTS) await TTS.stop(); } catch (e) {}
}

$('btnColar').addEventListener('click', async function () {
  try {
    var t = await navigator.clipboard.readText();
    $('texto').value = t;
  } catch (e) {
    mostrarErro('Nao consegui ler a area de transferencia. Segure o dedo na caixa de texto e escolha Colar.');
  }
});

$('btnLer').addEventListener('click', function () {
  palavras = preparar($('texto').value);
  if (palavras.length === 0) { mostrarErro('Cole um texto primeiro.'); return; }
  $('erro').style.display = 'none';
  idx = 0;
  $('telaEntrada').classList.add('oculta');
  $('telaLeitor').classList.remove('oculta');
  mostrar();
});

$('btnVoltar').addEventListener('click', async function () {
  await parar();
  $('telaLeitor').classList.add('oculta');
  $('telaEntrada').classList.remove('oculta');
});

$('btnPlay').addEventListener('click', async function () {
  if (tocando) { await parar(); }
  else { rodar(); }
});

document.querySelectorAll('.vel').forEach(function (b) {
  b.addEventListener('click', function () {
    velocidade = parseFloat(b.getAttribute('data-v'));
    document.querySelectorAll('.vel').forEach(function (x) { x.classList.remove('ativo'); });
    b.classList.add('ativo');
  });
});
document.querySelector('.vel[data-v="1"]').classList.add('ativo');

$('palco').addEventListener('click', async function () {
  if (palavras.length === 0) return;
  var estavaTocando = tocando;
  if (estavaTocando) { await parar(); }
  if (idx < palavras.length - 1) idx++;
  mostrar();
  if (estavaTocando) rodar();
});
