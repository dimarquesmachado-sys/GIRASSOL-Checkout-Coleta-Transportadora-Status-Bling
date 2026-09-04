const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BLING_BASE = 'https://api.bling.com.br/Api/v3';

const CLIENT_ID      = process.env.BLING_CLIENT_ID || '';
const CLIENT_SECRET  = process.env.BLING_CLIENT_SECRET || '';
// Sem a env, gera um segredo ALEATÓRIO no boot em vez de usar um valor fixo — o
// valor fixo estava no repositório público e permitia forjar um token de sessão.
// Pior caso agora: as sessões caem num restart (e o log avisa), nunca alguém entra.
// Segredo da sessão: usa a env; sem ela, gera UMA vez e guarda no disco. Assim
// não volta a ser o valor fixo que estava no repositório público (dava pra forjar
// sessão) nem muda a cada boot (o que derrubaria o login do galpão em todo deploy).
function segredoSessao() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const F = '/data/session-secret';
  try { if (fs.existsSync(F)) { const v = fs.readFileSync(F, 'utf8').trim(); if (v) return v; } } catch (e) {}
  const novo = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(F, novo);
    console.warn('⚠ SESSION_SECRET não configurada — gerei um segredo e salvei em ' + F + '. Configure no Render.');
  } catch (e) {
    console.warn('⚠ SESSION_SECRET não configurada e não consegui gravar no disco — as sessões vão cair a cada restart.');
  }
  return novo;
}
const SESSION_SECRET = segredoSessao();
if (!process.env.USERS) console.error('⛔ USERS não configurada — NINGUÉM consegue logar (login responde 503). Configure a variável no Render.');
// Chave p/ rotas de diagnóstico/admin (acessadas pelo navegador com ?k=CHAVE).
// Sem a env ADMIN_KEY configurada, essas rotas ficam DESLIGADAS (404) — seguro por padrão.
const ADMIN_KEY = process.env.ADMIN_KEY || '';
function adminOk(req){ return ADMIN_KEY && req.query.k === ADMIN_KEY; }

let accessToken  = process.env.BLING_ACCESS_TOKEN || '';
let refreshToken = process.env.BLING_REFRESH_TOKEN || '';
let tokenExpires = accessToken ? Date.now() + 50 * 60 * 1000 : 0;

function parseUsers() {
  // FALHA FECHADA (12/08): antes, sem a env USERS o sistema caía numa senha fixa
  // que está no repositório público — um restore ou serviço novo mal configurado
  // abriria o app inteiro. Agora, sem USERS, simplesmente não existe usuário.
  const raw = process.env.USERS || '';
  if (!raw.trim()) return [];
  return raw.split(',').map(p => {
    const [nome, senha] = p.split(':');
    return { nome: (nome || '').trim(), senha: (senha || '').trim() };
  }).filter(u => u.nome && u.senha);
}


// ── Sessões STATELESS (token assinado) ──────────────────────────────────────
// O token carrega o usuário + validade + assinatura HMAC. O servidor valida pela
// assinatura, SEM guardar nada na memória. Assim a sessão sobrevive a restarts do
// Render (deploy/crash). Antes, o Map em memória zerava no restart e deslogava todo
// mundo de uma vez — problema crítico no iPhone, que recarrega o app ao voltar do
// background e revalida o login, caindo no loop de "volta pro login".
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h
function generateToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + SESSION_TTL })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(tok) {
  if (!tok) return null;
  const parts = String(tok).split('.');
  if (parts.length !== 2) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(parts[0]).digest('base64url');
  if (parts[1] !== expectedSig) return null; // assinatura inválida (adulterado ou token antigo formato aleatório)
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch (e) { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null; // expirado
  return payload.u;
}

function requireAuth(req, res, next) {
  // Sem USERS configurada não existe usuário válido — nem para tokens que já
  // estavam no navegador. Senão, remover a env de um serviço em uso não fecharia
  // o acesso de quem já estava logado.
  if (parseUsers().length === 0) {
    return res.status(503).json({ error: 'Login indisponível: usuários não configurados.' });
  }
  const user = verifyToken(req.headers['x-session-token']);
  if (!user) return res.status(401).json({ error: 'Sessão expirada.' });
  req.user = user;
  next();
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Arquivos estáticos. JS e HTML são servidos com "no-cache" (o navegador pode
// guardar, mas DEVE revalidar com o servidor antes de usar) — assim todo deploy
// novo é pego automaticamente, sem precisar limpar cache no celular.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: function(res, filePath){
    if(filePath.endsWith('.js') || filePath.endsWith('.html')){
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // imagens/css: 1 dia
    }
  }
}));

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('<h2>Erro: código não encontrado na URL.</h2>');
  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    accessToken  = data.access_token;
    refreshToken = data.refresh_token;
    tokenExpires = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000);
    console.log('✅ Tokens obtidos! Expira em:', new Date(tokenExpires).toLocaleTimeString('pt-BR'));
    saveTokensToDisk(); // salva no disco persistente

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <style>body{font-family:sans-serif;background:#0C0E13;color:#EBE9E2;padding:40px;max-width:700px;margin:0 auto}
      h2{color:#2ECC8A} .box{background:#181B24;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:16px;margin:12px 0;word-break:break-all;font-family:monospace;font-size:12px}
      .lbl{font-size:11px;color:#8B8D9B;text-transform:uppercase;margin-bottom:6px}
      .warn{background:rgba(46,204,138,.13);border:1px solid rgba(46,204,138,.3);border-radius:8px;padding:14px;color:#2ECC8A;margin-top:20px;font-size:13px;line-height:1.6}
      button{background:#2ECC8A;color:#071A0F;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-top:6px}
      code{background:#111;padding:2px 6px;border-radius:4px;font-size:11px}
      </style></head><body>
      <h2>✅ Tokens gerados e salvos com sucesso!</h2>
      <div class="warn">
        ✅ <strong>Pronto! Não precisa fazer mais nada.</strong><br><br>
        Os tokens foram salvos automaticamente no disco persistente do servidor.
        O sistema vai renovar sozinho a partir de agora.<br><br>
        Pode fechar esta página.
      </div>
      <!-- Os tokens NÃO são mais exibidos aqui (11/08). Esta rota é pública por
           exigência do OAuth do Bling, então imprimir access/refresh token na tela
           entregava a credencial da empresa a quem abrisse a URL, e ela ficava no
           histórico do navegador. Os tokens já são salvos no disco automaticamente. -->
      </body></html>`);
  } catch (e) {
    // Detalhe do erro só no log do servidor: a mensagem vem do provedor e pode
    // conter dados sensíveis, além de virar HTML se ecoada na página.
    console.error('Erro callback:', e.message);
    res.status(400).send('<h2 style="color:red">Não foi possível concluir a autorização</h2>' +
      '<p>O código pode ter expirado. Acesse o Link de Convite novamente.</p>');
  }
});

// ═══ PERSISTÊNCIA DE TOKEN EM DISCO ═══
// Salva tokens em /data (disco persistente do Render) para sobreviver a restarts/crashes.
// NÃO usa a API do Render (que reiniciava o servidor e causava o loop de invalid_grant).
const TOKEN_FILE = '/data/bling-tokens.json';

function saveTokensToDisk() {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({
      accessToken, refreshToken, tokenExpires, savedAt: new Date().toISOString()
    }));
    console.log('💾 Tokens salvos no disco:', TOKEN_FILE);
  } catch (e) {
    console.warn('⚠ Não foi possível salvar tokens no disco:', e.message);
  }
}

function loadTokensFromDisk() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const t = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (t.refreshToken) {
        accessToken  = t.accessToken  || accessToken;
        refreshToken = t.refreshToken || refreshToken;
        tokenExpires = t.tokenExpires || tokenExpires;
        console.log('📂 Tokens carregados do disco (salvos em '+(t.savedAt||'?')+')');
        return true;
      }
    }
  } catch (e) {
    console.warn('⚠ Erro ao ler tokens do disco:', e.message);
  }
  console.log('📂 Sem tokens no disco — usando variáveis de ambiente');
  return false;
}

// Uma renovação por vez. Sem isso, várias chamadas que pegassem o token vencido
// ao mesmo tempo disparavam refreshes simultâneos com o MESMO refresh token —
// o Bling rotaciona esse token, então o segundo recebia invalid_grant e a
// integração podia cair no meio do expediente. Agora todos esperam a mesma.
let refreshEmAndamento = null;
async function refreshAccessToken() {
  if (refreshEmAndamento) return refreshEmAndamento;
  refreshEmAndamento = (async () => {
    try { return await _refreshAccessToken(); }
    finally { refreshEmAndamento = null; }
  })();
  return refreshEmAndamento;
}
async function _refreshAccessToken() {
  if (!refreshToken || !CLIENT_ID || !CLIENT_SECRET) {
    console.warn('⚠ Sem refresh token ou credenciais para renovar');
    return false;
  }
  try {
    console.log('🔄 Renovando token...');
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      timeout: 30000, // sem timeout, uma conexão pendurada aqui travaria a fila de despacho inteira
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    accessToken  = data.access_token;
    if (data.refresh_token) refreshToken = data.refresh_token;
    tokenExpires = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000);

    console.log('✅ Token renovado! Próxima renovação:', new Date(tokenExpires).toLocaleTimeString('pt-BR'));

    // Salva no disco (instantâneo, NÃO reinicia o servidor)
    saveTokensToDisk();
    return true;
  } catch (e) {
    console.error('❌ Erro ao renovar token:', e.message);
    return false;
  }
}

setInterval(async () => {
  if (tokenExpires > 0 && Date.now() > tokenExpires - 5 * 60 * 1000) {
    await refreshAccessToken();
  }
}, 2 * 60 * 1000);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── FREIO GLOBAL DE 429 (03/09) ───────────────────────────────────────────────
// O limite de requisições é da CONTA do Bling, não deste serviço. Quando outra
// rotina (ex: um backfill) estoura o teto, este app levava 429 e RETENTAVA por
// conta própria, em cada chamada — a fila de despacho sozinha fazia ~70 tentativas
// a cada 5 min, todas recusadas. Isso não recupera nada e ainda ajuda a manter o
// limite estourado (chegamos à tentativa 18 do mesmo pedido).
// Agora o primeiro 429 PAUSA todas as chamadas por um tempo crescente, e um
// sucesso libera. Recuar é o que faz a cota voltar.
// A pausa é gravada em disco: um Retry-After longo (cota diária) era zerado por
// qualquer deploy/restart do Render, e 5s depois do boot a fila voltava a chamar
// o Bling antes do prazo — recriando a sequência de 429 a cada reinício.
const PAUSA_FILE = '/data/bling-pausa.json';
let blingPausaAte = 0;
let bling429Seguidos = 0;
function salvarPausa() {
  // Temporário + rename, igual à fila de despacho: escrever direto no arquivo
  // final podia deixá-lo truncado numa queda, e aí o boot seguinte ignorava o
  // JSON inválido e voltava a chamar o Bling antes do prazo.
  const tmp = PAUSA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify({ ate: blingPausaAte, seguidos: bling429Seguidos }));
    fs.renameSync(tmp, PAUSA_FILE);
  } catch (e) { /* pausa continua valendo em memória */ }
}
function carregarPausa() {
  try {
    if (!fs.existsSync(PAUSA_FILE)) return;
    const d = JSON.parse(fs.readFileSync(PAUSA_FILE, 'utf8')) || {};
    if (d.ate && d.ate > Date.now()) {
      blingPausaAte = d.ate; bling429Seguidos = d.seguidos || 1;
      console.warn('⏸ Pausa do Bling retomada do disco: mais ' +
                   Math.ceil((blingPausaAte - Date.now()) / 1000) + 's');
    }
  } catch (e) {}
}
const PAUSA_ESCALA = [15000, 30000, 60000, 120000, 300000]; // 15s → 5min
function blingPausado() { return Date.now() < blingPausaAte; }
function blingSegundosRestantes() { return Math.ceil((blingPausaAte - Date.now()) / 1000); }
// Retry-After aceita segundos ("120") OU data absoluta ("Thu, 03 Sep 2026 20:00:00 GMT").
// Só o parseInt ignorava a segunda forma e voltávamos a chamar antes da liberação.
function retryAfterMs(valor) {
  if (!valor) return 0;
  const seg = parseInt(valor, 10);
  if (!isNaN(seg) && String(seg) === String(valor).trim()) return seg * 1000;
  const t = Date.parse(valor);
  return isNaN(t) ? 0 : Math.max(0, t - Date.now());
}
function registrar429(retryAfter) {
  const agora = Date.now();
  const espera429 = retryAfterMs(retryAfter);
  // 429 que chega DURANTE uma pausa é resposta de chamada que já estava em voo
  // quando a pausa começou — não é uma nova rodada de falha. Antes, cada uma
  // dessas incrementava a escala (15s virava 5min de uma vez) e podia ENCURTAR um
  // Retry-After longo já registrado. Agora só agrega, nunca reduz o prazo.
  if (blingPausado()) {
    if (espera429 > 0) {
      const novo = Math.max(blingPausaAte, agora + espera429);
      if (novo > blingPausaAte) { blingPausaAte = novo; salvarPausa(); agendarRetomadaDespacho(); }
    }
    return;
  }
  bling429Seguidos++;
  let espera = PAUSA_ESCALA[Math.min(bling429Seguidos - 1, PAUSA_ESCALA.length - 1)];
  if (espera429 > espera) espera = espera429;
  blingPausaAte = agora + espera;
  salvarPausa();
  console.warn('⏸ Bling recusou por limite (429) — pausando TODAS as chamadas por ' +
               Math.round(espera / 1000) + 's (rodadas seguidas: ' + bling429Seguidos + ')');
  // Assim que a pausa acabar, tenta a fila logo — sem esperar o ciclo de 5 min.
  agendarRetomadaDespacho();
}
// Reagenda a fila para o fim da pausa (mantendo o setInterval de 5 min como rede
// de segurança). Sem isso, um lote fechado durante uma pausa de 15s ficava em
// Verificado por quase 5 minutos com o Bling já liberado.
let retomadaAgendada = null, retomadaPara = 0, retomadaPerdida = false;
function agendarRetomadaDespacho() {
  const alvo = blingPausaAte;
  // Se a pausa foi ESTENDIDA por um 429 concorrente, reprograma: manter o timer
  // no prazo antigo faria a fila tentar cedo demais e levar 429 de novo.
  if (retomadaAgendada) {
    if (alvo <= retomadaPara) return;      // já agendado para o fim (ou depois)
    clearTimeout(retomadaAgendada);
  }
  retomadaPara = alvo;
  const falta = Math.max(1000, alvo - Date.now() + 500);
  retomadaAgendada = setTimeout(() => {
    retomadaAgendada = null; retomadaPara = 0;
    // Se uma rodada ainda está correndo, esta retomada se perde na trava —
    // marca para o finally reagendar UMA vez.
    if (despachoRodando) { retomadaPerdida = true; return; }
    processarFilaDespacho();
  }, falta);
  if (retomadaAgendada.unref) retomadaAgendada.unref();
}
function registrarSucessoBling() {
  if (bling429Seguidos === 0) return;
  // Um 2xx que chega DURANTE a pausa é de chamada que já estava em voo quando o
  // 429 apareceu — não prova que a cota voltou. Encerrar a pausa por causa dele
  // liberaria o tráfego antes do prazo que o próprio Bling pediu.
  if (blingPausado()) return;
  console.log('▶ Bling respondeu de novo — pausa liberada');
  bling429Seguidos = 0; blingPausaAte = 0; salvarPausa();
}

async function blingFetch(url, options = {}, retries = 3) {
  // Em pausa: nem tenta. Falhar rápido aqui é o que deixa a cota se recuperar.
  if (blingPausado()) {
    throw new Error('Bling em pausa por limite de requisições — liberando em ' + blingSegundosRestantes() + 's');
  }
  for (let i = 0; i < retries; i++) {
    if (tokenExpires > 0 && Date.now() > tokenExpires - 60 * 1000) {
      await refreshAccessToken();
    }

    // Revalida a pausa AQUI: entre a checagem inicial e este ponto pode ter havido
    // espera pela renovação do token (ou uma repetição após 401), e nesse intervalo
    // outra chamada pode ter acionado o freio. Sem isso, começaríamos tráfego novo
    // dentro do prazo pedido pelo Bling — justo o caso concorrente que o freio trata.
    if (blingPausado()) {
      throw new Error('Bling em pausa por limite de requisições — liberando em ' + blingSegundosRestantes() + 's');
    }
    // Timeout em TODAS as chamadas: node-fetch não tem padrão, então uma conexão
    // pendurada segurava o await pra sempre (e junto a fila de despacho e a
    // busca de NF, que rodam em série).
    const r = await fetch(url, {
      timeout: options.timeout || 30000,
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (r.status === 429) {
      // Registra o MOTIVO uma vez por pausa. O Bling tem dois limites diferentes —
      // por segundo (recupera em instantes) e o total do DIA (só zera à meia-noite)
      // — e sem o corpo da resposta não dá pra saber em qual esbarramos.
      const jaEstavaPausado = blingPausado();
      // A pausa entra AGORA, a partir do status e dos cabeçalhos. Ler o corpo antes
      // atrasaria isso por até 30s (timeout) e, nesse intervalo, as outras rotinas
      // continuariam disparando — recriando a avalanche que o freio evita.
      registrar429(r.headers && r.headers.get && r.headers.get('retry-after'));
      if (!jaEstavaPausado) {
        // Só para diagnóstico: o Bling tem limite por segundo e cota diária, e o
        // corpo é o único lugar que diz em qual esbarramos.
        try {
          const corpo = await r.text();
          if (corpo) console.warn('ℹ️ Motivo do 429 (Bling): ' + corpo.substring(0, 300));
        } catch (e) { /* corpo indisponível: a pausa já está valendo */ }
      }
      throw new Error('Bling recusou por limite de requisições (429)');
    }

    if (r.status === 401 && i < retries - 1) {
      console.warn('⚠ Token expirado (401) — renovando...');
      const ok = await refreshAccessToken();
      if (ok) continue;
    }

    // Qualquer resposta que NÃO seja 429 prova que o Bling processou a chamada —
    // inclusive um 400 (ex: "mesma situação", que a fila trata como concluído).
    // Antes só o 2xx zerava a escalada, então uma sequência de 400 mantinha o
    // contador alto e um 429 muito posterior já entrava com pausa grande.
    registrarSucessoBling();
    return r;
  }
  throw new Error('Máximo de tentativas atingido');
}

// ── Freio contra tentativas repetidas de login (11/08) ──────────────────────
// Antes não havia limite: dava pra testar senha indefinidamente. Conta por
// IP+usuário (não por IP puro) pra um funcionário errando a senha não travar o
// login dos colegas, que saem do mesmo IP do galpão.
const LOGIN_MAX = 10;                    // tentativas erradas...
const LOGIN_JANELA = 10 * 60 * 1000;     // ...dentro de 10 min
const LOGIN_BLOQUEIO = 3 * 60 * 1000;    // bloqueio de 3 min
const tentativasLogin = new Map();
function ipDe(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0] : '').trim() || req.socket.remoteAddress || '?';
}
function limparTentativas() {
  const agora = Date.now();
  for (const [k, v] of tentativasLogin) if (agora > v.expira) tentativasLogin.delete(k);
}
setInterval(limparTentativas, 10 * 60 * 1000);

// Saúde do serviço — usada por monitor externo (keepalive) e por você.
// Não expõe segredo nenhum: só diz se as peças essenciais estão de pé.
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    em: new Date().toISOString(),
    bling_autorizado: !!accessToken,
    usuarios_configurados: parseUsers().length,
    pacotes: sharedPackages.length,
    scans: sharedScans.length,
    despacho_pendente: despachoFila.length,
    bling_em_pausa: blingPausado() ? blingSegundosRestantes() + 's' : false
  });
});

app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  const chave = ipDe(req) + '|' + String(usuario || '').slice(0, 60);
  const agora = Date.now();
  const reg = tentativasLogin.get(chave);

  if (reg && reg.bloqueadoAte && agora < reg.bloqueadoAte) {
    const faltam = Math.ceil((reg.bloqueadoAte - agora) / 1000);
    console.warn('⛔ login bloqueado (' + chave + ') — faltam ' + faltam + 's');
    res.setHeader('Retry-After', String(faltam));
    return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em ' + Math.ceil(faltam / 60) + ' min.' });
  }

  const usuarios = parseUsers();
  if (usuarios.length === 0) {
    console.error('⛔ LOGIN INDISPONÍVEL: variável USERS não configurada no Render.');
    return res.status(503).json({ error: 'Login indisponível: usuários não configurados. Avise o administrador.' });
  }
  const found = usuarios.find(u => u.nome === usuario && u.senha === senha);
  if (!found) {
    const base = (reg && agora < reg.expira) ? reg : { n: 0, expira: agora + LOGIN_JANELA };
    base.n++;
    if (base.n >= LOGIN_MAX) {
      base.bloqueadoAte = agora + LOGIN_BLOQUEIO;
      base.n = 0;
      console.warn('⛔ login BLOQUEADO por ' + (LOGIN_BLOQUEIO / 60000) + ' min — ' + chave);
    }
    tentativasLogin.set(chave, base);
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  tentativasLogin.delete(chave); // acertou: zera o contador
  const token = generateToken(usuario);
  res.json({ token, usuario });
});

app.post('/logout', (req, res) => {
  // Sessão stateless: não há estado no servidor para remover.
  // O cliente apaga o token do localStorage; o token expira sozinho em 24h.
  res.json({ ok: true });
});

app.get('/me', requireAuth, (req, res) => res.json({ usuario: req.user }));


// ── NF do pedido pelo VÍNCULO REAL (11/08) ──────────────────────────────────
// ANTES: as rotas abaixo paginavam /nfe e escolhiam a primeira nota com id ATÉ
// 2000 acima do id do pedido ("TOLERANCE"). Isso é um CHUTE: em volume alto a NF
// de OUTRO cliente podia ser colada no pacote — e a NF vira um código aceito na
// bipagem, além de exibir dado de outra pessoa. Impacto fiscal.
// AGORA: lê o vínculo que o próprio Bling devolve no detalhe do pedido
// (order.notaFiscal). Sem vínculo => NF fica vazia (pendente), nunca adivinhada.
// Retorna {numero,chave} | null (Bling CONFIRMOU que não há NF) | {erro:true}
// (falha do Bling — não é o mesmo que "sem NF", e não deve virar cooldown).
async function nfDoPedido(pedidoId) {
  const r = await blingFetch(`${BLING_BASE}/pedidos/vendas/${pedidoId}`);
  if (!r.ok) return { erro: true };
  const d = await r.json().catch(() => ({}));
  const ped = (d && d.data) || {};
  const nf = ped.notaFiscal || ped.nfe || null;
  if (!nf) return null;
  let numero = nf.numero || '';
  let chave  = nf.chaveAcesso || nf.chave || '';
  // Detalhe às vezes traz só o id da nota: busca o restante por ID (vínculo exato).
  if (nf.id && (!numero || !chave)) {
    const r2 = await blingFetch(`${BLING_BASE}/nfe/${nf.id}`);
    if (r2.ok) {
      const d2 = await r2.json().catch(() => ({}));
      const n2 = (d2 && d2.data) || {};
      numero = numero || n2.numero || '';
      chave  = chave  || n2.chaveAcesso || n2.chave || '';
    }
  }
  if (!numero && !chave) return null;
  return { numero: String(numero || ''), chave: String(chave || '').replace(/\s/g, '') };
}

// Rota especial: busca NF vinculada ao pedido testando parâmetros corretos do Bling v3
// Busca NF correta para um pedido — pagina /nfe até achar ID próximo ao blingId do pedido
app.get('/nf-pedido/:blingId', requireAuth, async (req, res) => {
  try {
    const nf = await nfDoPedido(parseInt(req.params.blingId));
    if (!nf || nf.erro) return res.json({ numero: '', chave: '' });
    res.json(nf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// BATCH: busca NFs para múltiplos pedidos de uma vez só (muito mais rápido)
// ── Cache da NF por pedido (12/08) ────────────────────────────────────────────
// A busca de NF faz 1-2 chamadas ao Bling POR PEDIDO. Sem cache, os mesmos
// pedidos eram reconsultados a cada pull (10 em 10 min): ~45s de chamadas
// seguidas com 60 pedidos, saturando o limite do Bling e deixando bipar/
// despachar/buscar lentos pra todo mundo.
const nfCache = new Map();        // blingId -> {numero, chave, ts}
const nfSemNota = new Map();      // blingId -> ts da última confirmação "sem NF"
const NF_COOLDOWN = 12 * 60 * 1000;      // sem NF: só repergunta depois disso
const NF_TTL = 4 * 60 * 60 * 1000;       // NF em cache vale 4h (nota pode ser cancelada/substituída)
const NF_CACHE_MAX = 5000;
// Orçamento GLOBAL de consultas: vale para o servidor inteiro, não por requisição.
// Sem isso, dois celulares/abas puxando ao mesmo tempo dobravam as consultas.
const NF_JANELA = 60 * 1000, NF_MAX_JANELA = 25;
let nfJanelaInicio = 0, nfJanelaUsadas = 0;
function nfPodeConsultar() {
  const agora = Date.now();
  if (agora - nfJanelaInicio > NF_JANELA) { nfJanelaInicio = agora; nfJanelaUsadas = 0; }
  if (nfJanelaUsadas >= NF_MAX_JANELA) return false;
  nfJanelaUsadas++; return true;
}
// Serializa: uma busca de NF por vez no servidor, mesmo com vários aparelhos.
let nfFila = Promise.resolve();
function nfSerializar(fn) {
  const p = nfFila.then(fn, fn);
  nfFila = p.then(() => {}, () => {});
  return p;
}
function nfGuardar(mapa, chave, valor) {
  if (mapa.size >= NF_CACHE_MAX) mapa.delete(mapa.keys().next().value);
  mapa.set(chave, valor);
}

app.post('/nfs-batch', requireAuth, async (req, res) => {
  const { pedidos } = req.body;
  if (!Array.isArray(pedidos) || pedidos.length === 0) return res.json({ nfs: {} });

  const ids = pedidos.map(p => parseInt(p.blingId)).filter(id => id > 0).map(String);
  const result = {};
  const agora = Date.now();
  let doCache = 0, consultas = 0, semNota = 0, esperando = 0, semOrcamento = 0;

  // O que já está em cache sai de graça (não gasta consulta nem orçamento).
  const aConsultar = [];
  for (const k of ids) {
    const c = nfCache.get(k);
    if (c && (agora - c.ts) < NF_TTL) { result[k] = { numero: c.numero, chave: c.chave }; doCache++; continue; }
    if (c) nfCache.delete(k);                       // venceu: reconsulta
    const visto = nfSemNota.get(k);
    if (visto && (agora - visto) < NF_COOLDOWN) { esperando++; continue; }
    aConsultar.push(k);
  }
  // RODÍZIO: quem NUNCA foi consultado vai primeiro. Sem isso, com muitos pedidos
  // sem NF os do fim da lista nunca chegavam a ser consultados.
  aConsultar.sort((a, b) => (nfSemNota.has(a) ? 1 : 0) - (nfSemNota.has(b) ? 1 : 0));

  try {
    await nfSerializar(async () => {
      for (const k of aConsultar) {
        if (nfCache.has(k)) { const c = nfCache.get(k); result[k] = { numero: c.numero, chave: c.chave }; doCache++; continue; }
        if (!nfPodeConsultar()) { semOrcamento++; continue; }
        consultas++;
        let nf = null;
        try {
          nf = await nfDoPedido(parseInt(k));
        } catch (e) {
          // Falha isolada não pode abortar o lote inteiro: sem este try/catch,
          // um erro num pedido deixava todos os seguintes sem consulta justamente
          // durante uma instabilidade do Bling.
          console.warn('nfs-batch: falha no pedido ' + k + ': ' + e.message);
          await sleep(120);
          continue;
        }
        if (nf && nf.erro) {
          // Falha do Bling: NÃO marca cooldown — tenta de novo na próxima rodada.
        } else if (nf && nf.numero) {
          nfGuardar(nfCache, k, { numero: nf.numero, chave: nf.chave, ts: Date.now() });
          result[k] = { numero: nf.numero, chave: nf.chave };
        } else if (nf) {
          // Veio parcial (sem número): o cliente não usa, então não vira cache
          // positivo — entra no cooldown e é tentado de novo depois.
          nfGuardar(nfSemNota, k, Date.now());
        } else {
          nfGuardar(nfSemNota, k, Date.now());   // Bling confirmou: ainda sem NF
          semNota++;
        }
        await sleep(120); // respeita o limite de requisições do Bling
      }
    });
    console.log('✅ NFs: ' + Object.keys(result).length + '/' + ids.length +
                ' (cache: ' + doCache + ' | consultas: ' + consultas + ' | sem NF: ' + semNota +
                ' | cooldown: ' + esperando + ' | fora do orçamento: ' + semOrcamento + ')');
    res.json({ nfs: result });
  } catch (e) {
    console.error('❌ nfs-batch erro:', e.message);
    res.status(500).json({ error: e.message, nfs: result });
  }
});

app.get('/bling-nf/:blingId', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY // diagnóstico temporário
  const id = req.params.blingId;
  const results = {};
  // Testa todos os parâmetros possíveis do endpoint /nfe do Bling v3
  const numero = req.query.numero || '';
  const data = req.query.data || '';
  const contato = req.query.contato || '';
  // A NF tem o campo "numero do pedido" — testar filtros que usam isso
  const params = [
    'numeroPedido='+numero,
    'pedido='+numero,
    'numeroPedidoVenda='+numero,
    'numPedido='+numero,
    'idPedidoVenda='+id,
    'numeroVenda='+numero,
    'idVendas='+id+'&limite=5',
  ];
  for (const p of params) {
    try {
      const r = await blingFetch(BLING_BASE + '/nfe?' + p + '&limite=5');
      const d = await r.json().catch(() => ({}));
      results[p] = { status: r.status, count: (d.data||[]).length, first: (d.data||[])[0] };
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch(e) { results[p] = { error: e.message }; }
  }
  // Também tenta endpoint alternativo
  try {
    const r2 = await blingFetch(BLING_BASE + '/pedidos/vendas/' + id + '/nfe');
    results['pedidos/vendas/{id}/nfe'] = { status: r2.status };
    await new Promise(resolve => setTimeout(resolve, 300));
  } catch(e) { results['pedidos/vendas/{id}/nfe'] = { error: e.message }; }
  res.json(results);
});

// Proxy do Bling — ALLOWLIST (12/08). Antes encaminhava qualquer método e
// qualquer caminho: uma sessão de estoquista (ou token roubado) podia alterar ou
// APAGAR recursos no Bling muito além da expedição. O app só precisa de leitura
// de pedidos e do PATCH que muda a situação — o resto está bloqueado.
function proxyBlingPermitido(metodo, caminho) {
  let p = (caminho || '').split('?')[0];
  // Normaliza ANTES de validar: sem isso, /pedidos/vendas/../../produtos passava
  // no teste de prefixo e o node-fetch resolvia para /produtos ao montar a URL.
  try { p = decodeURIComponent(p); } catch (e) { return false; }
  if (p.indexOf('..') !== -1 || p.indexOf('//') !== -1 || p.indexOf('\\') !== -1) return false;
  if (metodo === 'GET') {
    // O front só lê pedidos por aqui (listagem e detalhe). NF, contatos e demais
    // recursos ficam de fora: não são usados e exporiam dado fiscal/de cliente.
    return /^\/pedidos\/vendas(\/\d+)?$/.test(p);
  }
  if (metodo === 'PATCH') {
    // Exatamente o despacho: /pedidos/vendas/{id}/situacoes/{DESPACHADO_ID}.
    // DESPACHADO_ID é lido aqui dentro (em tempo de chamada) — no topo do arquivo
    // ele ainda não existe e o processo nem subia.
    const m = p.match(/^\/pedidos\/vendas\/(\d+)\/situacoes\/(\d+)$/);
    return !!m && m[2] === String(DESPACHADO_ID);
  }
  return false; // POST, PUT, DELETE e o resto: nunca pelo proxy
}

app.all('/bling/*', requireAuth, async (req, res) => {
  const caminhoBling = req.originalUrl.replace(/^\/bling/, '');
  if (!proxyBlingPermitido(req.method, caminhoBling)) {
    console.warn('⛔ Proxy Bling bloqueado: ' + req.method + ' ' + caminhoBling + ' (usuário: ' + (req.user || '?') + ')');
    return res.status(403).json({ error: 'operação não permitida por este caminho' });
  }
  if (!accessToken) {
    const ok = await refreshAccessToken();
    if (!ok) return res.status(500).json({
      error: 'Token do Bling não configurado. Acesse /callback para autorizar.'
    });
  }

  const blingPath = req.path.replace('/bling', '');
  const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const url = BLING_BASE + blingPath + query;

  try {
    const writeMethod = ['POST','PUT','PATCH','DELETE'].includes(req.method);
    if(writeMethod) await sleep(700);

    const r = await blingFetch(url, {
      method: req.method,
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    const data = await r.json().catch(() => ({}));
    // Log NF responses para diagnóstico
    if(url.includes('/nfe')){
      console.log('🧾 NF request:', url);
      console.log('🧾 NF response:', JSON.stringify(data).substring(0,300));
    }
    // Bling 401 vira 502 para não confundir com erro de sessão do nosso servidor
    const statusOut = r.status === 401 ? 502 : r.status;
    res.status(statusOut).json(data);
  } catch (err) {
    // Em pausa: devolve 503 com o tempo QUE FALTA, pra quem chamou esperar o
    // prazo real em vez de uma tabela fixa (que podia esgotar antes da liberação).
    if (blingPausado()) {
      const faltam = blingSegundosRestantes();
      console.warn('⏸ Proxy recusado: Bling em pausa (' + faltam + 's)');
      return res.status(503).json({ error: 'Bling em pausa por limite de requisições', pausaSegundos: faltam });
    }
    console.error('Erro proxy Bling:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/info/pedido/:id', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  try {
    await sleep(300);
    const r = await blingFetch(BLING_BASE + '/pedidos/vendas/' + req.params.id);
    const data = await r.json();
    const p = data.data || data;
    res.json({
      id: p.id,
      numero: p.numero,
      situacao: p.situacao,
      loja: p.loja,
      contato: p.contato?.nome,
      transporte: p.transporte,
    });
  } catch(e) { res.json({ error: e.message }); }
});

// ── DESPACHAR (mover pedidos para DESPACHADOS = 743515) ─────────────────────
// Recebe os IDs do lote e faz os PATCHs NO SERVIDOR, em background, com throttle.
// Antes o cliente agendava setTimeout e fechava o card na hora — se o app fechasse
// (ou o iPhone descarregasse) antes dos timers dispararem, os pedidos ficavam presos
// em VERIFICADO. Aqui o servidor garante o despacho independente do app.
// blingFetch já cuida de renovação de token, rate-limit 429 e retry.
const DESPACHADO_ID = 743515;
// ── FILA DURÁVEL DE DESPACHO (11/08) ─────────────────────────────────────────
// ANTES: /despachar respondia "ok" e rodava um laço só na MEMÓRIA do processo.
// Deploy, restart ou crash no meio levava embora o que faltava: o operador via o
// lote finalizado com sucesso e os pedidos seguiam em Verificado no Bling, sem
// aviso nenhum. AGORA os IDs vão pro disco ANTES da resposta, saem da fila só
// quando o Bling confirma, são retomados no boot e retentados a cada 5 min.
const DESPACHO_FILE = '/data/despacho-fila.json';
let despachoFila = [];      // [{id, tentativas, ultimoErro, ts}]
let despachoFalhas = [];    // desistências, guardadas p/ consulta
let despachoRodando = false;
const DESPACHO_MAX_TENT = 8;

function loadDespachoFila() {
  try {
    if (fs.existsSync(DESPACHO_FILE)) {
      const d = JSON.parse(fs.readFileSync(DESPACHO_FILE, 'utf8')) || {};
      despachoFila   = Array.isArray(d.fila) ? d.fila : [];
      despachoFalhas = Array.isArray(d.falhas) ? d.falhas : [];
    }
  } catch (e) {
    console.error('❌ Fila de despacho ilegível (' + e.message + ') — tentando o backup');
    try {
      const b = JSON.parse(fs.readFileSync(DESPACHO_FILE + '.bak', 'utf8')) || {};
      despachoFila   = Array.isArray(b.fila) ? b.fila : [];
      despachoFalhas = Array.isArray(b.falhas) ? b.falhas : [];
      console.warn('♻ Fila recuperada do backup: ' + despachoFila.length + ' pendente(s)');
      // Regrava o arquivo principal AGORA, direto, sem copiar o corrompido por
      // cima do .bak — senão a primeira gravação normal destruiria o backup bom.
      try { fs.writeFileSync(DESPACHO_FILE, JSON.stringify({ fila: despachoFila, falhas: despachoFalhas })); }
      catch (e3) { console.error('❌ Não consegui regravar a fila principal:', e3.message); }
    } catch (e2) { console.error('❌ Backup da fila também ilegível — começando vazia'); }
  }
}
// Grava em arquivo temporário e renomeia: se o processo cair no meio, o arquivo
// final continua íntegro (a versão anterior fica em .bak). Devolve true/false —
// quem chama PRECISA saber se a fila ficou mesmo no disco.
function saveDespachoFila() {
  const tmp = DESPACHO_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify({ fila: despachoFila, falhas: despachoFalhas }));
    try { if (fs.existsSync(DESPACHO_FILE)) fs.copyFileSync(DESPACHO_FILE, DESPACHO_FILE + '.bak'); } catch (e) {}
    fs.renameSync(tmp, DESPACHO_FILE);
    return true;
  } catch (e) {
    console.error('❌ Erro ao salvar fila de despacho:', e.message);
    return false;
  }
}

async function processarFilaDespacho() {
  if (despachoRodando || despachoFila.length === 0) return;
  // Pausa global ativa: pula a rodada inteira sem gastar tentativa. Antes, cada
  // um dos pedidos da fila queimava 3 chamadas recusadas a cada 5 minutos.
  if (blingPausado()) {
    console.log('⏸ Fila de despacho adiada: Bling em pausa (' + blingSegundosRestantes() + 's) — ' +
                despachoFila.length + ' pendente(s)');
    agendarRetomadaDespacho();   // volta assim que liberar, não só no ciclo de 5 min
    return;
  }
  despachoRodando = true;
  let reprocessar = false;
  try {
    const lote = despachoFila.slice(); // snapshot: uma passada por rodada
    for (const item of lote) {
      if (blingPausado()) {   // entrou em pausa no meio: para a rodada aqui
        console.log('⏸ Rodada de despacho interrompida — Bling em pausa');
        break;
      }
      if (!despachoFila.some(x => x.id === item.id)) continue; // já saiu da fila
      let sucesso = false, erro = '', transitorio = false;
      try {
        // timeout explícito: sem ele uma conexão pendurada (node-fetch 2 não tem
        // timeout padrão) travaria a fila inteira para sempre.
        const r = await blingFetch(BLING_BASE + '/pedidos/vendas/' + item.id + '/situacoes/' + DESPACHADO_ID, { method: 'PATCH', timeout: 30000 });
        if (r.ok) sucesso = true;
        else {
          const t = await r.text();
          erro = r.status + ' ' + t.substring(0, 150);
          // "A venda possui a mesma situação" = já está despachado: resolvido.
          if (r.status === 400 && /mesma situa/i.test(t)) { sucesso = true; erro = ''; }
          // 429/5xx/408 são temporários — não contam para a desistência.
          // 401 = token/renovação falhou agora, mas a credencial pode voltar depois;
          // 429/408/5xx = instabilidade. Nenhum deles é motivo pra desistir do pedido.
          else if (r.status === 401 || r.status === 429 || r.status === 408 || r.status >= 500) transitorio = true;
        }
      } catch (e) { erro = e.message; transitorio = true; } // rede/timeout = temporário

      if (sucesso) {
        despachoFila = despachoFila.filter(x => x.id !== item.id);
        // Se este pedido já tinha desistido antes, marca a desistência como
        // resolvida — senão continua aparecendo na rota admin como se precisasse
        // de intervenção.
        despachoFalhas.forEach(f => { if (f.id === item.id && !f.resolvidoEm) f.resolvidoEm = new Date().toISOString(); });
        console.log('✅ DESPACHADO (fila): #' + item.id);
      } else {
        const alvo = despachoFila.find(x => x.id === item.id);
        if (alvo) {
          alvo.tentativas = (alvo.tentativas || 0) + 1;   // total, só p/ visibilidade
          if (!transitorio) alvo.tentativasPerm = (alvo.tentativasPerm || 0) + 1;
          alvo.ultimoErro = erro;
          alvo.transitorio = transitorio;
          // Só desiste de erro PERMANENTE (ex: pedido inexistente). Bling fora do
          // ar, 429 ou timeout ficam na fila e continuam sendo tentados a cada
          // 5 min — desistir aí deixaria o pedido em Verificado sem ninguém saber.
          if (!transitorio && alvo.tentativasPerm >= DESPACHO_MAX_TENT) {
            despachoFila = despachoFila.filter(x => x.id !== item.id);
            despachoFalhas.push({ id: item.id, tentativas: alvo.tentativas, tentativasPerm: alvo.tentativasPerm, ultimoErro: erro, em: new Date().toISOString() });
            console.error('⛔ Despacho do #' + item.id + ' desistiu após ' + alvo.tentativasPerm + ' falha(s) permanente(s): ' + erro);
          } else {
            console.warn('⚠ Falha despacho #' + item.id + ' (tentativa ' + alvo.tentativas +
                         (transitorio ? ', temporária — segue na fila' : '; permanentes ' + alvo.tentativasPerm + '/' + DESPACHO_MAX_TENT) + '): ' + erro);
          }
        }
      }
      saveDespachoFila();
      await sleep(700); // throttle entre PATCHs — respeita o limite ~3 req/s do Bling
    }
    // Pedidos que entraram DURANTE esta rodada não estavam no snapshot: roda de
    // novo já, em vez de deixá-los esperando os 5 min do timer.
    const idsDoLote = new Set(lote.map(x => x.id));
    reprocessar = despachoFila.some(x => !idsDoLote.has(x.id));
    if (reprocessar) console.log('▶ Novos despachos entraram durante a rodada — processando em seguida');
    else if (despachoFila.length) console.log('⏳ Fila de despacho: ' + despachoFila.length + ' pendente(s) — nova tentativa em 5 min');
  } finally {
    // A trava é liberada UMA vez, aqui. Agendar o reprocessamento depois evita
    // liberar uma trava que já pertence a outra rodada.
    despachoRodando = false;
    // Se o timer de retomada disparou enquanto esta rodada ainda lia o corpo de um
    // 429, ele voltou sem fazer nada (trava ativa). Reagenda aqui para a fila não
    // ficar esperando o ciclo de 5 min.
    // Reagenda imediato SÓ se uma retomada foi realmente perdida pela trava.
    // Sem essa condição, qualquer rodada com item pendente (ex: erro permanente
    // 400) reagendava a cada 1s — martelando o Bling, justo o oposto do freio.
    if (blingPausado()) {
      if (despachoFila.length) agendarRetomadaDespacho();
    } else if (retomadaPerdida && despachoFila.length) {
      retomadaPerdida = false;
      const t = setTimeout(processarFilaDespacho, 1000);
      if (t.unref) t.unref();
    } else {
      retomadaPerdida = false;   // o ciclo de 5 min cuida do resto
    }
  }
  if (reprocessar) setTimeout(processarFilaDespacho, 100);
}

app.post('/despachar', requireAuth, (req, res) => {
  const { blingIds } = req.body;
  if (!Array.isArray(blingIds) || blingIds.length === 0) return res.status(400).json({ error: 'blingIds obrigatório' });
  const ids = [...new Set(blingIds.filter(Boolean).map(String))]; // sem duplicatas/vazios
  // GRAVA ANTES de responder: se o processo cair agora, a fila continua no disco.
  const naFila = new Set(despachoFila.map(x => x.id));
  const antes = despachoFila.slice();
  ids.forEach(id => { if (!naFila.has(id)) despachoFila.push({ id, tentativas: 0, ts: Date.now() }); });
  // Se não conseguiu gravar, NÃO confirma: o cliente precisa saber pra cair no
  // fallback dele. Confirmar aqui faria o operador fechar o lote achando que está
  // garantido, e um restart levaria os despachos embora.
  if (!saveDespachoFila()) {
    despachoFila = antes; // desfaz, pra não ficar só na memória achando que persistiu
    return res.status(500).json({ ok: false, erro: 'não foi possível gravar a fila de despacho' });
  }
  res.json({ ok: true, total: ids.length, naFila: despachoFila.length });
  processarFilaDespacho();
});

// Consulta o que ainda não foi despachado (e o que desistiu)
app.get('/admin/despacho-fila', (req, res) => {
  if (!adminOk(req)) return res.status(404).send('Not found');
  const naoResolvidas = despachoFalhas.filter(f => !f.resolvidoEm);
  res.json({
    pendentes: despachoFila.length,
    fila: despachoFila,
    desistencias_abertas: naoResolvidas.length,
    falhas: naoResolvidas.slice(-100),
    falhas_resolvidas: despachoFalhas.length - naoResolvidas.length
  });
});

// Diagnóstico: busca pedido pelo NÚMERO e mostra o serviço de entrega de forma legível
app.get('/info/servico/:numero', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  try {
    await sleep(300);
    const r = await blingFetch(BLING_BASE + '/pedidos/vendas?numero=' + req.params.numero + '&limite=5');
    const data = await r.json();
    const lista = data.data || [];
    if (lista.length === 0) return res.send('<pre>Pedido ' + req.params.numero + ' não encontrado (pode não estar VERIFICADO no Bling).</pre>');
    // Busca detalhe completo do primeiro
    await sleep(400);
    const r2 = await blingFetch(BLING_BASE + '/pedidos/vendas/' + lista[0].id);
    const d2 = await r2.json();
    const p = d2.data || d2;
    const t = p.transporte || {};
    const vol = (t.volumes && t.volumes[0]) || {};
    const out = {
      numero: p.numero,
      id: p.id,
      situacao_id: p.situacao && p.situacao.id,
      loja_id: p.loja && p.loja.id,
      '--- SERVIÇO DE ENTREGA ---': '---',
      etiqueta_servico: t.etiqueta && t.etiqueta.servico,
      volume_servico: vol.servico,
      transportadora_nome: (t.contato && t.contato.nome) || (t.transportadora),
      frete_por_conta: t.fretePorConta,
      tracking: vol.numeracao || vol.codigoRastreamento,
      '--- TRANSPORTE COMPLETO ---': '---',
      transporte: t,
    };
    res.send('<html><body style="font-family:monospace;background:#0c0e13;color:#2ECC8A;padding:20px"><h3>Pedido ' + p.numero + '</h3><pre style="white-space:pre-wrap;color:#EBE9E2">' + JSON.stringify(out, null, 2) + '</pre></body></html>');
  } catch(e) { res.send('<pre>Erro: ' + e.message + '</pre>'); }
});

app.get('/info/count24', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  try {
    const r = await blingFetch(BLING_BASE + '/pedidos/vendas?idSituacao=24&limite=100&pagina=1');
    const d = await r.json();
    const all = d.data || [];
    const real24 = all.filter(o => o.situacao?.id === 24);
    res.json({
      http_status: r.status,
      total_retornados: all.length,
      realmente_id24: real24.length,
      outros_ids: [...new Set(all.map(o=>o.situacao?.id))],
      exemplos_id24: real24.slice(0,3).map(o=>({
        id: o.id, numero: o.numero, situacao: o.situacao, data: o.data, loja: o.loja?.id
      })),
    });
  } catch(e) { res.json({ erro: e.message }); }
});

app.get('/info/situacoes', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  if (!accessToken) return res.json({ error: 'Token não configurado' });
  try {
    await sleep(300);
    const r = await blingFetch(BLING_BASE + '/situacoes?limite=100&pagina=1');
    const data = await r.json();
    const situacoes = (data.data || []).map(s => ({ id: s.id, nome: s.nome, modulo: s.modulo?.nome || '' }));
    res.json({ total: situacoes.length, situacoes });
  } catch(e) { res.json({ error: e.message }); }
});

app.get('/info/teste-filtro', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  const results = {};
  const params = ['idSituacao=24','idsSituacoes=24','situacao=24','situacoes=24'];
  for(const p of params){
    try{
      await sleep(400);
      const r = await blingFetch(BLING_BASE + '/pedidos/vendas?' + p + '&limite=5&pagina=1');
      const d = await r.json();
      results[p] = { status: r.status, total: d.data?.length || 0, primeiro_id_sit: d.data?.[0]?.situacao?.id || 'N/A' };
    }catch(e){ results[p] = {erro: e.message}; }
  }
  res.json(results);
});

app.get('/info/teste-data', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  const today = new Date().toISOString().split('T')[0];
  const d30 = new Date(); d30.setDate(d30.getDate()-30);
  const from = d30.toISOString().split('T')[0];
  const results = {};
  const tests = [
    `idSituacao=24&dataEmissaoInicial=${from}&dataEmissaoFinal=${today}`,
    `idSituacao=24&dataInicial=${from}&dataFinal=${today}`,
    `idSituacao=24`,
  ];
  for(const p of tests){
    try{
      await sleep(400);
      const r = await blingFetch(BLING_BASE + '/pedidos/vendas?' + p + '&limite=5&pagina=1');
      const d = await r.json();
      results[p.substring(0,50)] = { http: r.status, qtd: d.data?.length ?? 'N/A' };
    }catch(e){ results[p.substring(0,50)] = {erro: e.message}; }
  }
  res.json(results);
});

let migrationRunning = false;
let migrationLog = [];

app.get('/admin/migrar-verificados', async (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  if(migrationRunning) return res.json({ status: 'rodando', log: migrationLog.slice(-20) });
  migrationRunning = true;
  migrationLog = ['Iniciando migração...'];
  res.json({ status: 'iniciado', msg: 'Acesse /admin/migrar-status para acompanhar' });

  (async () => {
    try {
      let page = 1; let total = 0; let erros = 0; let hasMore = true;
      while(hasMore) {
        await sleep(400);
        const r = await blingFetch(`${BLING_BASE}/pedidos/vendas?idSituacao=24&pagina=${page}&limite=100`);
        const d = await r.json();
        const orders = d.data || [];
        if(orders.length === 0) { hasMore = false; break; }
        if(blingPausado()) {
          migrationLog.push(`⏸ Interrompido antes da página ${page}: Bling em pausa (${blingSegundosRestantes()}s).`);
          hasMore = false; break;
        }
        migrationLog.push(`Página ${page}: ${orders.length} pedidos encontrados`);
        for(const o of orders) {
          // Freio ativo: PARA a migração. Antes, cada pedido caía no catch e
          // contava como erro — uma pausa de 15s pulava ~10 pedidos sem sequer
          // consultar o Bling, e um prazo longo varria o lote inteiro anunciando
          // conclusão sem ter despachado nada.
          if(blingPausado()) {
            migrationLog.push(`⏸ Interrompido: Bling em pausa (${blingSegundosRestantes()}s). ${total} despachado(s) até aqui — rode de novo após a liberação.`);
            hasMore = false;
            break;
          }
          try {
            await sleep(1500);
            let ok = false;
            for(let attempt = 0; attempt < 5; attempt++) {
              const patch = await blingFetch(`${BLING_BASE}/pedidos/vendas/${o.id}/situacoes/743515`,{ method: 'PATCH' });
              if(patch.status === 429) { await sleep(Math.pow(2, attempt+1) * 2000); continue; }
              if(patch.ok) { ok = true; break; }
              else { break; }
            }
            if(ok) total++; else erros++;
          } catch(e) { erros++; }
        }
        migrationLog.push(`✓ Página ${page} — ${total} movidos, ${erros} erros`);
        await sleep(3000);
        if(orders.length < 100) hasMore = false;
        else page++;
      }
      migrationLog.push(`✅ CONCLUÍDO! Total: ${total}, Erros: ${erros}`);
    } catch(e) {
      migrationLog.push('❌ Erro: ' + e.message);
    } finally {
      migrationRunning = false;
    }
  })();
});

app.get('/admin/migrar-status', (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found'); // protegido: exige ?k=ADMIN_KEY
  res.json({ rodando: migrationRunning, log: migrationLog });
});

// ═══ SYNC — packages e scans (sem fotos) compartilhados entre dispositivos ═══
// Persistidos em disco (/data) para sobreviver a restarts e crashes (OOM).
let sharedPackages = [];
let sharedScans    = [];

const PACKAGES_FILE = '/data/shared-packages.json';
const SCANS_FILE    = '/data/shared-scans.json';
const REMOVIDOS_FILE = '/data/pacotes-removidos.json';
// Janela de dados "quentes" trafegada nos ciclos de sincronização. O histórico
// inteiro continua no servidor e é servido sob demanda (?full=1).
const SYNC_JANELA_DIAS = 7;

// ── LÁPIDES DE PEDIDOS REMOVIDOS ─────────────────────────────────────────────
// { blingId: timestamp }. Como a AUSÊNCIA numa lista não apaga mais nada, é esta
// lista que autoriza a remoção — e ela também impede que um celular atrasado
// recadastre o fantasma no sync seguinte (ele voltaria a aparecer pra bipagem).
let pacotesRemovidos = {};
const REMOVIDO_TTL = 7 * 24 * 60 * 60 * 1000;
function loadRemovidos() {
  try { if (fs.existsSync(REMOVIDOS_FILE)) pacotesRemovidos = JSON.parse(fs.readFileSync(REMOVIDOS_FILE, 'utf8')) || {}; }
  catch (e) { console.warn('⚠ Erro ao ler removidos:', e.message); }
  const lim = Date.now() - REMOVIDO_TTL;
  Object.keys(pacotesRemovidos).forEach(k => { if (pacotesRemovidos[k] < lim) delete pacotesRemovidos[k]; });
}
function saveRemovidos() {
  const tmp = REMOVIDOS_FILE + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(pacotesRemovidos)); fs.renameSync(tmp, REMOVIDOS_FILE); }
  catch (e) { console.warn('⚠ Erro ao salvar removidos:', e.message); }
}
loadRemovidos();

function loadSharedFromDisk() {
  sharedPackages = lerComBackup(PACKAGES_FILE, 'packages');
  sharedScans    = lerComBackup(SCANS_FILE, 'scans');
  console.log('💾 Disco: ' + sharedPackages.length + ' pacote(s), ' + sharedScans.length + ' scan(s)');
}

// Grava em arquivo temporário, guarda a versão anterior em .bak e só então
// renomeia. Antes era escrita direta: uma queda no meio (deploy, restart, disco
// cheio) deixava o JSON cortado e, no boot seguinte, o app subia com a lista
// VAZIA — e o primeiro sync consolidava esse vazio. Mesma técnica já usada na
// fila de despacho.
function gravarSeguro(arquivo, dados, rotulo) {
  const tmp = arquivo + '.tmp';
  const bak = arquivo + '.bak';
  try {
    fs.writeFileSync(tmp, JSON.stringify(dados));
    // O antigo vira backup por RENOMEAÇÃO, não por cópia: copiar podia falhar no
    // meio (disco cheio, I/O) e deixar o .bak truncado — aí o principal seria
    // promovido assim mesmo e ficaríamos sem socorro nenhum. Renomear é atômico.
    try { if (fs.existsSync(arquivo)) fs.renameSync(arquivo, bak); } catch (e) {
      console.warn('⚠ Não consegui preservar o backup de ' + rotulo + ': ' + e.message);
    }
    fs.renameSync(tmp, arquivo);
    return true;
  } catch (e) {
    console.error('❌ Erro ao salvar ' + rotulo + ':', e.message);
    // Se caiu entre renomear o antigo e promover o novo, o principal não existe:
    // devolve o backup para o lugar em vez de deixar o arquivo sumido.
    try { if (!fs.existsSync(arquivo) && fs.existsSync(bak)) fs.renameSync(bak, arquivo); } catch (e2) {}
    return false;
  }
}
// Grava SÓ o conjunto que mudou. Antes toda sincronização reserializava os dois
// arrays inteiros (e writeFileSync trava o processo enquanto escreve), então um
// POST de pacotes também regravava os 10 mil bipes, e vice-versa.
function savePackagesToDisk() { gravarSeguro(PACKAGES_FILE, sharedPackages, 'packages'); }
function saveScansToDisk()    { gravarSeguro(SCANS_FILE, sharedScans, 'scans'); }
function saveSharedToDisk() { savePackagesToDisk(); saveScansToDisk(); }
// Lê o arquivo e, se estiver corrompido, cai no .bak antes de desistir.
function lerComBackup(arquivo, rotulo) {
  try {
    if (fs.existsSync(arquivo)) return JSON.parse(fs.readFileSync(arquivo, 'utf8')) || [];
    // Principal SUMIU (queda entre renomear o antigo e promover o novo): o .bak
    // tem o estado anterior. Antes isso devolvia lista vazia.
    if (fs.existsSync(arquivo + '.bak')) {
      const b = JSON.parse(fs.readFileSync(arquivo + '.bak', 'utf8')) || [];
      console.warn('♻ ' + rotulo + ' ausente — recuperado do backup: ' + b.length + ' registro(s)');
      try { fs.writeFileSync(arquivo, JSON.stringify(b)); } catch (e0) {}
      return b;
    }
    return [];
  } catch (e) {
    console.error('❌ ' + rotulo + ' ilegível (' + e.message + ') — tentando o backup');
    try {
      const b = JSON.parse(fs.readFileSync(arquivo + '.bak', 'utf8')) || [];
      console.warn('♻ ' + rotulo + ' recuperado do backup: ' + b.length + ' registro(s)');
      // Regrava o principal AGORA, direto, pra não copiar o corrompido por cima
      // do backup bom na próxima gravação normal.
      try { fs.writeFileSync(arquivo, JSON.stringify(b)); } catch (e3) {}
      return b;
    } catch (e2) {
      console.error('❌ Backup de ' + rotulo + ' também ilegível — começando vazio');
      return [];
    }
  }
}

// Remove scans com mais de 45 dias para não estourar memória/disco (evita OOM)
function limparScansAntigos() {
  const LIMITE_DIAS = 45;
  const hoje = new Date();
  const antes = sharedScans.length;
  sharedScans = sharedScans.filter(function(s){
    if(!s || !s.date) return true; // mantém se não tiver data
    const d = new Date(s.date);
    if(isNaN(d.getTime())) return true;
    const diasAtras = (hoje - d) / (1000*60*60*24);
    return diasAtras <= LIMITE_DIAS;
  });
  if(sharedScans.length < antes){
    console.log('🧹 Removidos '+(antes-sharedScans.length)+' scans com mais de '+LIMITE_DIAS+' dias');
    saveScansToDisk();
  }
}

// ═══ FOTOS — Supabase Storage (permanente, acessível de qualquer dispositivo) ═══
// Configurar no Render: SUPABASE_URL e SUPABASE_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wexikjzztxpfdbzjfnxl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleGlranp6dHhwZmRiempmbnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTg2MjMsImV4cCI6MjA5MDY3NDYyM30.s-Vu3pJETbVw9VbmqhtFhKiDgnPocubFgkHPVeQyMus';
const SUPABASE_BUCKET = 'expedicao';

// Testa conexão com Supabase no startup
async function testSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.log('⚠ Supabase não configurado'); return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${SUPABASE_BUCKET}`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const d = await r.json();
    if (r.ok) console.log('✅ Supabase bucket OK:', d.name, 'public:', d.public);
    else console.error('❌ Supabase bucket erro:', JSON.stringify(d));
  } catch(e) { console.error('❌ Supabase conexão falhou:', e.message); }
}
setTimeout(testSupabase, 3000);

// Fallback em memória enquanto Supabase não estiver configurado
const photoStore = new Map();
const MAX_PHOTOS = 500;

async function supabaseUpload(fileName, base64Data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Sem Supabase: usa memória
    if (photoStore.size >= MAX_PHOTOS) {
      const firstKey = photoStore.keys().next().value;
      photoStore.delete(firstKey);
    }
    photoStore.set(fileName, base64Data);
    return { ok: true, url: null };
  }
  try {
    // Remove prefixo base64 se houver
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const contentType = base64Data.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!r.ok) {
      const err = await r.text();
      console.error(`❌ Supabase upload FALHOU [${r.status}] ${fileName}:`, err.substring(0,300));
      photoStore.set(fileName, base64Data);
      return { ok: false };
    }
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
    console.log('✅ Foto salva no Supabase:', fileName);
    return { ok: true, url: publicUrl };
  } catch(e) {
    console.error('Supabase erro:', e.message);
    photoStore.set(fileName, base64Data); // fallback memória
    return { ok: false };
  }
}

async function supabaseGet(fileName) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return photoStore.get(fileName) || null;
  }
  // Tenta memória primeiro (mais rápido)
  if (photoStore.has(fileName)) return photoStore.get(fileName);
  try {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
    // Retorna URL pública diretamente — cliente carrega a imagem
    return publicUrl;
  } catch(e) {
    return null;
  }
}

// Estado de quem está fazendo expedição agora
const activeUsers = new Map(); // user → {user, mkt, ts}

app.get('/sync/data', requireAuth, (req, res) => {
  const now = Date.now();
  const active = [...activeUsers.values()].filter(u => now - u.ts < 1800000);
  // Devolve também as lápides: sem isso, o celular com cache antigo continuava
  // mostrando (e podendo bipar) um pedido que já foi removido no servidor.
  // JANELA LEVE por padrão (13/08). Antes devolvia TUDO — 6.656 pacotes e 10.230
  // bipes — a cada 30s, por aparelho. O histórico completo só vai quando a tela de
  // Histórico pede (?full=1), uma vez, em vez de em todo ciclo de sincronização.
  if (req.query.full === '1') {
    return res.json({ packages: sharedPackages, scans: sharedScans, activeUsers: active,
      removidos: Object.keys(pacotesRemovidos), completo: true });
  }
  const lim = new Date(Date.now() - SYNC_JANELA_DIAS * 86400000)
                .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const recente = (x) => !x || !x.date || x.date >= lim;
  res.json({
    packages: sharedPackages.filter(recente),
    scans: sharedScans.filter(recente),
    activeUsers: active,
    removidos: Object.keys(pacotesRemovidos),
    completo: false
  });
});

app.post('/sync/active', requireAuth, (req, res) => {
  const { user, mkt, ts } = req.body;
  if(user){
    if(mkt) activeUsers.set(user, { user, mkt, ts });
    else activeUsers.delete(user);
  }
  res.json({ ok: true });
});

// ── MERGE DE PEDIDOS (13/08) ──────────────────────────────────────────────────
// ANTES: o servidor guardava a lista do ÚLTIMO celular que sincronizasse. Dois
// estoquistas bipando junto = o trabalho de um sobrescrevia o do outro (o clássico
// "marquei coletado e voltou pra pendente").
// AGORA: junta pedido a pedido. Ausência NUNCA apaga: a remoção só acontece com a
// lista explícita de fantasmas confirmados pelo Bling.
const RANK_STATUS = { pendente: 0, problema: 1, coletado: 2 };
function mesclarPacote(atual, novo, confirmado) {
  // Dia diferente = possível novo ciclo do pedido (voltou pro Verificado hoje
  // depois de coletado ontem). SÓ aceitamos essa troca quando o Bling confirmou
  // a busca: o app promove localmente a data de pendentes antigos para hoje, e
  // sem essa trava um celular desatualizado substituiria o registro coletado de
  // ontem por uma cópia de hoje sem colTs, corrompendo o histórico.
  const ehVazio = (v) => (v === undefined || v === null || v === '' || v === '—' ||
                          (Array.isArray(v) && v.length === 0));
  if (novo.date && atual.date && novo.date !== atual.date) {
    if (!confirmado) return atual;
    if (novo.date < atual.date) return atual;
    // Novo ciclo: o estado (status/colTs) é o do ciclo novo, mas os campos de
    // identificação que vierem vazios herdam o valor já conhecido — a resposta
    // resumida do Bling costuma vir sem NF, tracking ou número da loja.
    const nc = Object.assign({}, novo);
    Object.keys(atual).forEach(k => {
      if (['status','colT','colTs','obs','date'].indexOf(k) !== -1) return;
      if (ehVazio(nc[k]) && !ehVazio(atual[k])) nc[k] = atual[k];
    });
    return nc;
  }
  const r = Object.assign({}, atual);
  // Campo preenchido nunca é apagado por vazio (NF, tracking, destinatário...).
  // '—' é o marcador de "sem contato" do pull e conta como vazio.
  Object.keys(novo).forEach(k => { if (!ehVazio(novo[k])) r[k] = novo[k]; });
  // FLEX: `false` não é vazio, então um celular desatualizado desmarcaria o
  // urgente e o pedido sumiria do card FLEX. Só rebaixa com busca confirmada.
  if (atual.urgente === true && novo.urgente !== true && !confirmado) r.urgente = true;
  // Status: quem tem a coleta mais RECENTE vence (colTs em ms). Assim uma correção
  // posterior ("problema" depois de "coletado") também é respeitada.
  const tA = atual.colTs || 0, tB = novo.colTs || 0;
  if (tA || tB) {
    const vencedor = tB >= tA ? novo : atual;
    r.status = vencedor.status; r.colT = vencedor.colT; r.colTs = vencedor.colTs;
    // A observação pertence ao evento: vem do MESMO vencedor.
    r.obs = vencedor.obs || '';
  } else {
    r.status = (RANK_STATUS[novo.status] || 0) >= (RANK_STATUS[atual.status] || 0) ? novo.status : atual.status;
  }
  return r;
}

app.post('/sync/packages', requireAuth, (req, res) => {
  const { packages, removidos, confirmado } = req.body;
  if (Array.isArray(packages)) {
    const idx = new Map();
    sharedPackages.forEach(p => { if (p && p.blingId != null) idx.set(String(p.blingId), p); });

    // "Voltou de verdade" = o ID veio na RESPOSTA DO BLING desta busca (idsBling),
    // não apenas na carga do celular. A carga inclui cache local e histórico, então
    // usá-la deixaria um aparelho antigo ressuscitar o fantasma.
    const doBling = new Set(Array.isArray(req.body.idsBling) ? req.body.idsBling.map(String) : []);
    const voltouDeVerdade = (k) => !!confirmado && doBling.has(k);

    let novos = 0, atualizados = 0, bloqueados = 0;
    packages.forEach(p => {
      if (!p || p.blingId == null) return;
      const k = String(p.blingId);
      if (pacotesRemovidos[k] && (Date.now() - pacotesRemovidos[k]) > REMOVIDO_TTL) delete pacotesRemovidos[k];
      if (pacotesRemovidos[k]) {
        if (!voltouDeVerdade(k)) { bloqueados++; return; }   // celular atrasado: não ressuscita
        delete pacotesRemovidos[k];                          // Bling confirmou: pedido voltou
        saveRemovidos();
      }
      const atual = idx.get(k);
      if (atual) { idx.set(k, mesclarPacote(atual, p, !!confirmado)); atualizados++; }
      else { idx.set(k, p); novos++; }
    });

    // Remoção SÓ com lista explícita e busca confirmada pelo Bling.
    let removidosOk = 0;
    if (confirmado && Array.isArray(removidos)) {
      removidos.forEach(id => {
        const k = String(id);
        if (doBling.has(k)) return;          // o Bling devolveu o pedido: não remove
        if (idx.delete(k)) removidosOk++;
        pacotesRemovidos[k] = Date.now();
      });
      if (removidosOk || removidos.length) saveRemovidos();
    }

    sharedPackages = Array.from(idx.values());
    savePackagesToDisk();   // só os pacotes mudaram
    if (novos || removidosOk || bloqueados) {
      console.log('🔄 sync/packages: +' + novos + ' novos, ' + atualizados + ' atualizados, ' +
                  removidosOk + ' removidos, ' + bloqueados + ' bloqueados (lápide) — total ' + sharedPackages.length);
    }
    return res.json({ ok: true, total: sharedPackages.length, removidos: removidosOk });
  }
  res.json({ ok: true });
});

// Chave única de um scan (mesmo formato usado no cliente)
function scanKeyOf(s){ return s && s.tipo==='lote' ? 'L_'+s.id : 'S_'+(s?s.etiqueta:'')+'_'+(s?s.date:'')+'_'+(s?s.time:''); }

app.post('/sync/scans', requireAuth, (req, res) => {
  const { scans, removedKeys } = req.body;
  if(Array.isArray(scans)){
    // ── MERGE (união) em vez de substituição ──
    // Antes: sharedScans = scans → quem sincronizava por último APAGAVA os dados
    // dos outros dispositivos (lotes do histórico sumiam). Agora: mescla por chave.
    const map = new Map();
    sharedScans.forEach(s => { if(s) map.set(scanKeyOf(s), s); });
    scans.forEach(s => {
      if(!s) return;
      const k = scanKeyOf(s);
      const cur = map.get(k);
      if(!cur) { map.set(k, s); return; }
      // Cliente atualiza: lote sempre (pode ganhar obs/fotos), scan se ganhou loteId
      if(s.tipo==='lote') { map.set(k, s); return; }
      if(s.loteId && !cur.loteId) { map.set(k, s); return; }
    });
    // Remoções intencionais do cliente (cancelar bipagem, fechar card, expirar 25min)
    if(Array.isArray(removedKeys)) removedKeys.forEach(k => map.delete(k));
    // Dedup re-bipagem: por etiqueta+date, prefere quem tem loteId, senão o mais recente
    const winners = new Map(); const all = [...map.values()];
    all.forEach(s => {
      if(s.tipo==='lote') return;
      const k2 = s.etiqueta+'_'+s.date;
      const cur = winners.get(k2);
      if(!cur) winners.set(k2, s);
      else if(s.loteId && !cur.loteId) winners.set(k2, s);
      else if(!s.loteId && cur.loteId) { /* mantém cur */ }
      else if((s.ts||0) > (cur.ts||0)) winners.set(k2, s);
    });
    sharedScans = all.filter(s => s.tipo==='lote' || winners.get(s.etiqueta+'_'+s.date)===s);
    saveScansToDisk();      // só os scans mudaram
  }
  res.json({ ok: true });
});

// ─── Upload de foto de scan ─────────────────────────────────────────────────
app.post('/photos/scan', requireAuth, async (req, res) => {
  const { key, photo } = req.body;
  if(!key || !photo) return res.status(400).json({ error: 'key e photo obrigatórios' });
  // Devolve o RESULTADO REAL do upload (antes descartava e respondia ok sempre).
  // O cliente espera a url; sem ela ele achava que falhou e reenviava a foto 4x,
  // e no fim marcava como "perdida" mesmo quando o Supabase tinha salvado.
  const r = await supabaseUpload(key, photo);
  if (!r || !r.ok) return res.status(502).json({ ok: false, erro: 'falha ao salvar a foto no storage' });
  res.json({ ok: true, url: r.url || null });
});

app.get('/photos/scan/:key', requireAuth, async (req, res) => {
  const photo = await supabaseGet(req.params.key);
  if(!photo) return res.status(404).json({ error: 'Foto não encontrada' });
  // Se for URL pública do Supabase, retorna a URL (cliente carrega direto)
  if(photo.startsWith('http')) return res.json({ url: photo });
  res.json({ photo });
});

// ─── Upload de fotos do veículo (lote) ─────────────────────────────────────
app.post('/photos/lote', requireAuth, async (req, res) => {
  const { loteId, fotos } = req.body;
  if(!loteId || !Array.isArray(fotos)) return res.status(400).json({ error: 'loteId e fotos obrigatórios' });
  // Confere cada upload e reporta o que falhou (antes respondia sucesso mesmo
  // se NENHUMA foto tivesse sido salva).
  let salvas = 0; const falhas = [];
  for(let idx = 0; idx < fotos.length; idx++) {
    if(!fotos[idx]) continue;
    const r = await supabaseUpload('lote_'+loteId+'_'+idx, fotos[idx]);
    if (r && r.ok) salvas++; else falhas.push(idx);
  }
  if (falhas.length) return res.status(502).json({ ok: false, salvas, falhas, erro: 'falha ao salvar foto(s) do lote' });
  res.json({ ok: true, count: salvas });
});

app.get('/photos/lote/:loteId/:idx', requireAuth, async (req, res) => {
  const key = 'lote_'+req.params.loteId+'_'+req.params.idx;
  const photo = await supabaseGet(key);
  if(!photo) return res.status(404).json({ error: 'Foto não encontrada' });
  if(photo.startsWith('http')) return res.json({ url: photo });
  res.json({ photo });
});

// ═══ STARTUP ═══
loadTokensFromDisk();   // lê tokens do disco (fallback: env vars)
loadSharedFromDisk();   // lê packages e scans do disco
limparScansAntigos();   // remove scans antigos (evita OOM)
// Limpa scans antigos a cada 6 horas
setInterval(limparScansAntigos, 6 * 60 * 60 * 1000);

// Fila de despacho: retoma o que sobrou de um restart/deploy e retenta o que falhou
carregarPausa();
loadDespachoFila();
if (despachoFila.length) {
  console.log('♻ Retomando ' + despachoFila.length + ' despacho(s) pendente(s) do disco');
  setTimeout(processarFilaDespacho, 5000);
}
setInterval(processarFilaDespacho, 5 * 60 * 1000);

// ── BACKUP dos dados operacionais (protegido por ?k=ADMIN_KEY) ──────────────
// Baixa um JSON com packages + scans compartilhados (o conteúdo do disco /data).
// NÃO inclui os tokens do Bling (segredo — recuperáveis via re-autorização OAuth).
app.get('/admin/backup', (req, res) => {
  if(!adminOk(req)) return res.status(404).send('Not found');
  const hoje = new Date().toISOString().slice(0,10);
  res.setHeader('Content-Disposition', 'attachment; filename="backup-expedicao-'+hoje+'.json"');
  res.json({
    geradoEm: new Date().toISOString(),
    totalPackages: sharedPackages.length,
    totalScans: sharedScans.length,
    // A fila de despacho também vive só em /data — sem ela no backup, perder o
    // volume significaria perder os pedidos ainda não despachados.
    totalDespachoPendente: despachoFila.length,
    packages: sharedPackages,
    scans: sharedScans,
    despachoFila: despachoFila,
    despachoFalhas: despachoFalhas,
    // As lápides também vivem só em /data: sem elas no backup, uma restauração
    // traria de volta os pedidos que foram removidos de propósito.
    pacotesRemovidos: pacotesRemovidos
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔐 Sessões: STATELESS (token assinado) — sobrevive a restart`);
  console.log(`📦 Client ID: ${CLIENT_ID ? '✓ configurado' : '✗ NÃO configurado'}`);
  console.log(`🔑 Access Token: ${accessToken ? '✓ presente' : '✗ ausente — acesse /callback'}`);
  console.log(`🔄 Refresh Token: ${refreshToken ? '✓ presente' : '✗ ausente'}`);
  console.log(`👥 Usuários: ${parseUsers().map(u => u.nome).join(', ')}`);
});
