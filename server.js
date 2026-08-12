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
if (!process.env.USERS) console.warn('⚠ USERS não configurada — o login usará o usuário padrão. Configure no Render.');
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

async function refreshAccessToken() {
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

async function blingFetch(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    if (tokenExpires > 0 && Date.now() > tokenExpires - 60 * 1000) {
      await refreshAccessToken();
    }

    const r = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (r.status === 429) {
      const waitMs = i === 0 ? 2000 : Math.pow(2, i) * 1000;
      console.warn(`⚠ Rate limit (429) — aguardando ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

    if (r.status === 401 && i < retries - 1) {
      console.warn('⚠ Token expirado (401) — renovando...');
      const ok = await refreshAccessToken();
      if (ok) continue;
    }

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
    despacho_pendente: despachoFila.length
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
async function nfDoPedido(pedidoId) {
  const r = await blingFetch(`${BLING_BASE}/pedidos/vendas/${pedidoId}`);
  if (!r.ok) return null;
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
    if (!nf) return res.json({ numero: '', chave: '' });
    res.json(nf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// BATCH: busca NFs para múltiplos pedidos de uma vez só (muito mais rápido)
app.post('/nfs-batch', requireAuth, async (req, res) => {
  const { pedidos } = req.body;
  if (!Array.isArray(pedidos) || pedidos.length === 0) return res.json({ nfs: {} });

  // Teto de segurança: evita que um payload grande vire centenas de chamadas ao Bling.
  const ids = pedidos.map(p => parseInt(p.blingId)).filter(id => id > 0).slice(0, 80);
  const result = {};
  let semVinculo = 0;
  try {
    for (const id of ids) {
      try {
        const nf = await nfDoPedido(id);
        if (nf) result[id] = nf; else semVinculo++;
      } catch (e) {
        console.warn('nfs-batch: falha no pedido ' + id + ': ' + e.message);
      }
      await sleep(120); // respeita o limite de requisições do Bling
    }
    console.log(`✅ NFs por vínculo: ${Object.keys(result).length}/${ids.length} (sem NF ainda: ${semVinculo})`);
    res.json({ nfs: result });
  } catch (e) {
    console.error('❌ nfs-batch erro:', e.message);
    res.status(500).json({ error: e.message, nfs: {} });
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
const SITUACOES_PERMITIDAS = [String(DESPACHADO_ID), '24', '9'];
function proxyBlingPermitido(metodo, caminho) {
  const p = (caminho || '').split('?')[0];
  if (metodo === 'GET') {
    // leitura de pedidos, notas e situações — o que as telas usam
    return /^\/(pedidos\/vendas|nfe|situacoes|contatos)(\/|$)/.test(p);
  }
  if (metodo === 'PATCH') {
    // exatamente o formato /pedidos/vendas/{id}/situacoes/{idSituacao}
    const m = p.match(/^\/pedidos\/vendas\/(\d+)\/situacoes\/(\d+)$/);
    return !!m && SITUACOES_PERMITIDAS.indexOf(m[2]) !== -1;
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
  despachoRodando = true;
  let reprocessar = false;
  try {
    const lote = despachoFila.slice(); // snapshot: uma passada por rodada
    for (const item of lote) {
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
        migrationLog.push(`Página ${page}: ${orders.length} pedidos encontrados`);
        for(const o of orders) {
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

function loadSharedFromDisk() {
  try {
    if (fs.existsSync(PACKAGES_FILE)) {
      sharedPackages = JSON.parse(fs.readFileSync(PACKAGES_FILE, 'utf8')) || [];
      console.log('📂 '+sharedPackages.length+' packages carregados do disco');
    }
  } catch(e) { console.warn('⚠ Erro ao ler packages do disco:', e.message); }
  try {
    if (fs.existsSync(SCANS_FILE)) {
      sharedScans = JSON.parse(fs.readFileSync(SCANS_FILE, 'utf8')) || [];
      console.log('📂 '+sharedScans.length+' scans carregados do disco');
    }
  } catch(e) { console.warn('⚠ Erro ao ler scans do disco:', e.message); }
}

function saveSharedToDisk() {
  try { fs.writeFileSync(PACKAGES_FILE, JSON.stringify(sharedPackages)); }
  catch(e) { console.warn('⚠ Erro ao salvar packages:', e.message); }
  try { fs.writeFileSync(SCANS_FILE, JSON.stringify(sharedScans)); }
  catch(e) { console.warn('⚠ Erro ao salvar scans:', e.message); }
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
    saveSharedToDisk();
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
  res.json({ packages: sharedPackages, scans: sharedScans, activeUsers: active });
});

app.post('/sync/active', requireAuth, (req, res) => {
  const { user, mkt, ts } = req.body;
  if(user){
    if(mkt) activeUsers.set(user, { user, mkt, ts });
    else activeUsers.delete(user);
  }
  res.json({ ok: true });
});

app.post('/sync/packages', requireAuth, (req, res) => {
  const { packages, confirmado } = req.body;
  if(Array.isArray(packages)){
    // FREIO ANTI-APAGAMENTO (11/08): esta rota substitui a lista INTEIRA do
    // servidor pela do aparelho. Um celular com lista incompleta (guardado há
    // dias, localStorage truncado, ou busca no Bling que veio parcial) apagava
    // pedidos que os outros celulares tinham registrado.
    // Redução normal do dia a dia continua passando; só recusa uma queda brusca.
    // confirmado=true: a redução veio de uma busca BEM-SUCEDIDA no Bling (o cliente
    // removeu fantasmas de propósito). Nesse caso o freio não se aplica, senão os
    // fantasmas voltariam do servidor e poderiam ser expedidos indevidamente.
    const atual = sharedPackages.length;
    if (!confirmado && atual >= 20 && packages.length < Math.floor(atual * 0.5)) {
      console.warn('⚠ /sync/packages RECUSADO: aparelho enviou ' + packages.length +
                   ' pacote(s) contra ' + atual + ' no servidor (usuário: ' + (req.user || '?') + ')');
      return res.status(409).json({ ok: false, recusado: true,
        motivo: 'envio muito menor que o estado atual do servidor', atual, recebido: packages.length });
    }
    sharedPackages = packages;
    saveSharedToDisk();
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
    saveSharedToDisk();
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
    despachoFalhas: despachoFalhas
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
