# AGENTS.md — App de Expedição (Magazine Girassol)

Regras de contexto e de revisão para agentes automáticos (Codex).
**Responda as revisões em português do Brasil.**

## O que é este app

App web usado **todos os dias, ao vivo, no galpão** por estoquistas para:
bipar etiquetas dos pedidos (câmera do celular ou leitor), fechar lotes de
coleta, registrar fotos das etiquetas e do veículo, despachar os pedidos no
Bling e consultar o histórico.

Operação **desassistida**: o dono não está no país e o time depende do app
funcionando. Uma regressão aqui para a expedição do dia.

## Restrição nº 1 — NUNCA destruir registros

Bipagens (`scans`), pedidos (`packages`), fotos e histórico são **dados
operacionais e fiscais**. Nenhuma sugestão pode resultar em perda deles.

- Sincronização com o servidor é sempre **merge**, nunca sobrescrita.
- Remoção de um scan só é válida se for **registrada**
  (`registrarRemocaoScan` / `removedScanKeys`), senão o sync o ressuscita.
- Fotos de etiqueta vão para o Supabase e o base64 local é descartado depois;
  o upload tem retry — **não remover o retry**.
- Nada de "limpar", "resetar" ou "normalizar" dados existentes.

## Invariantes técnicos (quebrar = P1)

1. **Ordem dos módulos.** `public/01-*.js` … `12-*.js` são carregados nessa
   ordem pelo `index.html` e compartilham variáveis globais. Não renomear,
   não reordenar, não transformar em módulos ES.
2. **Sem build.** O deploy é copiar/colar arquivo no GitHub web UI → autodeploy
   no Render. Não sugerir bundler, transpilador, framework ou dependência npm
   no front-end.
3. **JS de navegador compatível** (o time usa iPhone/Safari e Android antigos).
   Preferir `var`/funções simples ao padrão do arquivo em volta.
4. **Datas.** `colT` é texto de exibição `"HH:MM"` — **nunca** usar em conta de
   tempo (`new Date(colT)` = Invalid Date). Para cálculo existe `colTs` (ms).
   Esse bug já derrubou os "Expedidos" do Resumo do Dia uma vez.
5. **Casamento de código bipado é exato.** Nada de comparação por "contém" /
   substring entre números de pedido, NF, chave da DANFE ou nº de envio: dois
   pedidos diferentes podem casar e o pacote errado sai como despachado.
6. **Versão.** Toda mudança visual/front deve subir o marcador de versão no
   `index.html` (padrão `v16/06-x`), senão o navegador do galpão serve cache
   velho.

## Segurança (esperado, não regredir)

- Rotas de diagnóstico/admin exigem `?k=ADMIN_KEY` (helper `adminOk`) e
  respondem **404** sem a chave. Rotas abertas devem ser apenas: `/`,
  `/health`, `/login`, `/logout` e o callback de OAuth.
- Sessão é token assinado (HMAC com `SESSION_SECRET`), sem estado em memória —
  precisa sobreviver a restart do Render.
- Segredos vivem em variáveis de ambiente (`SESSION_SECRET`, `ADMIN_KEY`,
  `USERS`, tokens do Bling). Nenhum valor real no código; valor padrão em
  código é aceitável **apenas** se o efeito prático for desligar o recurso.
- Sinalizar qualquer rota que devolva token, credencial ou dado de cliente sem
  autenticação.

## Integrações

- **Bling v3** é a fonte dos pedidos e o destino do despacho.
  Situações usadas: Verificado = `24`, Despachados = `743515`.
- Marketplaces: Mercado Livre, Shopee, Magalu, Amazon, TikTok, Madeira Madeira.
- Supabase Storage guarda as fotos (bucket `expedicao`).
- Chamadas ao Bling precisam tolerar 429/expiração de token com retry e
  renovação — o app roda sozinho o dia todo.

## Como quero a revisão

- Prioridade: **integridade dos dados > segurança > confiabilidade operacional
  > qualidade de código**.
- Trate como **P1**: perda/sobrescrita de registro, remoção de autenticação de
  rota, quebra da ordem dos módulos, conta de tempo em cima de `colT`,
  casamento de bipagem não exato, falta do bump de versão.
- Além dos P0/P1, **liste também melhorias e riscos médios num resumo à
  parte** — mesmo que não bloqueiem o merge.
- Ao propor mudança, prefira a alteração mínima e localizada. Se algo exigir
  reescrita grande, descreva o risco e o ganho em vez de já reescrever.
