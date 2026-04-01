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

// Tokens em memória — inicializa com os do ambiente
let accessToken  = process.env.BLING_ACCESS_TOKEN || '';
let refreshToken = process.env.BLING_REFRESH_TOKEN || '';
let tokenExpires = accessToken ? Date.now() + 50 * 60 * 1000 : 0; // assume 50min restantes se já tem token

// ── USERS ─────────────────────────────────────────────────────────
function parseUsers() {
  const raw = process.env.USERS || 'admin:girassol123';
  return raw.split(',').map(u => {
    const [nome, senha] = u.trim().split(':');
    return { nome: nome?.trim(), senha: senha?.trim() };
  }).filter(u => u.nome && u.senha);
}

// ── SESSIONS ──────────────────────────────────────────────────────
const sessions = new Map();
function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function requireAuth(req, res, next) {
  const auth = req.headers['x-session-token'];
  if (!auth || !sessions.has(auth)) return res.status(401).json({ error: 'Não autorizado.' });
  const s = sessions.get(auth);
  if (Date.now() - s.createdAt > 12 * 60 * 60 * 1000) {
    sessions.delete(auth);
    return res.status(401).json({ error: 'Sessão expirada.' });
  }
  req.user = s.user;
  next();
}

// ── CORS ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── OAUTH CALLBACK ────────────────────────────────────────────────
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
    tokenExpires = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000); // 5min de margem
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
    res.send(`<h2 style="color:red">Erro: ${e.message}</h2><p>O código pode ter expirado (dura ~30 segundos). Acesse o Link de Convite novamente.</p>`);
  }
});

// ── REFRESH TOKEN AUTOMÁTICO ──────────────────────────────────────
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
    // Bling pode retornar novo refresh token — sempre salvar
    if (data.refresh_token) refreshToken = data.refresh_token;
    tokenExpires = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000);

    console.log('✅ Token renovado! Próxima renovação:', new Date(tokenExpires).toLocaleTimeString('pt-BR'));
    return true;
  } catch (e) {
    console.error('❌ Erro ao renovar token:', e.message);
    return false;
  }
}

// Verifica a cada 2 minutos se precisa renovar (token dura 1h, renova com 5min de margem)
setInterval(async () => {
  if (tokenExpires > 0 && Date.now() > tokenExpires - 5 * 60 * 1000) {
    await refreshAccessToken();
  }
}, 2 * 60 * 1000);

// ── HELPER: fetch com retry e rate limit ─────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function blingFetch(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    // Verifica se token está perto de expirar
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

    // Rate limit — espera e tenta de novo
    if (r.status === 429) {
      const waitMs = i === 0 ? 2000 : Math.pow(2, i) * 1000; // 2s, 2s, 4s
      console.warn(`⚠ Rate limit (429) — aguardando ${waitMs}ms antes de tentar novamente`);
      await sleep(waitMs);
      continue;
    }

    // Token expirado — renova e tenta de novo
    if (r.status === 401 && i < retries - 1) {
      console.warn('⚠ Token expirado (401) — renovando...');
      const ok = await refreshAccessToken();
      if (ok) continue;
    }

    return r;
  }
  throw new Error('Máximo de tentativas atingido');
}

// ── LOGIN ─────────────────────────────────────────────────────────
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

// ── PROXY BLING (protegido por sessão) ───────────────────────────
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
    // Rate limit: 700ms para escrita, 300ms para leitura
    const writeMethod = ['POST','PUT','PATCH','DELETE'].includes(req.method);
    await sleep(writeMethod ? 700 : 300);

    const r = await blingFetch(url, {
      method: req.method,
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (err) {
    console.error('Erro proxy Bling:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── ROTA PÚBLICA: listar situações (só para descobrir IDs) ────────
app.get('/info/situacoes', async (req, res) => {
  if (!accessToken) {
    return res.json({ error: 'Token não configurado' });
  }
  try {
    await sleep(300);
    const r = await blingFetch(BLING_BASE + '/situacoes?limite=100&pagina=1');
    const data = await r.json();
    // Filtra e formata para fácil leitura
    const situacoes = (data.data || []).map(s => ({
      id: s.id,
      nome: s.nome,
      modulo: s.modulo?.nome || ''
    }));
    res.json({ total: situacoes.length, situacoes });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📦 Client ID: ${CLIENT_ID ? '✓ configurado' : '✗ NÃO configurado'}`);
  console.log(`🔑 Access Token: ${accessToken ? '✓ presente' : '✗ ausente — acesse /callback'}`);
  console.log(`🔄 Refresh Token: ${refreshToken ? '✓ presente' : '✗ ausente'}`);
  console.log(`👥 Usuários: ${parseUsers().map(u => u.nome).join(', ')}`);
});
