const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BLING_BASE = 'https://www.bling.com.br/Api/v3';

const CLIENT_ID     = process.env.BLING_CLIENT_ID || '';
const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET || '';
const SESSION_SECRET= process.env.SESSION_SECRET || 'girassol-2024';

let accessToken  = process.env.BLING_ACCESS_TOKEN || '';
let refreshToken = process.env.BLING_REFRESH_TOKEN || '';
let tokenExpires = 0;

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
  if (Date.now() - s.createdAt > 12 * 60 * 60 * 1000) { sessions.delete(auth); return res.status(401).json({ error: 'Sessão expirada.' }); }
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

// ── OAUTH CALLBACK ────────────────────────────────────────────────
// Bling redireciona para aqui após autorização com ?code=XXXXX
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
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    accessToken  = data.access_token;
    refreshToken = data.refresh_token;
    tokenExpires = Date.now() + (data.expires_in * 1000);

    console.log('✅ Tokens obtidos com sucesso!');
    console.log('ACCESS_TOKEN:', accessToken);
    console.log('REFRESH_TOKEN:', refreshToken);

    res.send(`
      <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <style>body{font-family:sans-serif;background:#0C0E13;color:#EBE9E2;padding:40px;max-width:700px;margin:0 auto}
      h2{color:#2ECC8A;margin-bottom:20px} .box{background:#181B24;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:16px;margin:12px 0;word-break:break-all;font-family:monospace;font-size:13px}
      .lbl{font-size:11px;color:#8B8D9B;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
      .warn{background:rgba(240,164,66,.13);border:1px solid rgba(240,164,66,.3);border-radius:8px;padding:14px;color:#F0A442;margin-top:20px;font-size:13px}
      button{background:#2ECC8A;color:#071A0F;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-top:6px}
      </style></head><body>
      <h2>✅ Tokens gerados com sucesso!</h2>
      <p style="color:#8B8D9B;margin-bottom:20px">Copie os valores abaixo e cole no Render → Environment</p>

      <div class="lbl">BLING_ACCESS_TOKEN</div>
      <div class="box" id="at">${accessToken}</div>
      <button onclick="navigator.clipboard.writeText('${accessToken}')">Copiar</button>

      <div class="lbl" style="margin-top:16px">BLING_REFRESH_TOKEN</div>
      <div class="box" id="rt">${refreshToken}</div>
      <button onclick="navigator.clipboard.writeText('${refreshToken}')">Copiar</button>

      <div class="warn">
        ⚠ <strong>Cole esses dois valores no Render agora:</strong><br><br>
        1. Abra o Render → seu serviço → <strong>Environment</strong><br>
        2. Cole o ACCESS_TOKEN em <code>BLING_ACCESS_TOKEN</code><br>
        3. Cole o REFRESH_TOKEN em <code>BLING_REFRESH_TOKEN</code><br>
        4. Clique em <strong>Save, rebuild, and deploy</strong><br><br>
        O sistema vai renovar o access_token automaticamente usando o refresh_token.
      </div>
      </body></html>
    `);
  } catch (e) {
    console.error('Erro ao obter tokens:', e.message);
    res.send(`<h2 style="color:red">Erro: ${e.message}</h2><p>O código pode ter expirado. Acesse o Link de Convite novamente.</p>`);
  }
});

// ── REFRESH TOKEN AUTOMÁTICO ──────────────────────────────────────
async function refreshAccessToken() {
  if (!refreshToken || !CLIENT_ID || !CLIENT_SECRET) return false;
  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
    accessToken  = data.access_token;
    refreshToken = data.refresh_token || refreshToken;
    tokenExpires = Date.now() + (data.expires_in * 1000);
    console.log('🔄 Token renovado automaticamente:', new Date().toLocaleTimeString('pt-BR'));
    return true;
  } catch (e) {
    console.error('Erro ao renovar token:', e.message);
    return false;
  }
}

// Renova 10 minutos antes de expirar
setInterval(async () => {
  if (tokenExpires > 0 && Date.now() > tokenExpires - 10 * 60 * 1000) {
    await refreshAccessToken();
  }
}, 5 * 60 * 1000);

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

// ── PROXY BLING ───────────────────────────────────────────────────
app.all('/bling/*', requireAuth, async (req, res) => {
  if (!accessToken) {
    const ok = await refreshAccessToken();
    if (!ok) return res.status(500).json({ error: 'Token do Bling não configurado. Acesse /callback para autorizar.' });
  }

  const blingPath = req.path.replace('/bling', '');
  const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const url = BLING_BASE + blingPath + query;

  try {
    const r = await fetch(url, {
      method: req.method,
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    // Se token expirou, tenta renovar e repetir
    if (r.status === 401) {
      const ok = await refreshAccessToken();
      if (ok) {
        const r2 = await fetch(url, {
          method: req.method,
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
        });
        const d2 = await r2.json().catch(() => ({}));
        return res.status(r2.status).json(d2);
      }
    }

    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Client ID: ${CLIENT_ID ? '✓' : '✗ não configurado'}`);
  console.log(`Access Token: ${accessToken ? '✓' : '✗ acesse /callback para autorizar'}`);
});
