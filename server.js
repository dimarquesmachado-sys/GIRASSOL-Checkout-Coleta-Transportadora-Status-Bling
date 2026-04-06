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

// ═══ MAGALU API ═══
const MAGALU_CLIENT_ID     = process.env.MAGALU_CLIENT_ID || '';
const MAGALU_CLIENT_SECRET = process.env.MAGALU_CLIENT_SECRET || '';
const MAGALU_BASE          = 'https://api.magalu.com';
const MAGALU_AUTH_URL      = 'https://id.magalu.com';

let magaluAccessToken  = '';
let magaluTokenExpires = 0;

// ═══ MERCADO LIVRE API ═══
const ML_APP_ID        = process.env.ML_APP_ID || '';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '';
const ML_BASE          = 'https://api.mercadolibre.com';

let mlAccessToken  = process.env.ML_ACCESS_TOKEN || '';
let mlRefreshToken = process.env.ML_REFRESH_TOKEN || '';
let mlTokenExpires = mlAccessToken ? Date.now() + 5 * 60 * 60 * 1000 : 0;
let mlUserId       = process.env.ML_USER_ID || '';

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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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

// ═══ MAGALU API Key (client_credentials) ═══
// Obtém token automaticamente usando API Key ID + Secret

async function getMagaluToken() {
  if (!MAGALU_CLIENT_ID || !MAGALU_CLIENT_SECRET) {
    console.warn('⚠ MAGALU_CLIENT_ID ou MAGALU_CLIENT_SECRET não configurado');
    return false;
  }
  
  // Se token ainda é válido, não precisa renovar
  if (magaluAccessToken && Date.now() < magaluTokenExpires - 60 * 1000) {
    return true;
  }
  
  try {
    console.log('🔵 Obtendo token Magalu via client_credentials...');
    const credentials = Buffer.from(`${MAGALU_CLIENT_ID}:${MAGALU_CLIENT_SECRET}`).toString('base64');
    
    const r = await fetch(`${MAGALU_AUTH_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'open:order-order-seller:read open:order-delivery-seller:read',
      }),
    });
    
    const data = await r.json();
    
    if (!r.ok) {
      console.error('❌ Magalu token erro:', JSON.stringify(data));
      return false;
    }
    
    magaluAccessToken = data.access_token;
    magaluTokenExpires = Date.now() + (data.expires_in || 3600) * 1000 - (5 * 60 * 1000);
    console.log('✅ Magalu token obtido! Expira em:', new Date(magaluTokenExpires).toLocaleTimeString('pt-BR'));
    return true;
  } catch (e) {
    console.error('❌ Erro obter token Magalu:', e.message);
    return false;
  }
}

// Fetch com auth Magalu (obtém token automaticamente se necessário)
async function magaluFetch(url, options = {}) {
  const hasToken = await getMagaluToken();
  if (!hasToken) {
    throw new Error('Magalu: falha ao obter token. Verifique MAGALU_CLIENT_ID e MAGALU_CLIENT_SECRET.');
  }
  
  const r = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${magaluAccessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  
  // Se 401, tenta renovar token
  if (r.status === 401) {
    console.log('🔄 Token Magalu expirado, renovando...');
    magaluAccessToken = '';
    magaluTokenExpires = 0;
    const renewed = await getMagaluToken();
    if (renewed) return magaluFetch(url, options);
  }
  
  return r;
}

// Status da conexão Magalu (não precisa mais de /magalu/auth)
app.get('/magalu/status', async (req, res) => {
  const hasCredentials = !!(MAGALU_CLIENT_ID && MAGALU_CLIENT_SECRET);
  let connected = false;
  let error = null;
  
  if (hasCredentials) {
    try {
      connected = await getMagaluToken();
    } catch (e) {
      error = e.message;
    }
  }
  
  res.json({
    connected,
    hasCredentials,
    tokenExpires: magaluTokenExpires ? new Date(magaluTokenExpires).toISOString() : null,
    error,
  });
});

// ═══ MERCADO LIVRE OAuth e API ═══

// PKCE helpers
let mlCodeVerifier = '';

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Redireciona para login do ML (com PKCE)
app.get('/ml/auth', (req, res) => {
  if (!ML_APP_ID) {
    return res.send('<h2>Erro: ML_APP_ID não configurado no Render.</h2>');
  }
  
  // Gera PKCE
  mlCodeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(mlCodeVerifier);
  
  const redirectUri = `https://${req.get('host')}/ml/callback`;
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  res.redirect(authUrl);
});

// Callback do OAuth ML (com PKCE)
app.get('/ml/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('<h2>Erro: código não encontrado na URL.</h2>');
  if (!ML_APP_ID || !ML_CLIENT_SECRET) {
    return res.send('<h2>Erro: ML_APP_ID ou ML_CLIENT_SECRET não configurados.</h2>');
  }
  if (!mlCodeVerifier) {
    return res.send('<h2>Erro: code_verifier não encontrado. Tente novamente em /ml/auth</h2>');
  }
  
  try {
    const redirectUri = `https://${req.get('host')}/ml/callback`;
    const r = await fetch(`${ML_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ML_APP_ID,
        client_secret: ML_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
        code_verifier: mlCodeVerifier,
      }),
    });
    
    // Limpa o verifier após uso
    mlCodeVerifier = '';
    
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    mlAccessToken  = data.access_token;
    mlRefreshToken = data.refresh_token;
    mlUserId       = String(data.user_id);
    mlTokenExpires = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000);
    
    console.log('✅ ML tokens obtidos! User ID:', mlUserId);

    // Persiste tokens no Render
    await persistMLTokensToRender().catch(() => {});

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:sans-serif;background:#0C0E13;color:#EBE9E2;padding:40px;max-width:700px;margin:0 auto}
      h2{color:#FFE600} .ok{background:rgba(255,230,0,.13);border:1px solid rgba(255,230,0,.3);border-radius:8px;padding:14px;color:#FFE600;margin-top:20px}
      </style></head><body>
      <h2>🟡 Mercado Livre conectado!</h2>
      <p>User ID: ${mlUserId}</p>
      <div class="ok">✅ Pronto! O sistema agora pode buscar NF e status dos pedidos ML.<br><br>Pode fechar esta aba.</div>
      </body></html>`);
  } catch (e) {
    console.error('Erro ML callback:', e.message);
    res.send(`<h2 style="color:red">Erro ML: ${e.message}</h2>`);
  }
});

// Persiste tokens ML no Render
async function persistMLTokensToRender() {
  if (!RENDER_SERVICE_ID || !RENDER_API_KEY) {
    console.log('💾 ML tokens em memória (sem RENDER_API_KEY)');
    return;
  }
  try {
    const vars = [
      ['ML_ACCESS_TOKEN', mlAccessToken],
      ['ML_REFRESH_TOKEN', mlRefreshToken],
      ['ML_USER_ID', mlUserId],
    ];
    for (const [key, value] of vars) {
      if (!value) continue;
      const r = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars/${key}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${RENDER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (r.ok) console.log('✅ '+key+' persistido no Render!');
    }
  } catch(e) { console.warn('⚠ ML persist erro:', e.message); }
}

// Refresh token ML
async function refreshMLToken() {
  if (!mlRefreshToken || !ML_APP_ID || !ML_CLIENT_SECRET) {
    console.warn('⚠ Sem refresh token ML ou credenciais');
    return false;
  }
  try {
    console.log('🔄 Renovando token ML...');
    const r = await fetch(`${ML_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_APP_ID,
        client_secret: ML_CLIENT_SECRET,
        refresh_token: mlRefreshToken,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    mlAccessToken  = data.access_token;
    if (data.refresh_token) mlRefreshToken = data.refresh_token;
    mlTokenExpires = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000);
    console.log('✅ ML token renovado!');
    await persistMLTokensToRender().catch(() => {});
    return true;
  } catch (e) {
    console.error('❌ Erro renovar ML:', e.message);
    return false;
  }
}

// Fetch autenticado ML
async function mlFetch(url, options = {}) {
  if (!mlAccessToken) {
    throw new Error('ML não autorizado. Acesse /ml/auth para conectar.');
  }
  if (Date.now() > mlTokenExpires - 60 * 1000) {
    await refreshMLToken();
  }
  const r = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${mlAccessToken}`,
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (r.status === 401) {
    const ok = await refreshMLToken();
    if (ok) return mlFetch(url, options);
  }
  return r;
}

// Status do ML
app.get('/ml/status', (req, res) => {
  res.json({
    connected: !!mlAccessToken,
    hasCredentials: !!(ML_APP_ID && ML_CLIENT_SECRET),
    userId: mlUserId || null,
    tokenExpires: mlTokenExpires ? new Date(mlTokenExpires).toISOString() : null,
  });
});

// Busca pedido ML por ID (pack_id ou order_id)
app.get('/ml/order/:orderId', requireAuth, async (req, res) => {
  const { orderId } = req.params;
  
  if (!mlAccessToken) {
    return res.status(401).json({ error: 'ML não conectado. Acesse /ml/auth', needsAuth: true });
  }
  
  try {
    // Tenta buscar como order primeiro
    let r = await mlFetch(`${ML_BASE}/orders/${orderId}`);
    
    if (!r.ok && r.status === 404) {
      // Pode ser um pack_id, busca diferente
      r = await mlFetch(`${ML_BASE}/packs/${orderId}`);
    }
    
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    
    const order = await r.json();
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Busca NF de um shipment ML
app.get('/ml/shipment/:shipmentId/invoice', requireAuth, async (req, res) => {
  const { shipmentId } = req.params;
  
  if (!mlAccessToken) {
    return res.status(401).json({ error: 'ML não conectado', needsAuth: true });
  }
  
  try {
    const r = await mlFetch(`${ML_BASE}/shipments/${shipmentId}/fiscal_documents`);
    
    if (!r.ok) {
      // Tenta endpoint alternativo
      const r2 = await mlFetch(`${ML_BASE}/shipments/${shipmentId}`);
      if (r2.ok) {
        const shipment = await r2.json();
        // Extrai dados fiscais do shipment se disponível
        return res.json({
          shipment_id: shipmentId,
          fiscal_data: shipment.fiscal_data || null,
          status: shipment.status,
        });
      }
      return res.status(r.status).json({ error: 'NF não encontrada' });
    }
    
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Busca dados completos de um pedido ML pelo número da loja (numeroPedidoLoja do Bling)
app.get('/ml/pedido/:numLoja', requireAuth, async (req, res) => {
  const { numLoja } = req.params;
  
  if (!mlAccessToken || !mlUserId) {
    return res.status(401).json({ error: 'ML não conectado', needsAuth: true });
  }
  
  try {
    // Busca pedidos recentes do seller
    const r = await mlFetch(`${ML_BASE}/orders/search?seller=${mlUserId}&q=${numLoja}`);
    
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    
    const data = await r.json();
    const orders = data.results || [];
    
    if (orders.length === 0) {
      return res.json({ found: false, numLoja });
    }
    
    // Pega o primeiro pedido encontrado
    const order = orders[0];
    
    // Busca detalhes do shipment para pegar NF
    let invoice = null;
    let tracking = null;
    let status = order.status;
    
    if (order.shipping && order.shipping.id) {
      const shipR = await mlFetch(`${ML_BASE}/shipments/${order.shipping.id}`);
      if (shipR.ok) {
        const shipment = await shipR.json();
        tracking = shipment.tracking_number || null;
        status = shipment.status || order.status;
        
        // Busca NF do shipment
        const nfR = await mlFetch(`${ML_BASE}/shipments/${order.shipping.id}/fiscal_documents`);
        if (nfR.ok) {
          const nfData = await nfR.json();
          if (nfData && nfData.length > 0) {
            invoice = {
              numero: nfData[0].fiscal_document_number,
              chave: nfData[0].fiscal_document_key,
              serie: nfData[0].fiscal_document_series,
            };
          }
        }
      }
    }
    
    res.json({
      found: true,
      order_id: order.id,
      pack_id: order.pack_id,
      status: status,
      tracking: tracking,
      invoice: invoice,
      cancelled: status === 'cancelled',
      shipped: ['shipped', 'delivered'].includes(status),
    });
  } catch (e) {
    console.error('ML pedido erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Variáveis de ambiente do Render (necessário para persistir tokens)
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || '';
const RENDER_API_KEY    = process.env.RENDER_API_KEY    || '';

// Persiste tokens no Render para sobreviver a restarts
async function persistTokensToRender(newAccess, newRefresh) {
  if (!RENDER_SERVICE_ID || !RENDER_API_KEY) {
    console.log('💾 Tokens atualizados em memória (sem RENDER_API_KEY para persistir)');
    return;
  }
  try {
    // Usa PATCH individual em cada variável — não substitui as outras
    for (const [key, value] of [['BLING_ACCESS_TOKEN', newAccess], ['BLING_REFRESH_TOKEN', newRefresh]]) {
      const r = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars/${key}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${RENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      });
      if (r.ok) {
        console.log('✅ '+key+' persistido no Render!');
      } else {
        const err = await r.text();
        console.warn('⚠ Render API erro para '+key+':', err.substring(0,200));
      }
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

// Rota especial: busca NF vinculada ao pedido testando parâmetros corretos do Bling v3
// Busca NF correta para um pedido — pagina /nfe até achar ID próximo ao blingId do pedido
app.get('/nf-pedido/:blingId', requireAuth, async (req, res) => {
  const { blingId } = req.params;
  const pedidoId = parseInt(blingId);
  const TOLERANCE = 5000; // NF criada até 5000 IDs depois do pedido
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

// ═══ MAGALU TRACKING ═══
// Busca tracking de um pedido Magalu pelo código do pedido no marketplace
app.get('/magalu/tracking/:orderCode', requireAuth, async (req, res) => {
  const { orderCode } = req.params;
  console.log('🔵 Buscando tracking Magalu para pedido:', orderCode);
  
  if (!MAGALU_CLIENT_ID || !MAGALU_CLIENT_SECRET) {
    return res.status(401).json({ 
      error: 'Magalu não configurado. Configure MAGALU_CLIENT_ID e MAGALU_CLIENT_SECRET no Render.',
      needsAuth: true 
    });
  }

  try {
    // Busca entregas filtrando pelo código do pedido
    const url = `${MAGALU_BASE}/seller/v1/deliveries?code=${orderCode}&_limit=10`;
    const r = await magaluFetch(url);
    
    if (!r.ok) {
      const err = await r.text();
      console.error('❌ Magalu API erro:', r.status, err.substring(0, 200));
      return res.status(r.status).json({ error: 'Erro API Magalu', details: err.substring(0, 200) });
    }

    const data = await r.json();
    const deliveries = data.results || data.data || [];
    
    console.log('🔵 Magalu entregas encontradas:', deliveries.length);
    
    if (deliveries.length === 0) {
      // Tenta buscar pedido direto
      const orderUrl = `${MAGALU_BASE}/seller/v1/orders?code=${orderCode}&_limit=5`;
      const orderR = await magaluFetch(orderUrl);
      if (orderR.ok) {
        const orderData = await orderR.json();
        const orders = orderData.results || [];
        if (orders.length > 0) {
          // Pega ID do pedido e busca entregas dele
          const orderId = orders[0].id;
          const delUrl = `${MAGALU_BASE}/seller/v1/deliveries?order_id=${orderId}&_limit=10`;
          const delR = await magaluFetch(delUrl);
          if (delR.ok) {
            const delData = await delR.json();
            const dels = delData.results || [];
            if (dels.length > 0) {
              return res.json(extractMagaluTracking(dels[0]));
            }
          }
        }
      }
      return res.json({ tracking: '', found: false });
    }

    // Extrai tracking da primeira entrega
    res.json(extractMagaluTracking(deliveries[0]));
  } catch(e) {
    console.error('❌ Magalu tracking erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Extrai tracking de uma entrega Magalu
function extractMagaluTracking(delivery) {
  // Campos possíveis onde o tracking pode estar
  const tracking = delivery.tracking_code 
    || delivery.trackingCode
    || delivery.shipping?.tracking_code
    || delivery.shipping?.trackingCode
    || (delivery.shipments && delivery.shipments[0]?.tracking_code)
    || (delivery.packages && delivery.packages[0]?.tracking_code)
    || '';
  
  console.log('🔵 Magalu tracking extraído:', tracking, '| delivery id:', delivery.id);
  
  return {
    tracking: tracking,
    deliveryId: delivery.id,
    status: delivery.status,
    found: !!tracking
  };
}

// Busca todas as entregas Magalu recentes (para debug)
app.get('/magalu/deliveries', requireAuth, async (req, res) => {
  if (!MAGALU_CLIENT_ID || !MAGALU_CLIENT_SECRET) {
    return res.status(401).json({ error: 'Magalu não configurado', needsAuth: true });
  }
  try {
    const url = `${MAGALU_BASE}/seller/v1/deliveries?_limit=20`;
    const r = await magaluFetch(url);
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    const data = await r.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Busca dados completos de um pedido Magalu pelo código (para detectar cancelados)
app.get('/magalu/pedido/:orderCode', requireAuth, async (req, res) => {
  const { orderCode } = req.params;
  
  if (!MAGALU_CLIENT_ID || !MAGALU_CLIENT_SECRET) {
    return res.status(401).json({ error: 'Magalu não configurado', needsAuth: true });
  }
  
  try {
    // Busca pedido pelo código
    const orderUrl = `${MAGALU_BASE}/seller/v1/orders?code=${orderCode}&_limit=5`;
    const orderR = await magaluFetch(orderUrl);
    
    if (!orderR.ok) {
      const err = await orderR.text();
      return res.status(orderR.status).json({ error: err });
    }
    
    const orderData = await orderR.json();
    const orders = orderData.results || orderData.data || [];
    
    if (orders.length === 0) {
      return res.json({ found: false, orderCode });
    }
    
    const order = orders[0];
    const status = (order.status || '').toLowerCase();
    
    // Status de cancelado no Magalu: cancelled, canceled, cancelled_by_seller, cancelled_by_buyer
    const cancelledStatuses = ['cancelled', 'canceled', 'cancelled_by_seller', 'cancelled_by_buyer', 'cancellation_requested'];
    const isCancelled = cancelledStatuses.some(s => status.includes(s));
    
    console.log(`🔵 Magalu pedido ${orderCode}: status=${status}, cancelled=${isCancelled}`);
    
    res.json({
      found: true,
      orderId: order.id,
      orderCode: order.code,
      status: status,
      cancelled: isCancelled,
      shipped: ['shipped', 'delivered', 'in_transit', 'out_for_delivery'].some(s => status.includes(s)),
    });
  } catch (e) {
    console.error('❌ Magalu pedido erro:', e.message);
    res.status(500).json({ error: e.message });
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
  console.log(`📦 Bling Client ID: ${CLIENT_ID ? '✓ configurado' : '✗ NÃO configurado'}`);
  console.log(`🔑 Bling Access Token: ${accessToken ? '✓ presente' : '✗ ausente — acesse /callback'}`);
  console.log(`🔄 Bling Refresh Token: ${refreshToken ? '✓ presente' : '✗ ausente'}`);
  console.log(`🔵 Magalu Client ID: ${MAGALU_CLIENT_ID ? '✓ configurado' : '✗ NÃO configurado'}`);
  console.log(`🔵 Magalu Access Token: ${magaluAccessToken ? '✓ presente' : '✗ ausente — acesse /magalu/auth'}`);
  console.log(`👥 Usuários: ${parseUsers().map(u => u.nome).join(', ')}`);
});
