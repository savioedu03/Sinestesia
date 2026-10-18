// ===================== PLUGINS =====================
var Cap = window.Capacitor || {};
var PL = Cap.Plugins || {};
function pegarPlugin(nome) {
  if (PL[nome]) return PL[nome];
  if (Cap.registerPlugin) { try { return Cap.registerPlugin(nome); } catch (e) {} }
  return null;
}
var Sintese = pegarPlugin('Sintese');
var Clip = pegarPlugin('Clipboard');

// ===================== ESTADO =====================
var LIMITE_DIRETO = 4;      // ate 4x: audio gerado normal, tocado acelerado
var MAX_AUDIO = 8;          // 4x a 8x: audio gerado em 2x e tocado ate 4x. Acima de 8x: so visual
var LISTA_VEL = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 4, 5, 6, 7, 8, 9, 10];
function taxaGer() { return velocidade > LIMITE_DIRETO ? 2.0 : 1.0; }   // velocidade da voz ao gerar
function taxaPlay() { return velocidade > LIMITE_DIRETO ? velocidade / 2 : velocidade; } // velocidade do tocador

var palavras = [];
var frases = [];
var idx = 0;                // palavra atual
var fi = 0;                 // frase atual
var tocando = false;
var terminou = false;
var velocidade = 1;
var ficha = 0;              // cancela o loop de leitura
var geracao = 0;            // cancela a geracao de audio
var gerando = false;
var avisoIdioma = '';
var genTaxa = null;         // velocidade da voz dos arquivos gerados
var genInicio = 0;
var genAudio = 0;           // segundos de audio gerados nesta rodada
var audio = new Audio();
audio.preservesPitch = true;
audio.webkitPreservesPitch = true;
var audioFi = -1;
var telaAnterior = 'telaEntrada';
var abaAtual = 'substantivo';

function $(id) { return document.getElementById(id); }
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function msg(e) { return e && e.message ? e.message : String(e); }

// ===================== BANCO DE PALAVRAS =====================
var banco = {};
function carregarBanco() {
  try {
    var t = localStorage.getItem('bancoPalavras');
    if (t) banco = JSON.parse(t) || {};
  } catch (e) { banco = {}; }
}
function salvarBanco() {
  try { localStorage.setItem('bancoPalavras', JSON.stringify(banco)); }
  catch (e) { mostrarErro('Nao consegui salvar o banco: ' + msg(e)); }
}
carregarBanco();

function corDaPalavra(limpa) {
  var k = limpa.toLowerCase();
  if (banco[k]) return banco[k];
  return classificar(limpa || 'x');
}

// ===================== TELAS =====================
function irPara(nome) {
  ['telaEntrada', 'telaLeitor', 'telaBanco'].forEach(function (t) {
    $(t).classList.toggle('oculta', t !== nome);
  });
}
function abrirBanco(de) {
  telaAnterior = de;
  irPara('telaBanco');
  desenharBanco();
}

// ===================== PREPARAR TEXTO =====================
function preparar(texto) {
  palavras = [];
  frases = [];
  var brutas = texto.split(/\s+/).filter(function (x) { return x.length > 0; });
  var ini = 0;
  brutas.forEach(function (b, i) {
    var limpa = b.replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/g, '');
    var semAspas = b.replace(/["'”’)\]]+$/, '');
    var fim = semAspas.charAt(semAspas.length - 1);
    var pausa = 0;
    if (fim === ',' || fim === ';' || fim === ':') pausa = 300;
    else if (fim === '.') pausa = 700;
    else if (fim === '?' || fim === '!') pausa = 500;
    palavras.push({ bruta: b, limpa: limpa, pausa: pausa, frase: 0 });
    var n = i - ini + 1;
    var fecha = /[.!?…]["'”’)\]]*$/.test(b) || n >= 40 || (n >= 18 && /[,;:]["'”’)\]]*$/.test(b)) || i === brutas.length - 1;
    if (fecha) { criarFrase(ini, i + 1); ini = i + 1; }
  });
}

function criarFrase(ini, fim) {
  var partes = [];
  var pesos = [];
  var total = 0;
  for (var i = ini; i < fim; i++) {
    var p = palavras[i];
    partes.push(p.bruta);
    var w = Math.max(p.limpa.length, 1) + 2;
    if (p.pausa === 300) w += 3;
    else if (p.pausa >= 500) w += 4;
    pesos.push(w);
    total += w;
  }
  var fr = [];
  var acum = 0;
  for (var k = 0; k < pesos.length; k++) { fr.push(acum / total); acum += pesos[k]; }
  frases.push({ ini: ini, fim: fim, texto: partes.join(' '), fr: fr, arquivo: null, url: null, erro: false, dur: 0 });
  for (var j = ini; j < fim; j++) palavras[j].frase = frases.length - 1;
}

// ===================== TELA DO LEITOR =====================
function mostrar() {
  var p = palavras[idx];
  if (!p) return;
  var el = $('palavra');
  el.textContent = p.bruta;
  el.className = 'c-' + corDaPalavra(p.limpa);
  $('contador').textContent = (idx + 1) + '/' + palavras.length;
}

function atualizarStatus(extra, aviso) {
  $('status').className = aviso ? 'aviso' : '';
  var feitas = 0, erros = 0;
  frases.forEach(function (f) { if (f.arquivo) feitas++; if (f.erro) erros++; });
  var t = '';
  if (velocidade <= MAX_AUDIO) {
    if (gerando) t = 'Gerando áudio: ' + (feitas + erros) + '/' + frases.length + ' frases';
    else t = 'Áudio pronto ✓';
    if (erros) t += ' (' + erros + ' com falha)';
  } else {
    t = 'Leitura só visual (sem áudio) acima de ' + MAX_AUDIO + 'x';
  }
  if (avisoIdioma) t += ' — ' + avisoIdioma;
  if (extra) t += ' — ' + extra;
  $('status').textContent = t;
}

function mostrarMarcar(sim) {
  $('marcar').classList.toggle('oculta', !sim);
}

// ----- geracao do audio em segundo plano -----
function proximaParaGerar() {
  var n = frases.length;
  for (var k = 0; k < n; k++) {
    var i = (fi + k) % n;
    if (!frases[i].arquivo && !frases[i].erro) return i;
  }
  return -1;
}

async function gerarTudo(minha, taxa) {
  gerando = true;
  genInicio = Date.now();
  genAudio = 0;
  atualizarStatus();
  try {
    if (!Sintese) throw new Error('Motor de voz nativo nao encontrado (so funciona no APK)');
    var r = await Sintese.iniciar();
    if (minha !== geracao) return;
    if (r && r.idiomaOk === false) {
      avisoIdioma = 'voz em português não instalada no Android';
    }
    while (minha === geracao) {
      var alvo = proximaParaGerar();
      if (alvo < 0) break;
      var f = frases[alvo];
      try {
        var res = await Sintese.gerar({ texto: f.texto, id: 'g' + minha + '_' + alvo, taxa: taxa });
        if (minha !== geracao) return;
        f.arquivo = res.path;
        f.dur = res.duracao > 0 ? res.duracao : (f.fim - f.ini) * 0.4;
        genAudio += f.dur;
        f.url = Cap.convertFileSrc('file://' + res.path);
      } catch (e) {
        if (minha !== geracao) return;
        f.erro = true;
      }
      atualizarStatus();
    }
  } catch (e) {
    if (minha === geracao) mostrarErro('ERRO NO ÁUDIO: ' + msg(e));
  }
  if (minha === geracao) { gerando = false; atualizarStatus(); }
}

// ----- ritmo visual (sem audio) -----
function msPorPalavra() {
  var wpm;
  if (velocidade <= MAX_AUDIO) wpm = 150 * velocidade;
  else wpm = 1200 + (velocidade - MAX_AUDIO) * 60;
  return 60000 / wpm;
}

async function rodarVisual(minha) {
  while (tocando && minha === ficha && idx < palavras.length) {
    mostrar();
    fi = palavras[idx].frase;
    await esperar(msPorPalavra());
    if (minha !== ficha) return;
    var pa = palavras[idx].pausa / velocidade;
    if (pa > 0) await esperar(pa);
    if (minha !== ficha) return;
    if (idx >= palavras.length - 1) { terminou = true; return; }
    idx++;
  }
}

// ----- ritmo com audio -----
function indiceNoTempo(f, frac) {
  var k = 0;
  while (k + 1 < f.fr.length && f.fr[k + 1] <= frac) k++;
  return k;
}

function esperarMetadados() {
  return new Promise(function (res) {
    if (audio.readyState >= 1) return res();
    var t = setTimeout(res, 4000);
    audio.onloadedmetadata = function () { clearTimeout(t); res(); };
    audio.onerror = function () { clearTimeout(t); res(); };
  });
}

async function tocarFrase(f, minha) {
  if (audioFi !== fi) { audio.src = f.url; audioFi = fi; }
  audio.playbackRate = taxaPlay();
  await esperarMetadados();
  if (minha !== ficha) return;
  var d = audio.duration;
  if (isFinite(d) && d > 0) {
    var k = indiceNoTempo(f, audio.currentTime / d);
    if (f.ini + k !== idx) audio.currentTime = f.fr[idx - f.ini] * d;
  }
  mostrar();
  await new Promise(function (resolve) {
    var timer = null;
    audio.onended = function () { clearInterval(timer); resolve(); };
    audio.onerror = function () { clearInterval(timer); f.erro = true; resolve(); };
    timer = setInterval(function () {
      if (minha !== ficha) { clearInterval(timer); resolve(); return; }
      var dur = audio.duration;
      if (!isFinite(dur) || dur <= 0) return;
      var novo = f.ini + indiceNoTempo(f, audio.currentTime / dur);
      if (novo !== idx) { idx = novo; mostrar(); }
    }, 40);
    var pr = audio.play();
    if (pr && pr.catch) {
      pr.catch(function (e) {
        clearInterval(timer);
        f.erro = true;
        mostrarErro('Nao consegui tocar o audio: ' + msg(e));
        resolve();
      });
    }
  });
}

async function rodarFraseVisual(f, minha) {
  while (minha === ficha && idx < f.fim) {
    mostrar();
    await esperar(msPorPalavra());
    if (minha !== ficha) return;
    var pa = palavras[idx].pausa / velocidade;
    if (pa > 0) await esperar(pa);
    if (minha !== ficha) return;
    if (idx >= f.fim - 1) return;
    idx++;
  }
}

// ----- "aguarde um momento": garante que sempre tenha audio pronto -----
function estimativaBuffer() {
  var f0 = frases[fi];
  if (!f0) return 0;
  if (f0.erro) return 0;
  var n = 0, soma = 0;
  frases.forEach(function (f) { if (f.dur) { n++; soma += f.dur; } });
  var seg = Math.max((Date.now() - genInicio) / 1000, 1);
  var p = genAudio > 0 ? genAudio / seg : 0;     // segundos de audio gerados por segundo real
  if (!f0.arquivo) return gerando ? 99 : 0;
  if (!gerando) return 0;
  if (!p || n < 1) return 0;
  var media = soma / n;
  var total = 0, pronto = 0, contiguo = true;
  for (var i = fi; i < frases.length; i++) {
    var d = frases[i].dur || media;
    total += d;
    if (contiguo && frases[i].arquivo) pronto += d; else contiguo = false;
  }
  var c = taxaPlay();                             // segundos de audio consumidos por segundo real
  var espera = (total - pronto) / p - total / c;
  return espera > 0 ? espera + 1 : 0;
}

async function aguardarBuffer(minha) {
  var d = estimativaBuffer();
  while (minha === ficha && d > 0) {
    if (d >= 99) atualizarStatus('Aguarde um momento... preparando o áudio', true);
    else atualizarStatus('Aguarde um momento... preparando o áudio (~' + Math.ceil(d) + 's)', true);
    await esperar(250);
    d = estimativaBuffer();
  }
  if (minha === ficha) atualizarStatus();
}

async function rodarAudio(minha) {
  var checar = true;
  while (tocando && minha === ficha && fi < frases.length) {
    var f = frases[fi];
    if (checar || (!f.arquivo && !f.erro)) {
      await aguardarBuffer(minha);
      checar = false;
    }
    while (minha === ficha && !f.arquivo && !f.erro) {
      if (!gerando) sincronizarGeracao();
      atualizarStatus('Aguarde um momento... preparando o áudio', true);
      await esperar(150);
    }
    if (minha !== ficha) return;
    atualizarStatus();
    if (f.erro) await rodarFraseVisual(f, minha);
    else await tocarFrase(f, minha);
    if (minha !== ficha) return;
    var ultima = palavras[f.fim - 1];
    var gap = (ultima.pausa > 0 ? ultima.pausa * 0.4 : 120) / velocidade;
    await esperar(gap);
    if (minha !== ficha) return;
    fi++;
    if (fi >= frases.length) { terminou = true; fi = frases.length - 1; return; }
    idx = frases[fi].ini;
    mostrar();
  }
}

async function rodar() {
  if (palavras.length === 0) return;
  if (terminou) { idx = 0; fi = 0; audioFi = -1; terminou = false; }
  var minha = ++ficha;
  tocando = true;
  $('btnPlay').textContent = 'PAUSE';
  mostrarMarcar(false);
  fi = palavras[idx].frase;
  mostrar();
  try {
    if (velocidade <= MAX_AUDIO) await rodarAudio(minha);
    else { audio.pause(); await rodarVisual(minha); }
  } catch (e) {
    if (minha === ficha) mostrarErro('ERRO NA LEITURA: ' + msg(e));
  }
  if (minha === ficha) {
    tocando = false;
    $('btnPlay').textContent = 'PLAY';
    mostrarMarcar(true);
  }
}

function parar() {
  ficha++;
  tocando = false;
  try { audio.pause(); } catch (e) {}
  $('btnPlay').textContent = 'PLAY';
  if (palavras.length) mostrarMarcar(true);
}

// ===================== ENTRADA =====================
async function colar() {
  try {
    if (Clip && Clip.read) {
      var r = await Clip.read();
      if (r && r.value) { $('texto').value = r.value; $('erro').style.display = 'none'; return; }
      mostrarErro('A área de transferência está vazia. Copie um texto primeiro.');
      return;
    }
  } catch (e) { /* tenta o outro jeito */ }
  try {
    var t = await navigator.clipboard.readText();
    $('texto').value = t;
    $('erro').style.display = 'none';
  } catch (e2) {
    mostrarErro('Não consegui colar. Segure o dedo na caixa de texto e escolha Colar.');
  }
}

async function comecar() {
  var t = $('texto').value;
  preparar(t);
  if (palavras.length === 0) { mostrarErro('Cole um texto primeiro.'); return; }
  $('erro').style.display = 'none';
  idx = 0; fi = 0; terminou = false; audioFi = -1; avisoIdioma = '';
  irPara('telaLeitor');
  mostrar();
  mostrarMarcar(true);
  var minha = ++geracao;
  genTaxa = null;
  try { if (Sintese) await Sintese.limpar(); } catch (e) {}
  if (minha !== geracao) return;
  sincronizarGeracao();
}

function todosFeitos() {
  return frases.every(function (f) { return f.arquivo || f.erro; });
}

// decide se precisa (re)gerar o audio, conforme a velocidade escolhida
function sincronizarGeracao() {
  if (frases.length === 0) return;
  if (velocidade > MAX_AUDIO) {
    if (gerando) {
      geracao++;
      gerando = false;
      if (Sintese) Sintese.parar().catch(function () {});
    }
    atualizarStatus();
    return;
  }
  var t = taxaGer();
  if (genTaxa !== null && genTaxa !== t) {
    geracao++;
    gerando = false;
    if (Sintese) Sintese.parar().catch(function () {});
    frases.forEach(function (f) { f.arquivo = null; f.url = null; f.erro = false; f.dur = 0; });
    audioFi = -1;
  } else if (gerando) {
    return;
  }
  if (genTaxa === t && todosFeitos()) { atualizarStatus(); return; }
  genTaxa = t;
  var minha = ++geracao;
  gerarTudo(minha, t);
}

async function sairDoLeitor() {
  parar();
  geracao++;
  gerando = false;
  genTaxa = null;
  try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
  audioFi = -1;
  try { if (Sintese) { await Sintese.parar(); await Sintese.limpar(); } } catch (e) {}
  irPara('telaEntrada');
}

// ===================== BANCO: TELA =====================
var NOMES = { substantivo: 'Substantivos', verbo: 'Verbos', adjetivo: 'Adjetivos' };
var CURTO = { substantivo: 'S', verbo: 'V', adjetivo: 'A' };
var CLASSE_COR = { substantivo: 'azul', verbo: 'vermelho', adjetivo: 'dourado' };

function desenharBanco() {
  var cont = { substantivo: 0, verbo: 0, adjetivo: 0 };
  Object.keys(banco).forEach(function (k) { if (cont[banco[k]] !== undefined) cont[banco[k]]++; });
  document.querySelectorAll('.aba').forEach(function (a) {
    var c = a.getAttribute('data-c');
    a.textContent = NOMES[c] + ' (' + cont[c] + ')';
    a.classList.toggle('ativo', c === abaAtual);
  });
  var filtro = $('busca').value.trim().toLowerCase();
  var itens = Object.keys(banco).filter(function (k) {
    return banco[k] === abaAtual && (!filtro || k.indexOf(filtro) >= 0);
  }).sort(function (a, b) { return a.localeCompare(b, 'pt'); });
  var html = '';
  if (itens.length === 0) html = '<div class="vazio">Nenhuma palavra aqui ainda.</div>';
  itens.forEach(function (k) {
    html += '<div class="item"><span class="pal c-' + abaAtual + '">' + escapar(k) + '</span>';
    ['substantivo', 'verbo', 'adjetivo'].forEach(function (c) {
      if (c !== abaAtual) {
        html += '<button class="cor ' + CLASSE_COR[c] + '" data-mover="' + c + '" data-p="' + escapar(k) + '">' + CURTO[c] + '</button>';
      }
    });
    html += '<button data-del="1" data-p="' + escapar(k) + '">✕</button></div>';
  });
  $('lista').innerHTML = html;
}

function escapar(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===================== EVENTOS =====================
$('btnColar').addEventListener('click', colar);
$('btnLer').addEventListener('click', comecar);
$('btnVoltar').addEventListener('click', sairDoLeitor);
$('btnBancoEntrada').addEventListener('click', function () { abrirBanco('telaEntrada'); });
$('btnBancoLeitor').addEventListener('click', function () { parar(); abrirBanco('telaLeitor'); });
$('btnBancoVoltar').addEventListener('click', function () {
  irPara(telaAnterior);
  if (telaAnterior === 'telaLeitor') mostrar();
});

$('btnPlay').addEventListener('click', function () {
  if (tocando) parar(); else rodar();
});

$('btnAnt').addEventListener('click', function () {
  if (palavras.length === 0) return;
  var era = tocando;
  if (era) parar();
  var f = frases[palavras[idx].frase];
  if (idx > f.ini) idx = f.ini;
  else if (palavras[idx].frase > 0) idx = frases[palavras[idx].frase - 1].ini;
  fi = palavras[idx].frase;
  terminou = false;
  mostrar();
  if (era) rodar();
});

$('palco').addEventListener('click', function () {
  if (palavras.length === 0) return;
  var era = tocando;
  if (era) parar();
  if (idx < palavras.length - 1) idx++;
  fi = palavras[idx].frase;
  terminou = false;
  mostrar();
  if (era) rodar();
});

// botoes de velocidade
var boxVel = $('velocidades');
LISTA_VEL.forEach(function (v) {
  var b = document.createElement('button');
  b.className = 'vel' + (v > MAX_AUDIO ? ' visual' : '');
  b.setAttribute('data-v', v);
  b.textContent = v + 'x';
  b.addEventListener('click', function () { mudarVelocidade(v); });
  boxVel.appendChild(b);
});

function marcarBotaoVelocidade() {
  document.querySelectorAll('.vel').forEach(function (x) {
    x.classList.toggle('ativo', parseFloat(x.getAttribute('data-v')) === velocidade);
  });
  $('velCustom').value = LISTA_VEL.indexOf(velocidade) >= 0 ? '' : velocidade;
}

function mudarVelocidade(v) {
  var eraAudio = velocidade <= MAX_AUDIO;
  var eraTaxa = taxaGer();
  velocidade = v;
  try { localStorage.setItem('velocidade', String(v)); } catch (e) {}
  marcarBotaoVelocidade();
  var era = tocando;
  var mesmoModo = eraAudio && v <= MAX_AUDIO && eraTaxa === taxaGer();
  if (era && mesmoModo) { audio.playbackRate = taxaPlay(); atualizarStatus(); return; }
  if (era) parar();
  sincronizarGeracao();
  atualizarStatus();
  if (era) rodar();
}

$('btnVelOk').addEventListener('click', function () {
  var v = parseFloat($('velCustom').value);
  if (!isFinite(v) || v < 0.25 || v > 30) { mostrarErro('Digite uma velocidade entre 0.25 e 30.'); return; }
  $('erro').style.display = 'none';
  mudarVelocidade(v);
});

try {
  var vs = parseFloat(localStorage.getItem('velocidade'));
  if (isFinite(vs) && vs >= 0.25 && vs <= 30) velocidade = vs;
} catch (e) {}
marcarBotaoVelocidade();

// marcar palavra com cor
document.querySelectorAll('#marcar .cor').forEach(function (b) {
  b.addEventListener('click', function () {
    var p = palavras[idx];
    if (!p || !p.limpa) { return; }
    var c = b.getAttribute('data-c');
    var k = p.limpa.toLowerCase();
    if (c) banco[k] = c; else delete banco[k];
    salvarBanco();
    mostrar();
    atualizarStatus(c ? ('"' + k + '" salva em ' + NOMES[c]) : ('"' + k + '" removida'));
  });
});

// banco
document.querySelectorAll('.aba').forEach(function (a) {
  a.addEventListener('click', function () { abaAtual = a.getAttribute('data-c'); desenharBanco(); });
});
$('busca').addEventListener('input', desenharBanco);
$('btnAdd').addEventListener('click', function () {
  var p = $('nova').value.trim().toLowerCase();
  if (!p) return;
  banco[p] = abaAtual;
  salvarBanco();
  $('nova').value = '';
  desenharBanco();
});
$('lista').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  var p = b.getAttribute('data-p');
  if (b.getAttribute('data-del')) delete banco[p];
  else if (b.getAttribute('data-mover')) banco[p] = b.getAttribute('data-mover');
  salvarBanco();
  desenharBanco();
});
$('btnExportar').addEventListener('click', async function () {
  var t = JSON.stringify(banco);
  $('io').value = t;
  try { if (Clip && Clip.write) await Clip.write({ string: t }); } catch (e) {}
  mostrarErro('Exportado! O texto também foi copiado. Cole numa nota pra guardar.');
});
$('btnImportar').addEventListener('click', function () {
  try {
    var o = JSON.parse($('io').value);
    var n = 0;
    Object.keys(o).forEach(function (k) {
      if (o[k] === 'substantivo' || o[k] === 'verbo' || o[k] === 'adjetivo') { banco[k.toLowerCase()] = o[k]; n++; }
    });
    salvarBanco();
    desenharBanco();
    mostrarErro('Importadas ' + n + ' palavras.');
  } catch (e) {
    mostrarErro('Texto inválido. Cole exatamente o que foi exportado.');
  }
});
