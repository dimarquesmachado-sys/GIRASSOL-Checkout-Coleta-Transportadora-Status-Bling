// ═══ CONSTANTES ═══
var MKT = {
  ml:         {n:'Mercado Livre', cls:'c-ml',     icon:'🟡', dot:'#FFD400',              svcMatch:['mlivre','mercado envios','mercado_envios','olist']},
  shopee:     {n:'Shopee',        cls:'c-shopee', icon:'🟠', dot:'#FF1A1A',              svcMatch:['shopee']},
  amazon:     {n:'Amazon',        cls:'c-amazon', icon:'📦', dot:'#9AA0A6',              svcMatch:['amazon','dba']},
  magalu:     {n:'MAGALU',        cls:'c-magalu', icon:'🔵', dot:'#0A84FF',              svcMatch:['magalu','via varejo','magazine']},
  madeira:    {n:'Madeira Madeira',cls:'c-outro', icon:'🟧', dot:'#FFB366',              svcMatch:['madeira','madeiramadeira','madeira madeira','madeira nordeste']},
  tiktok:     {n:'TikTok',        cls:'c-tiktok', icon:'⚫', dot:'#000000', ring:true,   svcMatch:['tiktok']},
  melhorenvio:{n:'Melhor Envio',  cls:'c-outro',  icon:'📮', dot:'#7C5CFF',              svcMatch:['melhor envio','melhorenvio','loggi','jadlog','correios']},
  velozz:     {n:'Flex Velozz',   cls:'c-shopee', icon:'🏍', dot:'#FF1A1A',              svcMatch:['velozz']},
  lalamove:   {n:'Lalamove',      cls:'c-shopee', icon:'🛵', dot:'#FF7A00',              svcMatch:['lalamove']},
  flex:       {n:'⚡ FLEX',        cls:'c-rd',     icon:'⚡', dot:'#FF3B30', virtual:true},
  outro:      {n:'Outro',         cls:'c-outro',  icon:'📫', dot:'#8E8E93',              svcMatch:[]}
};
var LOJA_MAP = {'203146903':'ml','203583169':'shopee','203967708':'amazon','203262016':'magalu','205523707':'tiktok'};
var MKT_ORDER = ['ml','shopee','amazon','magalu','madeira','tiktok','melhorenvio','velozz','lalamove','outro'];
var ALWAYS_SHOW = ['melhorenvio','velozz','lalamove'];
var FLEX_KEYWORDS = ['mercado envios flex','entrega local','vapt','shopee entrega direta'];
