// Dicionario simples de palavras comuns (V1)
var DICIONARIO_LISTAS = {
  verbo: ["abre","abrir","acha","achar","acho","anda","andar","bebe","beber","chega","chegar","come","comer","começa","começar","conhece","conhecer","corre","correr","dar","deixa","deixar","deu","deve","devem","dever","disse","diz","dizer","dá","encontra","encontrar","entra","entrar","era","eram","escreve","escrever","espera","esperar","estar","estava","está","estão","fala","falar","falou","faz","fazem","fazer","fecha","fechar","fez","fica","ficam","ficar","ficou","foi","fomos","foram","fui","gosta","gostar","haver","há","ir","ler","leva","levar","lê","morre","morrer","olha","olhar","ouve","ouvir","parece","parecer","passa","passar","pega","pegar","pensa","pensar","pode","podem","poder","podia","precisa","precisar","puder","quer","querer","quis","sabe","saber","sabia","sai","sair","sei","sente","sentir","ser","seria","será","sinto","são","tem","temos","tenho","ter","tinha","traz","trazer","têm","vai","veio","vem","ver","vi","vir","viu","vive","viver","volta","voltar","vou","vão","vê","é"],
  substantivo: ["amiga","amigo","amor","ano","anos","cabeça","cachorro","cadeira","cama","carro","casa","caso","celular","cidade","coisa","coisas","começo","comida","corpo","criança","crianças","céu","dia","dinheiro","dor","escola","família","filha","filho","fim","flor","forma","força","gato","grupo","história","homem","hora","horas","ideia","janela","lado","livro","livros","lua","lugar","manhã","mar","medo","menina","menino","mesa","momento","mulher","mundo","mãe","mão","mês","noite","nome","número","olho","olhos","pai","palavra","palavras","parte","país","pessoa","pessoas","ponto","porta","problema","pé","quarto","rio","rosto","rua","sala","semana","sol","sonho","tarde","tela","telefone","tempo","terra","texto","trabalho","verdade","vez","vezes","vida","voz","água","árvore"],
  adjetivo: ["alta","alto","amargo","baixa","baixo","bela","belo","boa","bom","bonita","bonito","certa","certo","cheia","cheio","clara","claro","curta","curto","diferente","difícil","doce","errada","errado","escura","escuro","feia","feio","feliz","forte","fraca","fraco","fria","frio","fácil","grande","igual","importante","jovem","junto","lenta","lento","limpo","livre","longa","longo","mau","mesma","mesmo","má","nova","novo","outra","outro","pequena","pequeno","pobre","possível","primeira","primeiro","pronta","pronto","quente","rico","rápida","rápido","simples","sozinha","sozinho","sujo","toda","todo","triste","vazia","vazio","velha","velho","última","último"]
};
var DICIONARIO = {};
Object.keys(DICIONARIO_LISTAS).forEach(function (classe) {
  DICIONARIO_LISTAS[classe].forEach(function (p) { DICIONARIO[p] = classe; });
});

function classificar(palavra) {
  var p = palavra.toLowerCase();
  if (DICIONARIO[p]) return DICIONARIO[p];
  if (p.length > 4) {
    if (/(ção|ções|dade|dades|agem|ismo|mento|mentos|eza|ura)$/.test(p)) return 'substantivo';
    if (/(oso|osa|osos|osas|ivo|iva|ável|ível|ico|ica)$/.test(p)) return 'adjetivo';
    if (/(ando|endo|indo|ado|ido|ar|er|ir|aram|eram|iram|ava|avam)$/.test(p)) return 'verbo';
  }
  return 'outro';
}
