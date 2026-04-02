const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BLING_BASE = 'https://www.bling.com.br/Api/v3';

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

const sessions = new Map();
function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function requireAuth(req, res, next) {
  const auth = req.headers['x-session-token'];
  if (!auth || !sessions.has(auth)) return res.status(401).json({ error: 'Não autorizado.' });
  const s = sessions.get(auth);
  if (Date.now() - s.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(auth);
    return res.status(401).json({ error: 'Sessão expirada.' });
  }
  req.user = s.user;
  next();
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('<h2>Erro: código não encontrado na URL.</h2>');
  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
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

    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <style>body{font-family:sans-serif;background:#0C0E13;color:#EBE9E2;padding:40px;max-width:700px;margin:0 auto}
      h2{color:#2ECC8A} .box{background:#181B24;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:16px;margin:12px 0;word-break:break-all;font-family:monospace;font-size:12px}
      .lbl{font-size:11px;color:#8B8D9B;text-transform:uppercase;margin-bottom:6px}
      .warn{background:rgba(240,164,66,.13);border:1px solid rgba(240,164,66,.3);border-radius:8px;padding:14px;color:#F0A442;margin-top:20px;font-size:13px;line-height:1.6}
      button{background:#2ECC8A;color:#071A0F;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-top:6px}
      code{background:#111;padding:2px 6px;border-radius:4px;font-size:11px}
      </style></head><body>
      <h2>✅ Tokens gerados com sucesso!</h2>
      <p style="color:#8B8D9B;margin-bottom:20px">Copie os valores abaixo e cole no Render → Environment → Save, rebuild, and deploy</p>
      <div class="lbl">BLING_ACCESS_TOKEN</div>
      <div class="box">${accessToken}</div>
      <button onclick="navigator.clipboard.writeText('${accessToken}').then(()=>this.textContent='Copiado!')">Copiar Access Token</button>
      <div class="lbl" style="margin-top:16px">BLING_REFRESH_TOKEN</div>
      <div class="box">${refreshToken}</div>
      <button onclick="navigator.clipboard.writeText('${refreshToken}').then(()=>this.textContent='Copiado!')">Copiar Refresh Token</button>
      <div class="warn">
        ⚠ <strong>Cole os dois tokens no Render agora:</strong><br><br>
        1. Abra o Render → seu serviço → <strong>Environment</strong><br>
        2. Cole em <code>BLING_ACCESS_TOKEN</code> e <code>BLING_REFRESH_TOKEN</code><br>
        3. Clique em <strong>Save, rebuild, and deploy</strong><br><br>
        ✅ O token dura <strong>1 hora</strong> — o sistema renova automaticamente usando o refresh token.
      </div>
      </body></html>`);
  } catch (e) {
    console.error('Erro callback:', e.message);
    res.send(`<h2 style="color:red">Erro: ${e.message}</h2><p>O código pode ter expirado. Acesse o Link de Convite novamente.</p>`);
  }
});

// Variáveis de ambiente do Render (necessário para persistir tokens)
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || '';
const RENDER_API_KEY    = process.env.RENDER_API_KEY    || '';

// Persiste tokens no Render para sobreviver a restarts
async function persistTokensToRender(newAccess, newRefresh) {
  if (!RENDER_SERVICE_ID || !RENDER_API_KEY) {
    // Sem credenciais do Render — apenas loga
    console.log('💾 Tokens atualizados em memória (sem RENDER_API_KEY para persistir)');
    return;
  }
  try {
    const url = `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        { key: 'BLING_ACCESS_TOKEN',  value: newAccess  },
        { key: 'BLING_REFRESH_TOKEN', value: newRefresh },
      ]),
    });
    if (r.ok) {
      console.log('✅ Tokens persistidos no Render!');
    } else {
      const err = await r.text();
      console.warn('⚠ Render API erro:', err.substring(0,200));
    }
  } catch(e) {
    console.warn('⚠ Não foi possível persistir tokens:', e.message);
  }
}

async function refreshAccessToken() {
  if (!refreshToken || !CLIENT_ID || !CLIENT_SECRET) {
    console.warn('⚠ Sem refresh token ou credenciais para renovar');
    return false;
  }
  try {
    console.log('🔄 Renovando token...');
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
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

    // Persiste os novos tokens no Render para sobreviver a restarts
    await persistTokensToRender(accessToken, refreshToken).catch(() => {});
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
  const token = generateToken();
  sessions.set(token, { user: usuario, createdAt: Date.now() });
  res.json({ token, usuario });
});

app.post('/logout', (req, res) => {
  const auth = req.headers['x-session-token'];
  if (auth) sessions.delete(auth);
  res.json({ ok: true });
});

app.get('/me', requireAuth, (req, res) => res.json({ usuario: req.user }));

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
let sharedPackages = [];
let sharedScans    = [];

// ═══ FOTOS — Supabase Storage (permanente, acessível de qualquer dispositivo) ═══
// Configurar no Render: SUPABASE_URL e SUPABASE_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wexikjzztxpfdbzjfnxl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleGlranp6dHhwZmRiempmbnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTg2MjMsImV4cCI6MjA5MDY3NDYyM30.s-Vu3pJETbVw9VbmqhtFhKiDgnPocubFgkHPVeQyMus';
const SUPABASE_BUCKET = 'expedicao';

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
      console.error('Supabase upload erro:', err);
      // Fallback para memória
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

app.get('/sync/data', requireAuth, (req, res) => {
  res.json({ packages: sharedPackages, scans: sharedScans });
});

app.post('/sync/packages', requireAuth, (req, res) => {
  const { packages } = req.body;
  if(Array.isArray(packages)){
    sharedPackages = packages;
  }
  res.json({ ok: true });
});

app.post('/sync/scans', requireAuth, (req, res) => {
  const { scans } = req.body;
  if(Array.isArray(scans)){
    sharedScans = scans;
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📦 Client ID: ${CLIENT_ID ? '✓ configurado' : '✗ NÃO configurado'}`);
  console.log(`🔑 Access Token: ${accessToken ? '✓ presente' : '✗ ausente — acesse /callback'}`);
  console.log(`🔄 Refresh Token: ${refreshToken ? '✓ presente' : '✗ ausente'}`);
  console.log(`👥 Usuários: ${parseUsers().map(u => u.nome).join(', ')}`);
});
