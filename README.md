# Expedição — Checkout de Saída (Magazine Girassol)

App de expedição usado **ao vivo, todos os dias**, pelos estoquistas do galpão:
bipar etiquetas com a câmera do celular, fechar lotes de coleta, registrar fotos
do veículo e despachar os pedidos no Bling.

**No ar:** https://checkout-coleta-transportadora-status.onrender.com

---

## O fluxo, em uma linha

Pedido chega em **Verificado** no Bling → o app busca → o estoquista **bipa** a
etiqueta → fecha o **lote** com a transportadora → o app move o pedido para
**Despachado** no Bling.

---

## Como rodar localmente

```bash
npm install
PORT=3000 USERS="seu.usuario:senha" SESSION_SECRET=algo ADMIN_KEY=outra node server.js
```

## Variáveis de ambiente (Render)

| variável | para quê | se faltar |
|---|---|---|
| `USERS` | logins do galpão, formato `nome:senha,nome2:senha2` | **ninguém consegue entrar** (503, de propósito) |
| `SESSION_SECRET` | assina a sessão | gera um aleatório e grava em `/data` |
| `ADMIN_KEY` | protege as rotas de diagnóstico e administração | as rotas respondem 404 |
| `BLING_CLIENT_ID` / `BLING_CLIENT_SECRET` | integração com o Bling | sem integração |
| `SUPABASE_URL` / `SUPABASE_KEY` | onde as fotos são guardadas | fotos ficam só em memória |
| `BLING_RITMO_URL` / `BLING_RITMO_KEY` | porteiro de ritmo compartilhado (opcional) | usa só o ritmo local |

Tokens do Bling ficam em `/data/bling-tokens.json`, renovados sozinhos.

---

## Rotas de diagnóstico

Todas exigem `?k=SUA_ADMIN_KEY`.

| rota | mostra |
|---|---|
| `/health` | estado geral: Bling autorizado, pacotes, bipagens, despachos pendentes, pausa ativa |
| `/admin/despacho-fila` | despachos que ainda não foram confirmados no Bling |
| `/admin/backup` | cópia completa: pacotes, bipagens, fila e lápides |
| `/info/count24` | quantos pedidos estão em Verificado no Bling agora |
| `/info/pedido/:id` | o que o Bling devolve para um pedido (útil quando uma etiqueta não casa) |

---

## Quando algo dá errado

**"Código não encontrado" ao bipar** — o pedido está na lista mas sem o código de
rastreio. Clicar em **Buscar no Bling** completa. A partir da v16/07-i o app faz
isso sozinho e repete a leitura.

**App lento ou sem trazer pedidos** — provável limite do Bling. Confira
`/health`: se `bling_em_pausa` estiver preenchido, o app está esperando de
propósito. O limite é **da conta** (3 requisições por segundo), compartilhado com
os outros serviços — uma rotina pesada em outro lugar derruba a bipagem aqui.

**Pedido não aparece** — confira a situação dele no Bling. O app só mostra o que
está em **Verificado**.

**Nada se perde:** despachos ficam numa fila em disco e saem quando o Bling
voltar; bipagens e pacotes são gravados com cópia de segurança.

---

## Antes de mexer no código

- Frontend **sem build**: os arquivos `public/01-*.js` a `12-*.js` carregam em
  ordem pelo `index.html`, compartilhando variáveis globais. **Não mude a ordem.**
- Mexeu em qualquer arquivo de `public/`? **Suba a versão** no `index.html`
  (`v16/07-x` → `v16/07-y`) — é o que faz o celular do estoquista pegar o novo.
- Antes de subir: `node --check server.js` e o mesmo em cada arquivo de `public/`.
  Se mexeu no `server.js`, **ligue o servidor de verdade** — a checagem de
  sintaxe não pega erro de inicialização.
- Regras completas em [`AGENTS.md`](AGENTS.md).
