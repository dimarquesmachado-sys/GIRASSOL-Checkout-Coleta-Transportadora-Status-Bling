// ═══ CONSTANTES ═══
var MKT = {
  ml:         {n:'Mercado Livre', cls:'c-ml',     icon:'🟡', svcMatch:['mlivre','mercado envios','mercado_envios','olist']},
  shopee:     {n:'Shopee',        cls:'c-shopee', icon:'🟠', svcMatch:['shopee']},
  amazon:     {n:'Amazon',        cls:'c-amazon', icon:'📦', svcMatch:['amazon','dba']},
  magalu:     {n:'MAGALU',        cls:'c-magalu', icon:'🔵', svcMatch:['magalu','via varejo','magazine']},
  tiktok:     {n:'TikTok',   cls:'c-tiktok', icon:'⚫', svcMatch:['tiktok']},
  melhorenvio:{n:'Melhor Envio',  cls:'c-outro',  icon:'📮', svcMatch:['melhor envio','melhorenvio','loggi','jadlog','correios']},
  velozz:     {n:'Flex Velozz',   cls:'c-shopee', icon:'🏍', svcMatch:['velozz']},
  lalamove:   {n:'Lalamove',      cls:'c-shopee', icon:'🛵', svcMatch:['lalamove']},
  flex:       {n:'⚡ FLEX',        cls:'c-rd',     icon:'⚡', virtual:true},
  outro:      {n:'Outro',         cls:'c-outro',  icon:'📫', svcMatch:[]}
};
var LOJA_MAP = {'203146903':'ml','203583169':'shopee','203967708':'amazon','203262016':'magalu','205523707':'tiktok'};
var MKT_ORDER = ['ml','shopee','amazon','magalu','tiktok','melhorenvio','velozz','lalamove','outro'];
var ALWAYS_SHOW = ['melhorenvio','velozz','lalamove'];
var FLEX_KEYWORDS = ['mercado envios flex','entrega local','vapt','shopee entrega direta','logistica shopee'];
