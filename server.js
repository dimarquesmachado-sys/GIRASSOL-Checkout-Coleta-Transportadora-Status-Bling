const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BLING_BASE = 'https://api.bling.com.br/Api/v3';

const CLIENT_ID      = process.env.BLING_CLIENT_ID || '';
const CLIENT_SECRET  = process.env.BLING_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'girassol-2024';

let accessToken  = process.env.BLING_ACCESS_TOKEN || '';
let refreshToken = process.env.BLING_REFRESH_TOKEN || '';
let tokenExpires = accessToken ? Date.now() + 50 * 60 * 1000 : 0;

function parseUsers() {
  const raw = process.env.USERS || 'admin:girassol123';
  return raw.split(',').map(u => {
    const [nome, senha] = u.trim().split(':');
    return { nome: nome?.trim(), senha: senha?.trim() };
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
      <details style="margin-top:24px;color:#8B8D9B">
        <summary style="cursor:pointer;font-size:12px">Ver tokens (caso queira copiar manualmente)</summary>
        <div class="lbl" style="margin-top:12px">BLING_ACCESS_TOKEN</div>
        <div class="box">${accessToken}</div>
        <div class="lbl" style="margin-top:12px">BLING_REFRESH_TOKEN</div>
        <div class="box">${refreshToken}</div>
      </details>
      </body></html>`);
  } catch (e) {
    console.error('Erro callback:', e.message);
    res.send(`<h2 style="color:red">Erro: ${e.message}</h2><p>O código pode ter expirado. Acesse o Link de Convite novamente.</p>`);
  }
});

// ═══ PERSISTÊNCIA DE TOKEN EM DISCO ═══
// Salva tokens em /data (disco persistente do Render) para sobreviver a restarts/crashes.
// NÃO usa a API do Render (que reiniciava o servidor e causava o loop de invalid_grant).
const fs = require('fs');
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

app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;
  const found = parseUsers().find(u => u.nome === usuario && u.senha === senha);
  if (!found) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  const token = generateToken(usuario);
  res.json({ token, usuario });
});

app.post('/logout', (req, res) => {
  // Sessão stateless: não há estado no servidor para remover.
  // O cliente apaga o token do localStorage; o token expira sozinho em 24h.
  res.json({ ok: true });
});

app.get('/me', requireAuth, (req, res) => res.json({ usuario: req.user }));

// Rota especial: busca NF vinculada ao pedido testando parâmetros corretos do Bling v3
// Busca NF correta para um pedido — pagina /nfe até achar ID próximo ao blingId do pedido
app.get('/nf-pedido/:blingId', requireAuth, async (req, res) => {
  const { blingId } = req.params;
  const pedidoId = parseInt(blingId);
  const TOLERANCE = 2000; // NF criada até 2000 IDs depois do pedido
  const MAX_PAGES = 10;
  try {
    for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
      await new Promise(r => setTimeout(r, pagina > 1 ? 400 : 0));
      const url = `${BLING_BASE}/nfe?limite=100&pagina=${pagina}`;
      const r = await blingFetch(url);
      if (!r.ok) break;
      const d = await r.json().catch(() => ({}));
      const nfes = d.data || [];
      if (nfes.length === 0) break;
      // NFs vêm em ordem decrescente de ID — verifica se já passamos do range
      const minId = Math.min(...nfes.map(n => n.id));
      // Procura NF com ID próximo ao pedido (criada logo depois)
      const candidatas = nfes
        .filter(n => n.id > pedidoId && n.id <= pedidoId + TOLERANCE)
        .sort((a, b) => a.id - b.id);
      if (candidatas.length > 0) {
        const nfe = candidatas[0];
        return res.json({ numero: nfe.numero, chave: nfe.chaveAcesso || nfe.chave || '', id: nfe.id });
      }
      // Se o menor ID desta página já é menor que o pedidoId, não vai achar em páginas seguintes
      if (minId < pedidoId - TOLERANCE) break;
    }
    res.json({ numero: '', chave: '' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// BATCH: busca NFs para múltiplos pedidos de uma vez só (muito mais rápido)
app.post('/nfs-batch', requireAuth, async (req, res) => {
  const { pedidos } = req.body;
  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    return res.json({ nfs: {} });
  }

  const TOLERANCE = 2000;
  const result = {};
  const pedidoIds = pedidos.map(p => parseInt(p.blingId)).filter(id => id > 0);
  if (pedidoIds.length === 0) return res.json({ nfs: {} });

  const minPedido = Math.min(...pedidoIds);
  const maxPedido = Math.max(...pedidoIds);

  try {
    let allNfes = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      if (pagina > 1) await new Promise(r => setTimeout(r, 300));
      const url = `${BLING_BASE}/nfe?limite=100&pagina=${pagina}`;
      const r = await blingFetch(url);
      if (!r.ok) break;
      const d = await r.json().catch(() => ({}));
      const nfes = d.data || [];
      if (nfes.length === 0) break;
      allNfes = allNfes.concat(nfes);
      const minId = Math.min(...nfes.map(n => n.id));
      if (minId < minPedido - TOLERANCE) break;
    }

    console.log(`📋 NFs batch: ${allNfes.length} NFs, ${pedidoIds.length} pedidos`);

    for (const pedidoId of pedidoIds) {
      const candidatas = allNfes
        .filter(n => n.id > pedidoId && n.id <= pedidoId + TOLERANCE)
        .sort((a, b) => a.id - b.id);
      if (candidatas.length > 0) {
        const nfe = candidatas[0];
        result[pedidoId] = {
          numero: nfe.numero,
          chave: nfe.chaveAcesso || nfe.chave || ''
        };
      }
    }

    console.log(`✅ NFs encontradas: ${Object.keys(result).length}/${pedidoIds.length}`);
    res.json({ nfs: result });
  } catch(e) {
    console.error('❌ nfs-batch erro:', e.message);
    res.status(500).json({ error: e.message, nfs: {} });
  }
});

app.get('/bling-nf/:blingId', async (req, res) => { // diagnóstico temporário
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

app.all('/bling/*', requireAuth, async (req, res) => {
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

// Diagnóstico: busca pedido pelo NÚMERO e mostra o serviço de entrega de forma legível
app.get('/info/servico/:numero', async (req, res) => {
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
  const { packages } = req.body;
  if(Array.isArray(packages)){
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
  await supabaseUpload(key, photo);
  res.json({ ok: true });
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
  for(let idx = 0; idx < fotos.length; idx++) {
    if(fotos[idx]) await supabaseUpload('lote_'+loteId+'_'+idx, fotos[idx]);
  }
  res.json({ ok: true, count: fotos.length });
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔐 Sessões: STATELESS (token assinado) — sobrevive a restart`);
  console.log(`📦 Client ID: ${CLIENT_ID ? '✓ configurado' : '✗ NÃO configurado'}`);
  console.log(`🔑 Access Token: ${accessToken ? '✓ presente' : '✗ ausente — acesse /callback'}`);
  console.log(`🔄 Refresh Token: ${refreshToken ? '✓ presente' : '✗ ausente'}`);
  console.log(`👥 Usuários: ${parseUsers().map(u => u.nome).join(', ')}`);
});
