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

// ═══ STATE ═══
var packages = [], scans = [], sessionToken = '', currentUser = '';
var colSession = [], activeMkt = '';
var coletaTimeout = null; // Timer de inatividade (20 min)
var fotosVeiculo = [], problemaPkgs = [];
var _tirando_fotos = false; // Flag para impedir reset durante captura
var camStream = null, barcodeDetector = null, scanning = false, scanPaused = false;
var lastCode = '', lastCodeAt = 0;
var encerrandoParcial = false; // flag: encerramento parcial ativo
var lastPullAt = 0;        // timestamp do último pullFromBling
var diaSelectedDate = '';  // data selecionada na aba Dia ('' = hoje)
var histFilterDate = '';   // filtro ativo de data no histórico
var histFilterMkt  = '';   // filtro ativo de mkt no histórico
var histLoteAberto = '';

// ═══ STORAGE ═══
function sv(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function ld(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}

// ═══ HELPERS ═══
function todayStr(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});}
function nowTS(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function todayPkgs(){return packages.filter(function(p){return p.date===todayStr();});}
function lojaToMkt(id){return LOJA_MAP[String(id)]||null;}
function svcToMkt(s){
  if(!s) return 'melhorenvio';
  var n=s.toLowerCase();
  var keys=Object.keys(MKT);
  for(var i=0;i<keys.length;i++){
    var id=keys[i];
    if(id==='outro'||id==='melhorenvio'||id==='flex') continue;
    var m=MKT[id];
    if(m.svcMatch&&m.svcMatch.some(function(k){return n.indexOf(k)!==-1;})) return id;
  }
  return 'melhorenvio';
}

// ═══ SOM ═══
function beepSuccess(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);
    o.type='sine';
    o.frequency.setValueAtTime(880,ctx.currentTime);
    o.frequency.setValueAtTime(1320,ctx.currentTime+0.1);
    g.gain.setValueAtTime(0.3,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
    o.start(ctx.currentTime);o.stop(ctx.currentTime+0.4);
  }catch(e){}
}
function beepError(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);
    o.type='sawtooth';
    o.frequency.setValueAtTime(200,ctx.currentTime);
    g.gain.setValueAtTime(0.3,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
    o.start(ctx.currentTime);o.stop(ctx.currentTime+0.4);
  }catch(e){}
}

// ═══ AUTH ═══
function togglePass(){
  var i=document.getElementById('loginPass');
  var b=document.getElementById('eyeBtn');
  i.type=i.type==='password'?'text':'password';
  b.textContent=i.type==='password'?'👁':'🙈';
}
document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&document.getElementById('loginScreen').style.display!=='none') doLogin();
});
function doLogin(){
  var usuario=document.getElementById('loginUser').value.trim();
  var senha=document.getElementById('loginPass').value;
  var btn=document.getElementById('loginBtn');
  var err=document.getElementById('loginErr');
  err.style.display='none';
  if(!usuario||!senha){err.textContent='Preencha usuário e senha.';err.style.display='block';return;}
  btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
  fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:usuario,senha:senha})})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
  .then(function(res){
    if(!res.ok) throw new Error(res.d.error||'Usuário ou senha incorretos.');
    sessionToken=res.d.token; currentUser=res.d.usuario;
    sv('expv5_session',sessionToken); sv('expv5_user',currentUser); sv('expv5_login_time',Date.now());
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appWrap').classList.add('show');
    initApp();
  })
  .catch(function(e){err.textContent=e.message;err.style.display='block';})
  .finally(function(){btn.disabled=false;btn.innerHTML='Entrar';});
}
function doLogout(){
  fetch('/logout',{method:'POST',headers:{'x-session-token':sessionToken}}).catch(function(){});
  sessionToken=''; currentUser='';
  sv('expv5_session',''); sv('expv5_user',''); sv('expv5_login_time',0);
  document.getElementById('appWrap').classList.remove('show');
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginPass').value='';
}
function apiFetch(path,opts){
  opts=opts||{};
  var sep=path.indexOf('?')!==-1?'&':'?';
  var url=path.indexOf('/bling/')!==-1?path+sep+'_='+Date.now():path;
  return fetch(url,Object.assign({},opts,{headers:Object.assign({},opts.headers||{},{'x-session-token':sessionToken,'Content-Type':'application/json','Cache-Control':'no-cache'})}))
  .then(function(r){
    if(r.status===401){
      // Lê o body para ver se é erro NOSSO ou do Bling
      return r.json().then(function(body){
        var nossoErro = body&&(body.error==='Não autorizado.'||body.error==='Sessão expirada.');
        if(nossoErro){ doLogout(); }
        throw new Error(body&&body.error||'Erro de autorização');
      });
    }
    return r;
  });
}

// ═══ BLING — busca rastreio FLEX ═══
// Busca tracking individual para marketplaces que não trazem rastreio na listagem
function detectTrackingPkgs(pkgs){
  var i=0;
  function next(){
    if(i>=pkgs.length) return;
    var pkg=pkgs[i++];
    if(pkg.numeracao&&String(pkg.numeracao).toLowerCase().indexOf('object')===-1){next();return;}
    setTimeout(function(){
      apiFetch('/bling/pedidos/vendas/'+pkg.blingId)
      .then(function(r){if(!r.ok)return null;return r.json();})
      .then(function(d){
        if(!d) return;
        var order=d.data||d;

        // DEBUG: loga transporte completo para ML sem tracking
        if(pkg.mkt==='ml'&&!track){
          // Loga tudo para diagnóstico
          console.log('🔍 ML SEM TRACKING #'+pkg.blingId);
          console.log('🔍 TRANSPORTE:', JSON.stringify(order.transporte||{}));
          console.log('🔍 TODAS KEYS:', Object.keys(order).join(', '));
          // Procura qualquer chave com número de 8+ dígitos no objeto inteiro
          var str=JSON.stringify(order);
          var nums=str.match(/:\s*"([0-9]{8,})"/g)||[];
          console.log('🔍 NÚMEROS LONGOS NO ORDER:', nums.slice(0,10).join(', '));
        }

        var vol = order.transporte&&order.transporte.volumes&&order.transporte.volumes[0];
        // Mesmos campos que o detectFlexML usa — sem fallback genérico
        var track = extractTrackStr(vol&&vol.numeracao)
                 || extractTrackStr(vol&&vol.codigoRastreio)
                 || extractTrackStr(vol&&vol.codigoRastreamento)
                 || extractTrackStr(vol&&vol.tracking)
                 || extractTrackStr(order.transporte&&order.transporte.codigoRastreamento)
                 || extractTrackStr(order.transporte&&order.transporte.codigoRastreio)
                 || '';

        // NF — tenta todos os caminhos
        // numLoja — número da venda no marketplace
        var numLojaD=(order.numeroPedidoLoja)||(order.numeroLoja)||(order.numeroloja)||(order.loja&&order.loja.numeroPedido)||'';
        if(numLojaD&&p&&!p.numLoja){p.numLoja=String(numLojaD).trim();}
        // Para ML: numeroPedidoLoja = número loja virtual (2000015489054448)
        // numeracao = número de envio (46625715803)
        var nfDetalhe = (order.notaFiscal&&order.notaFiscal.numero)
                     || (order.nfe&&order.nfe.numero)
                     || (order.notasFiscais&&order.notasFiscais[0]&&order.notasFiscais[0].numero)
                     || (order.nota&&order.nota.numero)
                     || '';
        // Salva a chave DANFE completa (44 dígitos) para matching na bipagem
        var nfChave = (order.notaFiscal&&order.notaFiscal.chave)
                   || (order.nfe&&order.nfe.chave)
                   || (order.notasFiscais&&order.notasFiscais[0]&&order.notasFiscais[0].chave)
                   || '';
        if(nfChave) nfChave=String(nfChave).replace(/\s/g,'');
        // Se não tem numero da NF mas tem chave, extrai o número da chave (pos 25-34 do padrão NF-e)
        if(!nfDetalhe&&nfChave&&nfChave.length===44){
          nfDetalhe=String(parseInt(nfChave.substring(25,34),10)); // remove zeros à esquerda
        }

        var p=null;
        for(var k=0;k<packages.length;k++){if(packages[k].blingId===pkg.blingId){p=packages[k];break;}}
        if(p){
          if(track){p.numeracao=String(track).replace(/\s/g,'').toUpperCase(); console.log('✅ Tracking '+p.mkt.toUpperCase()+' #'+p.numero+': '+p.numeracao);}
          else{console.warn('⚠ SEM tracking para '+p.mkt.toUpperCase()+' #'+p.numero);}
          // Detecta urgente pelo serviço (Shopee Xpress, VAPT, etc)
          if(!p.urgente){
            var svcDetect=((order.transporte&&order.transporte.servico&&order.transporte.servico.nome)||'').toLowerCase()+' '+
                          ((order.transporte&&order.transporte.volumes&&order.transporte.volumes[0]&&order.transporte.volumes[0].servico)||'').toLowerCase();
            if(FLEX_KEYWORDS.some(function(f){return svcDetect.indexOf(f)!==-1;})){
              p.urgente=true;
              p.servico=(order.transporte&&order.transporte.servico&&order.transporte.servico.nome)||
                        (order.transporte&&order.transporte.volumes&&order.transporte.volumes[0]&&order.transporte.volumes[0].servico)||'Expresso';
              console.log('⚡ URGENTE: '+p.mkt.toUpperCase()+' #'+p.numero+' → '+p.servico);
            }
          }
          if(nfDetalhe&&!p.nf){p.nf=String(nfDetalhe).trim(); console.log('✅ NF '+p.mkt.toUpperCase()+' #'+p.numero+': '+p.nf);}
          if(nfChave&&!p.nfChave){p.nfChave=nfChave;}
          // NF vem do endpoint individual do pedido (detectNF)
          sv('expv5_pkgs',packages);
          renderMktGrid();
          if(activeMkt) renderPkgList(); // atualiza lista aberta com novos dados
          // Avisa quando último tracking carregou
          if(i>=pkgs.length){
            toast('✅ Trackings carregados!','ok');
            var semNF=packages.filter(function(p){return p.date===todayStr()&&!p.nf;});
            if(semNF.length>0) setTimeout(function(){detectNF(semNF,null);},1200);
          }
        }
        next();
      })
      .catch(function(e){console.error('❌ detectTracking erro:',e.message);next();});
    },1100); // 1100ms entre chamadas — evita rate limit Bling
  }
  next();
}

function detectFlexML(mlPkgs, onDone){
  var i=0;
  function next(){
    if(i>=mlPkgs.length){if(onDone)onDone();return;}
    var pkg=mlPkgs[i++];
    setTimeout(function(){
      apiFetch('/bling/pedidos/vendas/'+pkg.blingId)
      .then(function(r){if(!r.ok) return null; return r.json();})
      .then(function(d){
        if(!d) return;
        var order=d.data||d;
        var svcNome=((order.transporte&&order.transporte.servico&&order.transporte.servico.nome)||'').toLowerCase();
        var svcVol=((order.transporte&&order.transporte.volumes&&order.transporte.volumes[0]&&order.transporte.volumes[0].servico)||'').toLowerCase();
        var svcTrp=((order.transporte&&order.transporte.transportadora&&order.transporte.transportadora.nome)||'').toLowerCase();
        var allSvc=svcNome+' '+svcVol+' '+svcTrp;
        var isFlex=FLEX_KEYWORDS.some(function(f){return allSvc.indexOf(f)!==-1;});
        // Busca o pacote independente de ser FLEX ou ML normal
        var p=packages.find?packages.find(function(x){return x.blingId===pkg.blingId;}):null;
        if(!p){for(var k=0;k<packages.length;k++){if(packages[k].blingId===pkg.blingId){p=packages[k];break;}}}
        if(p){
          // Extrai tracking — MESMA lógica para FLEX e ML normal
          var vol=order.transporte&&order.transporte.volumes&&order.transporte.volumes[0];
          var nr=extractTrackStr(vol&&vol.numeracao)
              ||extractTrackStr(vol&&vol.codigoRastreio)
              ||extractTrackStr(vol&&vol.codigoRastreamento)
              ||extractTrackStr(vol&&vol.tracking)
              ||extractTrackStr(vol&&vol.numero)
              ||extractTrackStr(order.transporte&&order.transporte.codigoRastreamento)
              ||extractTrackStr(order.transporte&&order.transporte.codigoRastreio)
              ||'';
          if(isFlex){
            p.urgente=true;
            p.servico=order.transporte&&order.transporte.volumes&&order.transporte.volumes[0]?
              (order.transporte.volumes[0].servico||svcNome||'ML Flex'):
              (svcNome||'ML Flex');
          }
          if(nr){
            p.numeracao=String(nr).replace(/\s/g,'').toUpperCase();
            console.log('✅ Tracking ML'+(isFlex?' FLEX':'')+'  #'+p.numero+': '+p.numeracao);
          }
          // NF e chave DANFE
          var nfFlex=(order.notaFiscal&&order.notaFiscal.numero)||(order.nfe&&order.nfe.numero)||'';
          var nfChaveFlex=(order.notaFiscal&&order.notaFiscal.chave)||(order.nfe&&order.nfe.chave)||'';
          if(nfFlex&&!p.nf) p.nf=String(nfFlex).trim();
          if(nfChaveFlex&&!p.nfChave) p.nfChave=String(nfChaveFlex).replace(/\s/g,'');
          // NF vem de order.notaFiscal — já capturada acima
          // numLoja
          var numLojaDetalhe=(order.numeroPedidoLoja)||(order.numeroLoja)||(order.numeroloja)||(order.loja&&order.loja.numeroPedido)||'';
          if(numLojaDetalhe&&!p.numLoja) p.numLoja=String(numLojaDetalhe).trim();
          sv('expv5_pkgs',packages);
          if(i%5===0) syncToServer();
          renderMktGrid();
          if(activeMkt) renderPkgList();
        }
        next();
      })
      .catch(function(e){console.error('❌ FLEX erro:',e.message);next();});
    },1100); // 1100ms entre chamadas — evita rate limit Bling (limite ~1 req/s)
  }
  next();
}

// Mapa mkt → idLoja para busca filtrada
var MKT_TO_LOJA = {
  'ml':'203146903','shopee':'203583169','amazon':'203967708',
  'magalu':'203262016','tiktok':'205523707'
};

// Busca Bling filtrado por loja — chamado ao selecionar marketplace
// Busca um pedido específico pelo número diretamente no Bling
function buscarPedido(){
  var input=document.getElementById('buscaPedido');
  var termo=(input.value||'').trim().toLowerCase();
  if(!termo){ toast('Digite algo para buscar','warn'); return; }
  
  // Busca em TODOS os packages (qualquer data) e scans
  var resultadoPkg=packages.find(function(p){
    if(String(p.numero).toLowerCase()===termo) return true;
    if(String(p.nf).toLowerCase()===termo) return true;
    if(String(p.etiqueta).toLowerCase()===termo) return true;
    if(String(p.numeracao).toLowerCase()===termo) return true;
    if(String(p.numLoja).toLowerCase()===termo) return true;
    if(p.destinatario && p.destinatario.toLowerCase().indexOf(termo)!==-1) return true;
    return false;
  });
  
  // Busca no histórico de scans
  var scanHistorico=scans.find(function(s){
    if(s.tipo==='lote') return false;
    if(String(s.numero||'').toLowerCase()===termo) return true;
    if(String(s.etiqueta||'').toLowerCase()===termo) return true;
    if(s.destinatario && s.destinatario.toLowerCase().indexOf(termo)!==-1) return true;
    return false;
  });
  
  // Se achou localmente, mostra modal
  if(resultadoPkg || scanHistorico){
    input.value='';
    mostrarResultadoBusca(resultadoPkg, scanHistorico, termo);
    return;
  }
  
  // Não achou local — busca no Bling
  toast('🔍 Buscando...','warn');
  apiFetch('/bling/pedidos/vendas?numero='+encodeURIComponent(termo)+'&limite=1')
  .then(function(r){return r.ok?r.json():null;})
  .then(function(d){
    var orders=(d&&d.data)||[];
    if(orders.length===0){
      toast('Não encontrado: '+termo,'err');
      return;
    }
    var o=orders[0];
    input.value='';
    mostrarResultadoBling(o);
  })
  .catch(function(e){
    toast('Erro: '+e.message,'err');
  });
}

function mostrarResultadoBusca(pkg, scan, termo){
  var mktInfo = pkg ? (MKT[pkg.mkt]||{n:pkg.mkt,icon:'📦'}) : {n:'',icon:''};
  
  // Encontra lote se foi bipado
  var loteInfo = null;
  if(scan){
    var lote = scans.find(function(s){
      return s.tipo==='lote' && s.id === scan.loteId;
    });
    if(lote) loteInfo = lote;
  }
  
  var html = '<div style="padding:20px;max-width:400px">';
  html += '<div style="font-size:20px;font-weight:700;margin-bottom:16px">🔍 Resultado</div>';
  
  if(pkg){
    html += '<div style="background:var(--s1);padding:14px;border-radius:12px;margin-bottom:12px">';
    html += '<div style="font-size:18px;font-weight:700;color:var(--am)">'+mktInfo.icon+' Pedido #'+pkg.numero+'</div>';
    html += '<div style="margin-top:8px;color:var(--tx)">'+pkg.destinatario+'</div>';
    
    // Status
    var statusColor = pkg.status==='coletado' ? 'var(--gr)' : pkg.status==='problema' ? 'var(--rd)' : 'var(--am)';
    var statusText = pkg.status==='coletado' ? '✅ Coletado' : pkg.status==='problema' ? '⚠️ Problema' : '⏳ Pendente';
    html += '<div style="margin-top:10px;padding:8px 12px;background:'+statusColor+'22;color:'+statusColor+';border-radius:8px;font-weight:600;display:inline-block">'+statusText+'</div>';
    
    // Detalhes
    html += '<div style="margin-top:12px;font-size:13px;color:var(--th)">';
    if(pkg.nf) html += '<div>📄 NF: <span style="color:var(--gr)">'+pkg.nf+'</span></div>';
    if(pkg.numeracao) html += '<div>📦 Tracking: '+pkg.numeracao+'</div>';
    if(pkg.servico) html += '<div>🚚 '+pkg.servico+'</div>';
    html += '<div>📅 Data: '+pkg.date+'</div>';
    html += '</div>';
    html += '</div>';
  }
  
  // Info do lote se foi bipado
  if(loteInfo){
    html += '<div style="background:var(--gr)22;padding:12px;border-radius:10px;margin-bottom:12px">';
    html += '<div style="font-weight:600;color:var(--gr)">✅ Bipado no lote</div>';
    html += '<div style="font-size:13px;color:var(--th);margin-top:6px">';
    html += '📅 '+loteInfo.date+' às '+loteInfo.time+'<br>';
    html += '📦 '+loteInfo.qtd+' pacotes no lote';
    html += '</div></div>';
  } else if(scan){
    html += '<div style="background:var(--gr)22;padding:12px;border-radius:10px;margin-bottom:12px">';
    html += '<div style="font-weight:600;color:var(--gr)">✅ Bipado</div>';
    html += '<div style="font-size:13px;color:var(--th);margin-top:6px">';
    html += '📅 '+scan.date+' às '+scan.time;
    html += '</div></div>';
  }
  
  // Botão para ir ao pedido se estiver pendente hoje
  if(pkg && pkg.status==='pendente' && pkg.date===todayStr()){
    html += '<button onclick="irParaPedido(\''+pkg.mkt+'\',\''+pkg.etiqueta+'\','+pkg.urgente+')" style="width:100%;padding:14px;background:var(--am);color:#000;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;margin-top:8px">📍 Ir para o pedido</button>';
  }
  
  html += '<button onclick="fecharModal()" style="width:100%;padding:12px;background:var(--s2);color:var(--th);border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;margin-top:8px">Fechar</button>';
  html += '</div>';
  
  abrirModal(html);
}

function mostrarResultadoBling(o){
  var situacaoId=Number((o.situacao&&o.situacao.id)||0);
  var situacaoNome=(o.situacao&&o.situacao.valor)||'Status '+situacaoId;
  var mkt=lojaToMkt(String((o.loja&&o.loja.id)||'0'))||'outro';
  var mktInfo=MKT[mkt]||{n:mkt,icon:'📦'};
  
  var html = '<div style="padding:20px;max-width:400px">';
  html += '<div style="font-size:20px;font-weight:700;margin-bottom:16px">🔍 Resultado do Bling</div>';
  
  html += '<div style="background:var(--s1);padding:14px;border-radius:12px;margin-bottom:12px">';
  html += '<div style="font-size:18px;font-weight:700;color:var(--am)">'+mktInfo.icon+' Pedido #'+o.numero+'</div>';
  html += '<div style="margin-top:8px;color:var(--tx)">'+(o.contato&&o.contato.nome||'—')+'</div>';
  
  // Status no Bling
  var statusColor = situacaoId===24 ? 'var(--am)' : situacaoId===743515 ? 'var(--gr)' : 'var(--th)';
  html += '<div style="margin-top:10px;padding:8px 12px;background:'+statusColor+'22;color:'+statusColor+';border-radius:8px;font-weight:600;display:inline-block">'+situacaoNome+'</div>';
  
  html += '<div style="margin-top:12px;font-size:13px;color:var(--th)">';
  html += '<div>🏪 '+mktInfo.n+'</div>';
  if(o.data) html += '<div>📅 '+o.data.substring(0,10)+'</div>';
  html += '</div>';
  html += '</div>';
  
  // Se está em VERIFICADO, oferece adicionar
  if(situacaoId===24){
    html += '<button onclick="adicionarPedidoBling('+o.id+')" style="width:100%;padding:14px;background:var(--gr);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;margin-top:8px">➕ Adicionar para bipar</button>';
  }
  
  html += '<button onclick="fecharModal()" style="width:100%;padding:12px;background:var(--s2);color:var(--th);border:none;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;margin-top:8px">Fechar</button>';
  html += '</div>';
  
  abrirModal(html);
  window._ultimoPedidoBling = o; // guarda para usar no adicionar
}

function adicionarPedidoBling(blingId){
  var o = window._ultimoPedidoBling;
  if(!o || o.id !== blingId) return;
  
  var today=todayStr();
  var existing=packages.find(function(x){return x.blingId===o.id;});
  if(existing){
    existing.date=today;
    if(existing.status==='coletado'||existing.status==='problema'){
      existing.status='pendente'; existing.colT=null;
    }
  } else {
    var mkt=lojaToMkt(String((o.loja&&o.loja.id)||'0'))||'melhorenvio';
    packages.unshift({
      id:o.id,numero:o.numero,etiqueta:String(o.numero||o.id).trim().toUpperCase(),nf:'',nfChave:'',numLoja:'',
      destinatario:(o.contato&&o.contato.nome)||'—',
      servico:'',lojaId:String((o.loja&&o.loja.id)||'0'),
      mkt:mkt,urgente:false,numeracao:'',
      blingStatus:24,dataPedido:o.data||'',
      date:today,pulledAt:nowTS(),
      status:'pendente',colT:null,obs:'',blingId:o.id
    });
  }
  sv('expv5_pkgs',packages);
  syncToServer();
  renderMktGrid();
  fecharModal();
  toast('✅ Pedido '+o.numero+' adicionado!','ok');
}

function irParaPedido(mkt, etiqueta, urgente){
  fecharModal();
  if(urgente && activeMkt!=='flex'){
    selectMkt('flex');
  } else if(!urgente && activeMkt!==mkt){
    selectMkt(mkt);
  }
  setTimeout(function(){
    var el=document.querySelector('[data-etiqueta="'+etiqueta+'"]');
    if(el){
      el.scrollIntoView({behavior:'smooth',block:'center'});
      el.style.outline='2px solid var(--am)';
      setTimeout(function(){el.style.outline='';},2000);
    }
  },300);
}

function abrirModal(html){
  var overlay = document.getElementById('buscaModal');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'buscaModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(e){ if(e.target===overlay) fecharModal(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '<div style="background:var(--bg);border-radius:16px;max-height:90vh;overflow:auto">'+html+'</div>';
  overlay.style.display = 'flex';
}

function fecharModal(){
  var overlay = document.getElementById('buscaModal');
  if(overlay) overlay.style.display = 'none';
}

function buscarPedidoManual(){
  // Mantido para compatibilidade — agora foca no campo
  document.getElementById('buscaPedido').focus();
}

function pullFromBlingMkt(mkt){
  var lojaId=MKT_TO_LOJA[mkt]||null;
  if(!lojaId) return; // FLEX e outros sem lojaId fixo não filtram
  var today=todayStr();
  var d30b=new Date(); d30b.setDate(d30b.getDate()-30);
  var dateFrom30=d30b.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  // Mostra mini-indicador
  toast('🔄 Verificando '+( MKT[mkt]||{n:mkt}).n+'...','warn');
  apiFetch('/bling/pedidos/vendas?idSituacao=24&idLoja='+lojaId+'&dataEmissaoInicial='+dateFrom30+'&pagina=1&limite=100')
  .then(function(r){
    if(!r.ok) return;
    return r.json().then(function(d){
      var orders=d.data||[];
      if(orders.length===0) return;
      // Filtro de 30 dias no cliente (igual ao pullFromBling principal)
      orders=orders.filter(function(o){
        if(!o.data) return true;
        var d=new Date(o.data.substring(0,10)+'T12:00:00');
        var diffDias=(Date.now()-d.getTime())/(1000*60*60*24);
        return diffDias<=30;
      });
      if(orders.length===0) return;
      var novos=0;
      orders.forEach(function(o){
        var etiqueta=String((o.numero||o.id||'')).trim().toUpperCase();
        var nf=(o.notaFiscal&&o.notaFiscal.numero)||(o.nfe&&o.nfe.numero)||'';
        var nfChave=(o.notaFiscal&&o.notaFiscal.chave)||(o.nfe&&o.nfe.chave)||'';
        var numLoja=(o.numeroPedidoLoja)||(o.numeroLoja)||(o.loja&&o.loja.numeroPedido)||'';
        var numeracaoLista=(o.transporte&&o.transporte.volumes&&o.transporte.volumes[0]&&o.transporte.volumes[0].numeracao)||
                           (o.transporte&&o.transporte.codigoRastreamento)||'';
        if(numeracaoLista) numeracaoLista=String(numeracaoLista).replace(/\s/g,'').toUpperCase();
        // Verifica se já existe
        var existente=null;
        for(var k=0;k<packages.length;k++){
          if(packages[k].blingId===o.id){existente=packages[k];break;}
        }
        if(!existente){
          // Pedido novo — adiciona
          packages.unshift({
            id:o.id,numero:o.numero,etiqueta:etiqueta,nf:nf,nfChave:nfChave?String(nfChave).replace(/\s/g,''):'',
            numLoja:String(numLoja||''),
            destinatario:(o.contato&&o.contato.nome)||'—',
            servico:(o.transporte&&o.transporte.servico&&o.transporte.servico.nome)||'',
            lojaId:String((o.loja&&o.loja.id)||'0'),mkt:mkt,urgente:false,numeracao:numeracaoLista,
            blingStatus:Number((o.situacao&&o.situacao.id)||0),
            dataPedido:o.data||'',date:today,pulledAt:nowTS(),
            status:'pendente',colT:null,obs:'',blingId:o.id
          });
          novos++;
        } else {
          // Atualiza campos que podem ter chegado
          if(nf&&!existente.nf) existente.nf=nf;
          if(nfChave&&!existente.nfChave) existente.nfChave=String(nfChave).replace(/\s/g,'');
          if(numLoja&&!existente.numLoja) existente.numLoja=String(numLoja);
          if(numeracaoLista&&!existente.numeracao) existente.numeracao=numeracaoLista;
        }
      });
      sv('expv5_pkgs',packages);
      if(novos>0){
        syncToServer();
        toast(novos+' pedido(s) novo(s) em '+(MKT[mkt]||{n:mkt}).n+'!','ok');
        renderMktGrid();
        renderPkgList();
      } else {
        toast('✅ '+(MKT[mkt]||{n:mkt}).n+' atualizado','ok');
      }
      // Busca tracking e numLoja se necessário
      var semTrack=packages.filter(function(p){
        if(p.mkt!==mkt) return false;
        if(mkt==='ml') return !p.numLoja; // ML: busca numLoja (número loja virtual)
        return !p.numeracao&&(mkt==='tiktok'||mkt==='shopee'||mkt==='amazon'||mkt==='magalu');
      });
      if(semTrack.length>0) setTimeout(function(){detectTrackingPkgs(semTrack);},800);
    });
  })
  .catch(function(){});
}

function pullFromBling(){
  var btn=document.getElementById('syncBtn');
  btn.disabled=true; btn.innerHTML='<span class="spin"></span> Buscando...';
  var today=todayStr();
  // Busca só hoje: evita puxar centenas de pedidos antigos ainda em VERIFICADO
  // Usa ontem como margem de segurança para pedidos emitidos ontem mas verificados hoje
  var d30=new Date(); d30.setDate(d30.getDate()-30);
  var dateFrom30=d30.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  var all=[]; var page=1;
  function fetchPage(){
    apiFetch('/bling/pedidos/vendas?idSituacao=24&dataEmissaoInicial='+dateFrom30+'&pagina='+page+'&limite=100')
    .then(function(r){
      if(r.status===304||r.status!==200){finishFetch(all);return;}
      return r.json().then(function(d){
        var orders=d.data||[];
        if(orders.length===0){finishFetch(all);return;}
        all=all.concat(orders);
        if(orders.length===100&&page<4){page++;setTimeout(fetchPage,1000);}
        else finishFetch(all);
      });
    })
    .catch(function(e){flash('Erro: '+e.message,'err');resetSyncBtn();});
  }
  function finishFetch(all){
    if(all.length===0){
      // Só avisa se realmente não há nada — se já tem pacotes de hoje no localStorage, fica quieto
      var temHoje=packages.filter(function(p){return p.date===todayStr();}).length>0;
      if(!temHoje) flash('Nenhum pedido VERIFICADO','warn');
      renderMktGrid(); resetSyncBtn(); return;
    }
    // DEBUG NF: loga os campos da 1ª ordem para identificar onde está a NF
    if(all.length>0){
      var sample=all[0];
      console.log('🔍 BLING SAMPLE KEYS:', Object.keys(sample));
      console.log('🔍 notaFiscal:', sample.notaFiscal);
      console.log('🔍 nfe:', sample.nfe);
      console.log('🔍 nota:', sample.nota);
      console.log('🔍 notasFiscais:', sample.notasFiscais);
      console.log('🔍 loja:', sample.loja);
      console.log('🔍 numeroPedidoLoja:', sample.numeroPedidoLoja);
      console.log('🔍 FULL:', JSON.stringify(sample).substring(0,800));
    }
    var newPkgs=all.map(function(o){
      var lojaId=String((o.loja&&o.loja.id)||'0');
      var svc=(o.transporte&&o.transporte.servico&&o.transporte.servico.nome)||
              (o.transporte&&o.transporte.transportadora&&o.transporte.transportadora.nome)||
              (o.loja&&o.loja.nome)||'';
      var mkt=lojaToMkt(lojaId)||svcToMkt(svc);
      var svcLow=svc.toLowerCase();
      var urgente=FLEX_KEYWORDS.some(function(u){return svcLow.indexOf(u)!==-1;});
      var etiqueta=String((o.numero||o.id||'')).trim().toUpperCase();
      // NF da listagem — usado como valor inicial, detectNF() vai confirmar/corrigir depois
      var nf=(o.notaFiscal&&o.notaFiscal.numero)
           ||(o.nfe&&o.nfe.numero)
           ||(o.nota&&o.nota.numero)
           ||'';
      if(nf) nf=String(nf).trim();
      // Número do pedido no marketplace (Bling guarda em numeroPedidoLoja ou loja.numeroPedido)
      var numLoja=(o.numeroPedidoLoja)||(o.numeroLoja)||(o.numeroloja)||(o.loja&&o.loja.numeroPedido)||(o.pedidoLoja&&o.pedidoLoja.numero)||'';
      // Extrai tracking da listagem (pode já estar disponível para Shopee, TikTok etc.)
      var numeracaoLista=(o.transporte&&o.transporte.volumes&&o.transporte.volumes[0]&&o.transporte.volumes[0].numeracao)||
                         (o.transporte&&o.transporte.codigoRastreamento)||'';
      if(numeracaoLista) numeracaoLista=String(numeracaoLista).replace(/\s/g,'').toUpperCase();
      var nfChave=(o.notaFiscal&&o.notaFiscal.chave)||(o.nfe&&o.nfe.chave)||'';
      if(nfChave) nfChave=String(nfChave).replace(/\s/g,'');
      var contatoId=(o.contato&&o.contato.id)||'';
      var pedidoData=(o.data||'').substring(0,10); // YYYY-MM-DD
      var lojaIdStr=String((o.loja&&o.loja.id)||'');
      return {id:o.id,numero:o.numero,etiqueta:etiqueta,nf:nf,nfChave:nfChave,numLoja:String(numLoja||''),contatoId:String(contatoId),pedidoData:pedidoData,lojaId:lojaIdStr,
        destinatario:(o.contato&&o.contato.nome)||'—',
        servico:svc,lojaId:lojaId,mkt:mkt,urgente:urgente,numeracao:numeracaoLista,
        blingStatus:Number((o.situacao&&o.situacao.id)||0),
        dataPedido:o.data||'',date:today,pulledAt:nowTS(),
        status:'pendente',colT:null,obs:'',blingId:o.id};
    }).filter(function(p){
      if(!p.etiqueta || p.blingStatus!==24) return false;
      // Rejeita pedidos com mais de 30 dias (ex: 2024)
      // Pedidos com data futura (entrega agendada) são aceitos normalmente
      if(p.dataPedido){
        var d=new Date(p.dataPedido.substring(0,10)+'T12:00:00');
        var diffDias=(Date.now()-d.getTime())/(1000*60*60*24);
        if(diffDias>30) return false;
      }
      return true;
    });
    // ── MERGE ROBUSTO: busca por blingId em TODOS os packages (qualquer data)
    // Isso resolve devoluções de dias anteriores
    // IMPORTANTE: se tiver duplicatas, prioriza o que está coletado/problema
    var existingMap={};
    packages.forEach(function(p){
      var curr=existingMap[p.blingId];
      if(!curr){
        existingMap[p.blingId]=p;
      } else if(p.status==='coletado'||p.status==='problema'){
        // Prioriza status coletado/problema
        existingMap[p.blingId]=p;
      }
    });

    newPkgs.forEach(function(p){
      var ex=existingMap[p.blingId];
      if(!ex) return; // pacote novo — fica com defaults
      // Preserva campos enriquecidos independente da data
      if(ex.urgente) p.urgente=true; // CRITICAL: preserva flag FLEX/urgente
      if(ex.servico) p.servico=ex.servico;
      if(ex.numeracao) p.numeracao=ex.numeracao;
      if(ex.nfChave) p.nfChave=ex.nfChave;
      // Propaga NF só se for do mesmo dia (evita NF errada de dia anterior)
      if(ex.nf&&ex.date===today) p.nf=ex.nf;
      // ⚠ DEVOLUÇÃO: estava coletado/problema em DIA ANTERIOR mas voltou ao Bling como VERIFICADO (24)
      // IMPORTANTE: só considera devolução se passou mais de 48h desde a coleta
      // Se foi coletado recentemente, pode ser apenas delay na atualização do Bling
      if((ex.status==='coletado'||ex.status==='problema') && p.blingStatus===24 && ex.date!==today){
        // Verifica se foi coletado há mais de 48h
        var colTime = ex.colT ? new Date(ex.colT).getTime() : 0;
        var agora = Date.now();
        var horasDesdeColeta = (agora - colTime) / (1000*60*60);
        
        if(horasDesdeColeta > 48){
          // Mais de 48h → provavelmente é devolução real
          p.status='pendente'; p.colT=null;
          console.log('↩ Devolvido #'+p.numero+' (era '+ex.status+', coleta há '+Math.round(horasDesdeColeta)+'h) → pendente');
          toast('↩ '+p.numero+' devolvido — volta para expedição!','warn');
        } else {
          // Menos de 48h → mantém como coletado, só delay no Bling
          p.status=ex.status;
          p.colT=ex.colT;
          p.obs=ex.obs;
          p.date=ex.date; // mantém data original
          console.log('⏳ Pedido #'+p.numero+' coletado há '+Math.round(horasDesdeColeta)+'h, Bling ainda não atualizou');
        }
      } else if(ex.date===today){
        // Mesmo dia: mantém status local
        p.status=ex.status;
        p.colT=ex.colT;
        p.obs=ex.obs;
      } else if(ex.status==='pendente' && p.blingStatus===24){
        // ⚠ PEDIDO ANTIGO AINDA PENDENTE: estava pendente em dia anterior e ainda está VERIFICADO
        // Traz para hoje para aparecer na expedição
        console.log('📦 Pedido #'+p.numero+' ainda VERIFICADO (era de '+ex.date+') → aparece hoje');
      } else if(ex.status==='coletado'||ex.status==='problema'){
        // Dia anterior mas já está DESPACHADO no Bling: ignora (não é devolução)
        // Não faz nada, mantém como pendente do pull
      }
      // Se era de outro dia e não foi devolvido: fica como pendente (novo pull)
    });

    // Log de rastreamento para qualquer pacote devolvido
    newPkgs.forEach(function(p){
      if(p.urgente&&p.status==='pendente'){
        console.log('✅ URGENTE pendente após merge: #'+p.numero+' urgente='+p.urgente+' mkt='+p.mkt);
      }
    });

    // Preserva expedidos de HOJE que não voltaram do Bling (já estão em DESPACHADO)
    // Também preserva coletados das últimas 48h que ainda não atualizaram no Bling
    var idsNovos={};
    newPkgs.forEach(function(p){idsNovos[p.blingId]=true;});
    var agora = Date.now();
    var expedidosRecentes=packages.filter(function(p){
      if(p.status!=='coletado'&&p.status!=='problema') return false;
      if(idsNovos[p.blingId]) return false; // já veio no newPkgs (foi tratado no merge)
      // Preserva se foi coletado nas últimas 48h
      var colTime = p.colT ? new Date(p.colT).getTime() : 0;
      var horasDesdeColeta = (agora - colTime) / (1000*60*60);
      return horasDesdeColeta <= 48;
    });
    // Remove todos os de hoje e substitui
    packages=packages.filter(function(p){return p.date!==today;});
    packages=newPkgs.concat(expedidosRecentes).concat(packages);
    // Remove duplicatas por blingId (mantém o primeiro, que é o mais recente)
    var seen={};
    packages=packages.filter(function(p){
      if(seen[p.blingId]) return false;
      seen[p.blingId]=true;
      return true;
    });
    sv('expv5_pkgs',packages);
    syncToServer(); // sincroniza packages para outros dispositivos (desktop)
    toast(newPkgs.length+' pedidos carregados','ok');
    if(semTracking_count>0) toast('Buscando tracking de '+semTracking_count+' pedido(s)... aguarde','warn');
    renderMktGrid(); updateBadge();
    // Detecta FLEX em todos os ML e Shopee pendentes
    var mlPkgs=newPkgs.filter(function(p){return p.mkt==='ml'||p.mkt==='shopee';});
    var mlSemFlex=mlPkgs.filter(function(p){return !p.urgente;});
    var mlJaFlex=mlPkgs.filter(function(p){return p.urgente;});
    if(mlJaFlex.length>0) console.log('⚡ '+mlJaFlex.length+' já marcados como FLEX (do merge)');
    // Busca tracking: primeiro FLEX ML, depois TikTok/Shopee/etc em SEQUÊNCIA
    // (evita rate limit 429 do Bling ao rodar os dois em paralelo)
    var semTracking=newPkgs.filter(function(p){
      if(p.mkt==='ml'&&!p.urgente&&(!p.numLoja||!p.numeracao)) return true;
      // Shopee vai pelo detectFlexML — não duplicar aqui
      return !p.numeracao && (p.mkt==='tiktok'||p.mkt==='magalu'||p.mkt==='amazon');
    });
    var semTracking_count=semTracking.length;
    if(mlSemFlex.length>0||mlPkgs.length>0){
      var mlParaDetectar=typeof mlSemFlex!=='undefined'?mlSemFlex:mlPkgs;
      detectFlexML(mlParaDetectar, function(){
        if(semTracking.length>0){
          detectTrackingPkgs(semTracking);
        } else {
          // Após FLEX, busca NF de TODOS (ML + outros)
toast('✅ Tudo carregado!','ok');
        }
      });
    } else if(semTracking.length>0){
      detectTrackingPkgs(semTracking);
    } else {
      // Sem ML nem semTracking: busca NF direto
      var semNF3=packages.filter(function(p){return p.date===todayStr()&&!p.nf;});

    }

    setTimeout(function(){
      var semNFfinal=packages.filter(function(p){return p.date===todayStr()&&!p.nf;});
      if(semNFfinal.length>0) detectNF(semNFfinal,null);
    },10000);
    resetSyncBtn();
  }
  function resetSyncBtn(){
    lastPullAt=Date.now();
    btn.disabled=false;
    btn.innerHTML='<svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4 8l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 13h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Buscar no Bling';
  }
  fetchPage();
}

// ═══ RENDER ═══
function renderMktGrid(){
  var today=todayPkgs();
  var d=new Date();
  var days=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  document.getElementById('statusDate').textContent=days[d.getDay()]+', '+d.getDate()+' de '+d.toLocaleString('pt-BR',{month:'long'});
  var col=today.filter(function(p){return p.status==='coletado';}).length;
  var mktLabel='';
  if(activeMkt){
    var info=MKT[activeMkt]||{n:activeMkt};
    var mktPkgs=activeMkt==='flex'?today.filter(function(p){return p.urgente;}):today.filter(function(p){return p.mkt===activeMkt&&!p.urgente;});
    var mktCol=mktPkgs.filter(function(p){return p.status==='coletado';}).length;
    mktLabel=mktPkgs.length+' pedidos · '+mktCol+' coletados';
  } else {
    mktLabel=today.length+' pedidos · '+col+' coletados';
  }
  document.getElementById('statusSub').textContent=mktLabel;
  var urgentes=today.filter(function(p){return p.urgente&&p.status==='pendente';});
  var fb=document.getElementById('flexBanner');
  if(urgentes.length>0){
    fb.classList.add('show');
    document.getElementById('flexCount').textContent=urgentes.length;
    document.getElementById('flexList').innerHTML=urgentes.map(function(p){
      return '<span class="flex-tag">'+p.numero+' · '+p.servico+'</span>';
    }).join('');
  } else {fb.classList.remove('show');}
  if(today.length===0){
    document.getElementById('mktGrid').innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--th);padding:40px 0;font-size:13px">Nenhum pedido VERIFICADO</div>';
    return;
  }
  var flexPkgs=today.filter(function(p){return p.urgente;}); // todos para barra de progresso
  var byMkt={};
  // Exclui pacotes FLEX dos cards de marketplace — ficam só no card FLEX URGENTE
  today.forEach(function(p){
    if(p.urgente) return;
    if(!byMkt[p.mkt])byMkt[p.mkt]=[];
    byMkt[p.mkt].push(p);
  });
  var cards=[];
  if(flexPkgs.length>0){
    var fc=flexPkgs.filter(function(p){return p.status==='coletado';}).length;
    var fp=flexPkgs.filter(function(p){return p.status==='pendente';}).length;
    var fpct=flexPkgs.length?Math.round(fc/flexPkgs.length*100):0;
    var fActive=activeMkt==='flex';
    var fDone=fp===0&&fc>0;
    cards.push('<div class="mkt-card '+(fActive?'active':'')+(fDone?' done':'')+'" onclick="selectMkt(\'flex\')" style="'+(fDone?'':'border-color:rgba(224,85,85,.4)')+'">'+
      '<div class="mkt-head"><span class="mkt-chip c-rd">⚡ FLEX URGENTE</span></div>'+
      '<div class="mkt-count" style="color:'+(fDone?'var(--gr)':fp>0?'#F09090':'var(--gr)')+'">'+fp+'</div>'+
      '<div class="mkt-sub">'+(fDone?'✓ todos coletados':fp+' pend · '+fc+' col')+'</div>'+
      '<div class="mkt-prog"><div class="mkt-prog-bar" style="width:'+fpct+'%;background:#E05555"></div></div>'+
      '</div>');
  }
  MKT_ORDER.forEach(function(m){
    var list=byMkt[m]||[];
    var mc=list.filter(function(p){return p.status==='coletado';}).length;
    var mp=list.filter(function(p){return p.status==='pendente';}).length;
    var pct=list.length?Math.round(mc/list.length*100):0;
    var isActive=activeMkt===m;
    var isDone=list.length>0&&mp===0;
    var isEmpty=list.length===0;
    if(isEmpty&&ALWAYS_SHOW.indexOf(m)===-1) return;
    var info=MKT[m]||{cls:'c-outro',icon:'📦',n:m};
    cards.push('<div class="mkt-card '+(isActive?'active':'')+(isDone?' done':'')+'" onclick="selectMkt(\''+m+'\')" style="'+(isEmpty?'opacity:.45':'')+'">'+
      '<div class="mkt-head"><span class="mkt-chip '+info.cls+'">'+info.icon+' '+info.n+'</span></div>'+
      '<div class="mkt-count" style="color:'+(isDone?'var(--gr)':isEmpty?'var(--th)':mp>0?'var(--tx)':'var(--gr)')+'">'+mp+'</div>'+
      '<div class="mkt-sub">'+(isEmpty?'nenhum hoje':isDone?'✓ todos coletados':mp+' pend · '+mc+' col')+'</div>'+
      '<div class="mkt-prog"><div class="mkt-prog-bar" style="width:'+pct+'%"></div></div>'+
      '</div>');
  });
  document.getElementById('mktGrid').innerHTML=cards.join('');
}

function selectMkt(mkt){
  if(activeMkt===mkt){closeColeta();return;}
  if(_tirando_fotos) return; // Não muda de card durante captura de fotos
  stopCamera();
  activeMkt=mkt; colSession=[]; scanPaused=false; encerrandoParcial=false; fotosVeiculo=[]; problemaPkgs=[];
  clearColetaTimer(); // Limpa timer anterior se houver
  ['wrongAlert','confirmArea','missingArea','motivoArea','desfazerBar'].forEach(function(id){document.getElementById(id).classList.remove('show');});
  document.getElementById('encerrarBtn').classList.remove('show');
  document.getElementById('coletaFb').className='fb';
  document.getElementById('coletaPanel').classList.add('show');
  document.getElementById('coletaTitle').textContent=(MKT[mkt]||{}).icon+' '+(MKT[mkt]||{n:mkt}).n;
  document.getElementById('biparBtn').classList.remove('scanning');
  document.getElementById('biparBtn').innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="8" y="4" width="2" height="16" rx="1" fill="currentColor"/><rect x="12" y="4" width="3" height="16" rx="1" fill="currentColor"/><rect x="17" y="4" width="2" height="16" rx="1" fill="currentColor"/><rect x="21" y="4" width="1" height="16" rx="1" fill="currentColor"/></svg> BIPAR ETIQUETAS';
  document.getElementById('progArea').style.display='none';
  renderPkgList(); renderMktGrid();
  document.getElementById('coletaPanel').scrollIntoView({behavior:'smooth',block:'start'});
  // Atualiza só essa loja no Bling — verifica se tem pedido novo
  var agoraMs=Date.now();
  var lastMktPull=window['_lastMktPull_'+mkt]||0;
  if(agoraMs-lastMktPull>60000){ // no máximo 1x por minuto por loja
    window['_lastMktPull_'+mkt]=agoraMs;
    setTimeout(function(){pullFromBlingMkt(mkt);},800);
  }
}

function closeColeta(){
  activeMkt=''; colSession=[]; scanPaused=false; encerrandoParcial=false;
  clearColetaTimer();
  stopCamera();
  document.getElementById('coletaPanel').classList.remove('show');
  renderMktGrid();
}

var coletaTimerInterval = null;
var coletaDeadline = null;

function clearColetaTimer(){
  if(coletaTimeout){ clearTimeout(coletaTimeout); coletaTimeout=null; }
  if(coletaTimerInterval){ clearInterval(coletaTimerInterval); coletaTimerInterval=null; }
  coletaDeadline=null;
  var el=document.getElementById('coletaTimer');
  if(el) el.style.display='none';
}

function startColetaTimer(){
  if(coletaDeadline) return; // Já iniciou
  coletaDeadline = Date.now() + 25*60*1000; // 25 minutos
  
  // Atualiza contador a cada segundo
  coletaTimerInterval = setInterval(function(){
    var restante = Math.max(0, coletaDeadline - Date.now());
    var min = Math.floor(restante/60000);
    var sec = Math.floor((restante%60000)/1000);
    var el = document.getElementById('coletaTimer');
    if(el){
      el.style.display='block';
      el.textContent = '⏱ '+min+':'+('0'+sec).slice(-2);
      if(restante < 60000) el.style.color='var(--rd)'; // Último minuto = vermelho
      else if(restante < 5*60000) el.style.color='var(--am)'; // Últimos 5 min = amarelo
      else el.style.color='var(--tm)';
    }
    if(restante <= 0){
      clearColetaTimer();
      toast('⏰ Tempo esgotado! Coleta resetada.','err');
      beepError();
      closeColeta();
    }
  }, 1000);
}

function getPkgsAtivos(){
  if(activeMkt==='flex'){
    // FLEX: retorna todos os urgentes (coletados aparecem com ✓, pendentes para bipar)
    return todayPkgs().filter(function(p){return p.urgente;});
  }
  // Outros marketplaces: exclui urgentes (FLEX) — eles só aparecem no card FLEX
  return todayPkgs().filter(function(p){return p.mkt===activeMkt&&!p.urgente;});
}

function renderPkgList(){
  if(!activeMkt) return;
  var pkgs=getPkgsAtivos();
  // Ordem crescente por número do pedido
  // Pendentes primeiro (crescente), coletados/bipados depois (crescente)
  var _pend=pkgs.filter(function(p){return p.status!=='coletado'&&colSession.indexOf(p.etiqueta)===-1;});
  var _col=pkgs.filter(function(p){return p.status==='coletado'||colSession.indexOf(p.etiqueta)!==-1;});
  _pend.sort(function(a,b){return (parseInt(a.numero)||0)-(parseInt(b.numero)||0);});
  _col.sort(function(a,b){return (parseInt(a.numero)||0)-(parseInt(b.numero)||0);});
  pkgs=_pend.concat(_col);
  var today=todayStr();
  document.getElementById('pkgList').innerHTML=pkgs.map(function(p){
    var sc=colSession.indexOf(p.etiqueta)!==-1;
    var col=p.status==='coletado';
    var ativo=sc||col;
    // Busca foto do scan desta etiqueta
    var scanItem=null;
    for(var i=0;i<scans.length;i++){
      if(scans[i].etiqueta===p.etiqueta&&scans[i].date===today&&scans[i].tipo!=='lote'){
        scanItem=scans[i]; break;
      }
    }
    var fotoHtml='';
    if(ativo){
      if(scanItem&&scanItem.photo){
        fotoHtml='<img class="pkg-photo" src="'+scanItem.photo+'" data-et="'+p.etiqueta+'" onclick="verFotoScan(this.dataset.et)" title="Ver foto da etiqueta">';
      } else {
        fotoHtml='<div class="pkg-photo-placeholder" title="Sem foto">📷</div>';
      }
    }
    return '<div class="pkg-row '+(ativo?'scanned':'')+'" data-etiqueta="'+p.etiqueta+'">'+
      fotoHtml+
      '<div style="flex:1;min-width:0">'+
      // Linha 1: número do pedido Bling (principal)
      '<div class="pkg-num">'+p.numero+'</div>'+
      // Linha 2: NF · marketplace · tracking (tudo visível)
      '<div class="pkg-sub">'+
        (p.nf?'<span style="color:var(--gr)">NF '+p.nf+'</span>':
              '<span style="color:var(--th);font-style:italic">NF ...</span>')+
        (p.numLoja?'<span style="color:var(--bl)"> · 🛒 '+p.numLoja+'</span>':'')+
        (p.numeracao?'<span style="color:var(--tm)"> · 📦 '+p.numeracao+'</span>':'')+
      '</div>'+
      '<div class="pkg-dest">'+p.destinatario+'</div>'+
      '</div>'+
      '<span class="pkg-badge '+(ativo?'b-scan':'b-pend')+'">'+(ativo?'✓':'—')+'</span>'+
      (sc?'<button class="unscan-btn" data-et="'+p.etiqueta+'" onclick="cancelarScan(this.dataset.et)" title="Cancelar bipagem">✕</button>':'')+
      '</div>';
  }).join('');
  renderProgress();
}

function renderProgress(){
  if(!activeMkt){document.getElementById('progArea').style.display='none';return;}
  var pend=getPkgsAtivos().filter(function(p){return p.status==='pendente'&&colSession.indexOf(p.etiqueta)===-1;});
  var total=pend.length+colSession.length;
  if(total===0) return;
  var pct=Math.round(colSession.length/total*100);
  document.getElementById('progArea').style.display='block';
  document.getElementById('progBar').style.width=pct+'%';
  document.getElementById('progPct').textContent=pct+'%';
  document.getElementById('progPct').style.color=pct===100?'var(--gr)':'var(--am)';
  document.getElementById('statOk').textContent='✓ '+colSession.length+' bipados';
  document.getElementById('statPend').textContent=pend.length+' pendentes';
  // Mostra botão encerrar parcial sempre que tiver algo bipado mas ainda tiver pendentes
  var encBtn=document.getElementById('encerrarBtn');
  if(colSession.length>0&&pend.length>0){
    encBtn.classList.add('show');
    encBtn.innerHTML='✅ ENCERRAR COLETA<br><span style="font-size:12px;font-weight:500;opacity:.85">'+colSession.length+' bipados · '+pend.length+' pendentes não despachados</span>';
    encBtn.style.background='#1a7a3a';
    encBtn.style.color='#fff';
    encBtn.style.fontSize='15px';
    encBtn.style.fontWeight='800';
    encBtn.style.lineHeight='1.4';
    encBtn.style.height='auto';
    encBtn.style.padding='14px';
  } else {
    encBtn.classList.remove('show');
  }
  if(pend.length===0&&colSession.length>0) showConfirm();
}

function showConfirm(){
  var confirmArea = document.getElementById('confirmArea');
  var jaVisivel = confirmArea.classList.contains('show');
  
  confirmArea.classList.add('show');
  document.getElementById('confirmText').innerHTML='Todos os <b style="color:var(--gr)">'+colSession.length+'</b> pacotes de '+(MKT[activeMkt]||{}).icon+' '+(MKT[activeMkt]||{n:activeMkt}).n+' foram bipados.<br><span style="color:var(--tm);font-size:12px">Preencha abaixo para finalizar.</span>';
  document.getElementById('missingArea').classList.remove('show');
  document.getElementById('fotoAlert').style.display='none';
  
  // SÓ reseta se ainda não tem fotos E não estava visível antes
  if(!jaVisivel && fotosVeiculo.length === 0){
    document.getElementById('obsLote').value='';
    document.getElementById('btnFotoVeiculo').className='foto-btn';
    document.getElementById('btnFotoVeiculo').textContent='📷 Tirar foto (0/3)';
    problemaPkgs=[];
  }
  
  renderFotosVeiculo();
  renderProblemaList();
  renderProblemaSelect();
}

// ═══ CÂMERA ═══
function toggleBipar(){
  if(scanning){stopCamera();return;}
  startCamera();
}
function startCamera(){
  if(!('BarcodeDetector' in window)){toast('Use Chrome Android para câmera','warn');return;}
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280}}})
  .then(function(stream){
    camStream=stream;
    var v=document.getElementById('camVideo');
    v.srcObject=stream;
    document.getElementById('camWrap').classList.add('show');
    var btn=document.getElementById('biparBtn');
    btn.classList.add('scanning');
    btn.textContent='⏹ PARAR LEITURA';
    barcodeDetector=new BarcodeDetector({formats:['code_128','code_39','ean_13','ean_8','qr_code','data_matrix','pdf417','itf','aztec']});
    scanning=true;
    scanLoop();
  })
  .catch(function(e){toast('Câmera: '+e.message,'err');});
}
function scanLoop(){
  if(!scanning||!barcodeDetector) return;
  if(scanPaused){requestAnimationFrame(scanLoop);return;}
  var v=document.getElementById('camVideo');
  barcodeDetector.detect(v).then(function(codes){
    if(codes.length>0){
      var raw=codes[0].rawValue.trim();
      if(raw!==lastCode||Date.now()-lastCodeAt>4000){
        var photo=capturePhoto(v);
        handleScan(raw,photo);
      }
    }
  }).catch(function(){}).finally(function(){
    requestAnimationFrame(scanLoop);
  });
}
function capturePhoto(v){
  try{
    var c=document.createElement('canvas');
    c.width=v.videoWidth;c.height=v.videoHeight;
    c.getContext('2d').drawImage(v,0,0);
    return c.toDataURL('image/jpeg',.6);
  }catch(e){return null;}
}
function stopCamera(){
  scanning=false; scanPaused=false;
  if(camStream){camStream.getTracks().forEach(function(t){t.stop();});camStream=null;}
  var v=document.getElementById('camVideo');
  if(v) v.srcObject=null;
  document.getElementById('camWrap').classList.remove('show');
  var btn=document.getElementById('biparBtn');
  if(btn){
    btn.classList.remove('scanning');
    btn.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="8" y="4" width="2" height="16" rx="1" fill="currentColor"/><rect x="12" y="4" width="3" height="16" rx="1" fill="currentColor"/><rect x="17" y="4" width="2" height="16" rx="1" fill="currentColor"/><rect x="21" y="4" width="1" height="16" rx="1" fill="currentColor"/></svg> BIPAR ETIQUETAS';
  }
}
function manualScan(){
  var inp=document.getElementById('manualIn');
  var code=inp.value.trim().toUpperCase();
  if(code){handleScan(code,null);inp.value='';}
}
document.getElementById('manualIn').addEventListener('keydown',function(e){if(e.key==='Enter')manualScan();});

// ═══ SCAN ═══
function handleScan(rawCode,photo){
  if(!rawCode||!activeMkt) return;
  var code=rawCode.trim().replace(/\s/g,'');
  var isMagaluQR=false;

  // ── QR MAGALU: {"EXTERNAL_GROUPER_CODE":"1526...","TAG_CODE":"191372159-01",...}
  // Detecta por regex (mais robusto que indexOf com caracteres especiais)
  var magaluMatch=code.match(/EXTERNAL.GROUPER.CODE[^0-9]*(\d{10,20})/i)||rawCode.match(/EXTERNAL.GROUPER.CODE[^0-9]*(\d{10,20})/i);
  if(!magaluMatch) magaluMatch=code.match(/TAG.CODE[^0-9]*(\d{6,15})/i)||rawCode.match(/TAG.CODE[^0-9]*(\d{6,15})/i);
  
  if(magaluMatch){
    isMagaluQR=true;
    code=magaluMatch[1];
    toast('QR→'+code,'ok');
    console.log('🔵 QR MAGALU extraído:', code);
  }

  // ── Formato 1: JSON ML antigo {"id":"12345","t":"lm"}
  if(!isMagaluQR){
    try{
      var qr=JSON.parse(rawCode);
      if(qr.id) code=String(qr.id).trim().replace(/\s/g,'');
    }catch(e){}
  }

  // ── Formato 2: QR FLEX ML  `^id^Ç^46767751180^,^sender_id^...
  // Extrai o número depois de ^id^ (ignora caracteres especiais entre a chave e o valor)
  if(!code.match(/^[0-9]+$/)&&rawCode.indexOf('^id^')!==-1){
    var flexMatch=rawCode.match(/\^id\^[^0-9]*([0-9]+)/);
    if(flexMatch) code=flexMatch[1];
  }

  // ── Formato 3: QR FLEX ML alternativo com "id" sem acento
  if(!code.match(/^[0-9A-Z]+$/)&&rawCode.toLowerCase().indexOf('"id"')!==-1){
    var altMatch=rawCode.match(/"id"\s*:\s*"?([0-9]+)"?/i);
    if(altMatch) code=altMatch[1];
  }

  code=code.toUpperCase();
  console.log('🔍 Código lido:', code, '| packages:', packages.filter(function(p){return p.date===todayStr();}).map(function(p){return p.numero+'→'+p.numeracao;}).join(', '));
  if(code===lastCode&&Date.now()-lastCodeAt<2000) return;
  lastCode=code; lastCodeAt=Date.now();
  var today=todayStr();
  document.getElementById('wrongAlert').classList.remove('show');

  function match(p){
    var c=code.toUpperCase().replace(/\s/g,'');
    if(String(p.etiqueta).toUpperCase()===c) return true;
    if(String(p.numero)===c) return true;
    if(String(p.blingId)===c) return true;
    // Número do pedido como string com e sem zeros
    if(String(p.numero)===c||String(parseInt(p.numero,10))===c) return true;
    if(p.numeracao){
      var pnum=String(p.numeracao).toUpperCase().replace(/\s/g,'');
      if(pnum===c) return true;                                   // exato
      if(c.length>=8&&pnum.endsWith(c)) return true;             // sufixo (ex: 46625715803 bate em 15803)
      if(c.length>=8&&pnum.indexOf(c)!==-1) return true;         // contém
      if(c.length>=8&&c.indexOf(pnum)!==-1) return true;         // código contém numeracao
      // Ignora zeros à esquerda
      if(parseInt(pnum,10)===parseInt(c,10)) return true;
    }
    if(p.numLoja){
      var ploja=String(p.numLoja).replace(/\s/g,'').toUpperCase();
      if(ploja===c) return true;
      if(c.length>=8&&ploja.endsWith(c)) return true;
      if(c.length>=8&&ploja.indexOf(c)!==-1) return true;
      if(parseInt(ploja,10)===parseInt(c,10)) return true;
    }
    // Chave DANFE completa (44 dígitos) — câmera TikTok lê o código de barras da NF
    if(p.nfChave&&p.nfChave===c) return true;
    // Últimos 13 dígitos da chave DANFE (código que algumas câmeras lêem)
    if(p.nfChave&&p.nfChave.length===44&&p.nfChave.slice(-13)===c.slice(-13)&&c.length>=13) return true;
    // Número da NF (ex: "12345")
    if(p.nf&&String(p.nf).trim()===c) return true;
    return false;
  }
  var pkg=null, wrongPkg=null, already=null;
  for(var i=0;i<packages.length;i++){
    var p=packages[i];
    if(!match(p)||p.date!==today) continue;
    if(p.status==='coletado'){already=p;break;}
    // Quando mkt normal, exclui urgentes (FLEX só é bipado pelo card FLEX)
    var mktMatch=activeMkt==='flex'?p.urgente:(p.mkt===activeMkt&&!p.urgente);
    if(mktMatch){if(p.status==='pendente'){pkg=p;break;}}
    else if(activeMkt!=='flex'&&p.mkt!==activeMkt&&p.status==='pendente'){wrongPkg=p;}
  }

  // inSession: verifica pela etiqueta canônica
  var inSession=false;
  if(pkg&&colSession.indexOf(pkg.etiqueta)!==-1) inSession=true;
  if(!pkg&&already&&colSession.indexOf(already.etiqueta)!==-1) inSession=true;

  if(inSession||already){
    showFb('⚠ Já bipado: '+((pkg||already)||{numero:code}).numero,'warn');
    beepError(); return;
  }
  if(wrongPkg){
    var wInfo=MKT[wrongPkg.mkt]||{icon:'?',n:wrongPkg.mkt};
    document.getElementById('wrongBody').innerHTML='Este pacote é de <b>'+wInfo.icon+' '+wInfo.n+'</b><br><span style="font-size:14px">'+wrongPkg.numero+'</span>';
    document.getElementById('wrongAlert').classList.add('show');
    toast('ERRADO: '+wrongPkg.numero+' é '+wInfo.n+'!','err');
    beepError(); return;
  }
  if(!pkg){
    // ═══ FALLBACK MAGALU VAPT/FLEX ═══
    // Só mostra picker se for QR Magalu detectado (VAPT/FLEX usa QR, não código de barras)
    if(isMagaluQR){
      var magaluPend=packages.filter(function(p){
        return p.mkt==='magalu'&&p.status==='pendente'&&!p.numeracao&&colSession.indexOf(p.etiqueta)===-1;
      });
      if(magaluPend.length>0){
        showMagaluPicker(magaluPend,code,photo);
        return;
      }
    }
    showFb('Código não encontrado: '+code.substring(0,50),'warn');
    beepError(); return;
  }
  // SUCESSO
  scanPaused=true;
  document.getElementById('camStatus').textContent='✓ Bipado! Aguarde...';
  document.getElementById('camStatus').style.background='rgba(46,204,138,.7)';
  setTimeout(function(){
    scanPaused=false;
    document.getElementById('camStatus').textContent='Aponte para o código de barras';
    document.getElementById('camStatus').style.background='rgba(0,0,0,.6)';
  },3000);
  var chave=pkg.etiqueta;
  // Remove scan anterior desta etiqueta hoje (evita duplicata ao re-bipar após desfazer)
  for(var _si=scans.length-1;_si>=0;_si--){
    if(scans[_si].etiqueta===chave&&scans[_si].date===today&&scans[_si].tipo!=='lote'){
      scans.splice(_si,1);
    }
  }
  if(colSession.indexOf(chave)===-1) colSession.push(chave);
  startColetaTimer(); // Inicia timer de 20 min no primeiro bip
  scans.unshift({etiqueta:chave,mkt:activeMkt,date:today,time:nowTS(),photo:photo,destinatario:pkg.destinatario,numero:pkg.numero});
  sv('expv5_scans',scans);
  syncToServer();
  // Upload da foto para o servidor (permite acesso de qualquer dispositivo)
  if(photo) uploadScanPhoto(chave, today, photo);
  if(photo){var fl=document.getElementById('photoFlash');fl.classList.add('flash');setTimeout(function(){fl.classList.remove('flash');},150);}
  beepSuccess();
  showFb('✓ '+pkg.numero+' · '+pkg.destinatario,'ok');
  toast('✓ '+pkg.numero,'ok');
  // Mostra barra de desfazer com o último scan
  var bar=document.getElementById('desfazerBar');
  bar.classList.add('show');
  document.getElementById('desfazerInfo').textContent='↩ Último: '+pkg.numero+' · '+pkg.destinatario.split(' ')[0];
  clearTimeout(bar._t);
  bar._t=setTimeout(function(){bar.classList.remove('show');},8000);
  renderPkgList();
}

function showFb(msg,type){
  var el=document.getElementById('coletaFb');
  clearTimeout(el._t);
  el.className='fb '+type+' show';
  el.textContent=msg;
  // Sucesso fica até próximo bip, erros somem após 3.5s
  if(type!=='ok'){
    el._t=setTimeout(function(){el.className='fb';},3500);
  }
}

// ═══ PICKER MAGALU ═══
function showMagaluPicker(pendentes,code,photo){
  scanPaused=true;
  var html='<div style="padding:20px;max-height:70vh;overflow-y:auto">'+
    '<div style="font-size:15px;font-weight:700;color:var(--am);margin-bottom:12px">🔵 Qual pedido Magalu?</div>'+
    '<div style="font-size:11px;color:var(--tm);margin-bottom:16px">Código lido: '+code.substring(0,20)+'...</div>';
  pendentes.forEach(function(p){
    html+='<div onclick="selectMagaluPkg(\''+p.etiqueta+'\',\''+code+'\')" style="background:var(--s1);border:1px solid var(--b2);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer">'+
      '<div style="font-weight:700;color:var(--th)">#'+p.numero+'</div>'+
      '<div style="font-size:11px;color:var(--tm)">'+p.destinatario+'</div>'+
      (p.numLoja?'<div style="font-size:10px;color:var(--bl);margin-top:4px">🛒 '+p.numLoja+'</div>':'')+
      '</div>';
  });
  html+='<button onclick="closeTopModal();scanPaused=false;" style="width:100%;padding:12px;background:var(--b2);color:var(--tm);border:none;border-radius:8px;margin-top:8px;cursor:pointer">Cancelar</button>';
  html+='</div>';
  openModal(html);
}
function selectMagaluPkg(etiqueta,code){
  closeTopModal();
  var pkg=null;
  for(var i=0;i<packages.length;i++){
    if(packages[i].etiqueta===etiqueta){pkg=packages[i];break;}
  }
  if(pkg){
    pkg.numeracao=code;
    sv('expv5_pkgs',packages);
    toast('✓ Associado: #'+pkg.numero,'ok');
    scanPaused=false;
    handleScan(code,null);
  }
}

// ═══ VER FOTO DO SCAN ═══
function verFotoScan(etiqueta){
  var today=todayStr();
  var scanItem=null;
  for(var i=0;i<scans.length;i++){
    if(scans[i].etiqueta===etiqueta&&scans[i].tipo!=='lote'){
      scanItem=scans[i]; break;
    }
  }
  // Tenta buscar foto: 1) localStorage, 2) servidor
  var localPhoto=scanItem&&scanItem.photo?scanItem.photo:null;
  var scanDate=scanItem?scanItem.date:today;
  if(!localPhoto){
    // Busca no servidor
    var key='scan_'+etiqueta+'_'+scanDate;
    getPhotoFromServer(key, function(serverPhoto){
      if(serverPhoto){
        _showScanPhotoModal(serverPhoto, scanItem);
      } else {
        var msg=scanItem?'Bipado em '+formatDate(scanItem.date)+' às '+scanItem.time:'';
        openModal('<div class="modal-img-wrap" style="text-align:center;padding:24px 20px">'+
          '<div style="font-size:52px;margin-bottom:14px">📷</div>'+
          '<div style="color:var(--tx);font-size:15px;font-weight:700;margin-bottom:8px">Foto não disponível</div>'+
          '<div style="color:var(--tm);font-size:12px;line-height:1.8">'+
            (msg?'<div style="color:var(--tm);margin-bottom:8px">'+msg+'</div>':'')+
            'Fotos bipadas antes de 02/04/2026<br>não foram sincronizadas com o servidor.<br><br>'+
            '📱 Acesse pelo celular da expedição<br>para ver imagens antigas.'+
          '</div>'+
          '<button class="modal-close" onclick="closeTopModal()">✕</button>'+
          '</div>'+
          '<button class="modal-back" onclick="closeTopModal()">← Fechar</button>');
      }
    });
    return;
  }
  _showScanPhotoModal(localPhoto, scanItem);
}

function _showScanPhotoModal(photo, scanItem){
  var p=null;
  if(scanItem) for(var i=0;i<packages.length;i++){if(packages[i].etiqueta===scanItem.etiqueta){p=packages[i];break;}}
  var infoBar='<div class="modal-info">';
  // Ordem: NF | #Bling | #Marketplace | destinatário | data/hora
  if(p&&p.nf)   infoBar+='<div style="font-size:13px;font-weight:700;color:var(--gr)">NF '+p.nf+'</div>';
  infoBar+='<div style="font-size:12px;font-family:var(--mono);color:#fff;margin-top:2px">';
  infoBar+='Pedido '+scanItem.numero;
  if(p&&p.numLoja) infoBar+=' · <span style="color:var(--bl)">🛒 '+p.numLoja+'</span>';
  infoBar+='</div>';
  infoBar+='<div style="font-size:11px;color:var(--tm);margin-top:2px">'+scanItem.destinatario+'</div>';
  infoBar+='<div style="font-size:10px;color:var(--th);margin-top:2px">📅 '+formatDate(scanItem.date)+' às '+scanItem.time+'</div>';
  infoBar+='</div>';
  openModal('<div class="modal-img-wrap">'+
    '<img src="'+photo+'" alt="etiqueta">'+
    infoBar+
    '<button class="modal-close" onclick="closeTopModal()">✕</button>'+
    '</div>'+
    '<button class="modal-back" onclick="closeTopModal()">← Voltar</button>');
}

// ═══ CANCELAR / DESFAZER SCAN ═══
function cancelarScan(etiqueta){
  var idx=colSession.indexOf(etiqueta);
  if(idx===-1) return;
  var p=null;
  for(var i=0;i<packages.length;i++){if(packages[i].etiqueta===etiqueta){p=packages[i];break;}}
  if(!confirm('Cancelar bipagem de '+(p?p.numero:etiqueta)+'?')) return;
  colSession.splice(idx,1);
  // Remove do array de scans também
  for(var j=0;j<scans.length;j++){
    if(scans[j].etiqueta===etiqueta&&scans[j].date===todayStr()&&scans[j].tipo!=='lote'){
      scans.splice(j,1); break;
    }
  }
  sv('expv5_scans',scans);
  document.getElementById('confirmArea').classList.remove('show');
  document.getElementById('desfazerBar').classList.remove('show');
  beepError();
  showFb('↩ Cancelado: '+(p?p.numero:etiqueta),'warn');
  renderPkgList();
}

function desfazerUltimo(){
  if(colSession.length===0) return;
  var etiqueta=colSession[colSession.length-1];
  cancelarScan(etiqueta);
}

// ═══ FOTOS VEÍCULO ═══
var cameraStream = null;

function abrirCameraFoto(){
  var overlay = document.getElementById('cameraOverlay');
  var video = document.getElementById('cameraVideo');
  
  // Se já tem 3 fotos, não abre mais
  if(fotosVeiculo.length >= 3){
    toast('Já tem 3 fotos!','warn');
    return;
  }
  
  // Se overlay já está aberto, não reabre
  if(overlay.classList.contains('show')){
    return;
  }
  
  // Atualiza contador
  atualizarCameraUI();
  
  // Tenta abrir câmera nativa
  if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    })
    .then(function(stream){
      cameraStream = stream;
      video.srcObject = stream;
      overlay.classList.add('show');
    })
    .catch(function(err){
      console.error('Erro ao acessar câmera:', err);
      toast('Usando modo alternativo...','warn');
      abrirCameraFallback();
    });
  } else {
    abrirCameraFallback();
  }
}

function abrirCameraFallback(){
  var inp=document.createElement('input');
  inp.type='file'; inp.accept='image/*'; inp.capture='environment';
  inp.style.display='none';
  inp.onchange=function(){onFotoSelecionadaFallback(inp);};
  document.body.appendChild(inp);
  inp.click();
}

function onFotoSelecionadaFallback(input){
  var file=input.files[0];
  if(!file) return;
  var reader=new FileReader();
  reader.onload=function(e){
    fotosVeiculo.push(e.target.result);
    renderFotosVeiculo();
    atualizarBotaoFoto();
    toast('Foto '+fotosVeiculo.length+'/3 salva ✓','ok');
    if(fotosVeiculo.length<3){
      setTimeout(function(){abrirCameraFallback();}, 400);
    }
  };
  reader.readAsDataURL(file);
  input.value='';
  setTimeout(function(){if(input.parentNode) input.parentNode.removeChild(input);}, 100);
}

function capturarFotoVeiculo(){
  _tirando_fotos = true;
  
  var video = document.getElementById('cameraVideo');
  var canvas = document.getElementById('cameraCanvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  
  fotosVeiculo.push(dataUrl);
  var total = fotosVeiculo.length;
  
  // Atualiza contador no overlay
  var counter = document.getElementById('cameraCounter');
  counter.textContent = total >= 3 ? '✅ 3 fotos!' : '📸 Foto '+(total+1)+' de 3';
  
  // Atualiza thumbs no overlay
  document.getElementById('cameraThumbs').innerHTML = fotosVeiculo.map(function(f){
    return '<img src="'+f+'" style="width:50px;height:50px;margin:4px;border:2px solid lime;border-radius:6px">';
  }).join('');
  
  // Atualiza área de confirmação
  renderFotosVeiculo();
  atualizarBotaoFoto();
  
  toast('Foto '+total+'/3 ✓','ok');
  
  if(total >= 3){
    _tirando_fotos = false;
    setTimeout(fecharCameraVeiculo, 600);
  }
}

function atualizarCameraUI(){
  var counter = document.getElementById('cameraCounter');
  var thumbs = document.getElementById('cameraThumbs');
  var capture = document.getElementById('cameraCapture');
  
  if(fotosVeiculo.length >= 3){
    counter.textContent = '✅ 3 fotos tiradas!';
    counter.style.color = 'var(--gr)';
    capture.classList.add('done');
  } else {
    counter.textContent = '📸 Foto '+(fotosVeiculo.length+1)+' de 3';
    counter.style.color = 'var(--gr)';
    capture.classList.remove('done');
  }
  
  // Thumbnails
  var html = '';
  fotosVeiculo.forEach(function(f, i){
    html += '<img class="camera-thumb" src="'+f+'" alt="foto '+(i+1)+'">';
  });
  thumbs.innerHTML = html;
}

function fecharCameraVeiculo(){
  var overlay = document.getElementById('cameraOverlay');
  var video = document.getElementById('cameraVideo');
  
  if(cameraStream){
    cameraStream.getTracks().forEach(function(track){ track.stop(); });
    cameraStream = null;
  }
  video.srcObject = null;
  overlay.classList.remove('show');
}

function atualizarBotaoFoto(){
  var btn = document.getElementById('btnFotoVeiculo');
  if(fotosVeiculo.length >= 3){
    btn.className = 'foto-btn done';
    btn.textContent = '✓ 3 fotos tiradas';
    document.getElementById('fotoAlert').style.display = 'none';
  } else {
    btn.className = 'foto-btn';
    btn.innerHTML = '📷 Tirar Foto '+(fotosVeiculo.length+1)+' de 3';
  }
}

function renderFotosVeiculo(){
  var container=document.getElementById('veiculoFotos');
  if(!container) return;
  container.innerHTML=fotosVeiculo.map(function(f,i){
    return '<div class="vthumb-wrap">'+
      '<img src="'+f+'" onclick="verFoto('+i+')" alt="foto '+(i+1)+'">'+
      '<button class="vthumb-del" onclick="delFoto('+i+')">✕</button>'+
      '</div>';
  }).join('');
}

function delFoto(i){
  fotosVeiculo.splice(i,1);
  renderFotosVeiculo();
  atualizarBotaoFoto();
}
function verFoto(i){
  var src=fotosVeiculo[i];
  if(!src) return;
  openModal('<div class="modal-img-wrap"><img src="'+src+'" alt="foto" style="max-width:100%;max-height:82vh;border-radius:8px;display:block"><button class="modal-close" onclick="closeTopModal()">✕</button></div><button class="modal-back" onclick="closeTopModal()">← Voltar</button>');
}

// ═══ PROBLEMAS ═══
function toggleProblemaSelect(){
  var el=document.getElementById('problemaSelect');
  el.style.display=el.style.display==='none'||el.style.display===''?'block':'none';
}
function renderProblemaSelect(){
  var pkgs=getPkgsAtivos().filter(function(p){return problemaPkgs.indexOf(p.etiqueta)===-1;});
  document.getElementById('problemaSelect').innerHTML=pkgs.length===0?
    '<div style="padding:12px;font-size:12px;color:var(--tm);text-align:center">Nenhum disponível</div>':
    pkgs.map(function(p){return '<div class="problema-select-item" data-et="'+p.etiqueta+'" onclick="addProblema(this.dataset.et)">'+p.numero+' · '+p.destinatario+'</div>';}).join('');
}
function addProblema(et){
  if(problemaPkgs.indexOf(et)===-1) problemaPkgs.push(et);
  document.getElementById('problemaSelect').style.display='none';
  renderProblemaList(); renderProblemaSelect();
}
function delProblema(et){
  problemaPkgs=problemaPkgs.filter(function(e){return e!==et;});
  renderProblemaList(); renderProblemaSelect();
}
function renderProblemaList(){
  document.getElementById('problemaList').innerHTML=problemaPkgs.map(function(et){
    var p=null;
    for(var i=0;i<packages.length;i++){if(packages[i].etiqueta===et){p=packages[i];break;}}
    return '<div class="problema-item">'+
      '<div><b>🚫 '+(p?p.numero:et)+'</b>'+(p&&p.nf?' <span style="font-size:10px">NF '+p.nf+'</span>':'')+(p&&p.numLoja?' <span style="font-size:10px;color:var(--bl)">🛒'+p.numLoja+'</span>':'')+'<br><span style="font-size:10px;opacity:.7">'+(p?p.destinatario:'')+'</span></div>'+
      '<button onclick="delProblema(\''+et+'\')">✕</button>'+
      '</div>';
  }).join('');
}

// ═══ ENCERRAR PARCIAL ═══
function showEncerrar(){
  var pend=getPkgsAtivos().filter(function(p){return p.status==='pendente'&&colSession.indexOf(p.etiqueta)===-1;});
  document.getElementById('encerrarBtn').classList.remove('show');
  document.getElementById('motivoArea').classList.add('show');
  document.getElementById('motivoText').value='';
  document.getElementById('motivoAlert').style.display='none';
  document.getElementById('motivoPendList').innerHTML=
    '<div style="font-size:11px;color:var(--am);margin-bottom:8px;font-family:var(--mono)">'+pend.length+' pacote(s) que NÃO serão despachados:</div>'+
    pend.map(function(p){return '<div style="font-size:11px;font-family:var(--mono);color:var(--tm);padding:4px 0;border-bottom:1px solid var(--b1)">• '+p.numero+(p.nf?' · NF '+p.nf:'')+(p.numLoja?' · 🛒'+p.numLoja:'')+'<br><span style="color:var(--th);font-size:10px">'+p.destinatario+'</span></div>';}).join('');
  document.getElementById('motivoArea').scrollIntoView({behavior:'smooth',block:'start'});
}

function confirmarEncerrarParcial(){
  var motivo=document.getElementById('motivoText').value.trim();
  if(!motivo){
    document.getElementById('motivoAlert').style.display='block';
    document.getElementById('motivoText').focus();
    return;
  }
  // Guarda motivo e abre o painel de confirmação (fotos + obs)
  encerrandoParcial=true; // permite finalizar mesmo com pendentes
  document.getElementById('motivoArea').classList.remove('show');
  document.getElementById('encerrarBtn').classList.remove('show');
  // Coloca o motivo já preenchido no campo de obs do lote
  document.getElementById('confirmArea').classList.add('show');
  var pend=getPkgsAtivos().filter(function(p){return p.status==='pendente'&&colSession.indexOf(p.etiqueta)===-1;});
  document.getElementById('confirmText').innerHTML=
    '<b style="color:var(--am)">⚠ Encerramento parcial</b><br>'+
    '<span style="color:var(--gr)">'+colSession.length+' bipados</span> · '+
    '<span style="color:var(--am)">'+pend.length+' pendentes (não despachados)</span><br>'+
    '<span style="color:var(--tm);font-size:12px">Tire as fotos do veículo e finalize.</span>';
  document.getElementById('fotoAlert').style.display='none';
  document.getElementById('obsLote').value='MOTIVO ENCERRAMENTO PARCIAL: '+motivo;
  renderFotosVeiculo();
  renderProblemaList();
  renderProblemaSelect();
  // Só reseta fotos se ainda não começou a tirar
  if(fotosVeiculo.length === 0){
    document.getElementById('btnFotoVeiculo').className='foto-btn';
    document.getElementById('btnFotoVeiculo').textContent='📷 Tirar foto (0/3)';
    problemaPkgs=[];
  }
  document.getElementById('confirmArea').scrollIntoView({behavior:'smooth',block:'start'});
}

function voltarDoEncerrar(){
  document.getElementById('motivoArea').classList.remove('show');
  document.getElementById('confirmArea').classList.remove('show');
  document.getElementById('encerrarBtn').classList.add('show');
  encerrandoParcial=false;
}

// ═══ FINALIZAR ═══
function finalizeColeta(){
  if(!activeMkt||colSession.length===0) return;
  var pend=getPkgsAtivos().filter(function(p){
    return p.status==='pendente'&&colSession.indexOf(p.etiqueta)===-1&&problemaPkgs.indexOf(p.etiqueta)===-1;
  });
  // Só bloqueia se NÃO for encerramento parcial (com motivo já informado)
  if(pend.length>0&&!encerrandoParcial){
    document.getElementById('missingArea').classList.add('show');
    document.getElementById('missingList').innerHTML=pend.map(function(p){return '<div class="missing-item">⚠ '+p.numero+(p.nf?' · NF '+p.nf:'')+(p.numLoja?' · 🛒'+p.numLoja:'')+'<br><span style="font-size:10px;color:#F09090">'+p.destinatario+'</span></div>';}).join('');
    document.getElementById('confirmArea').classList.remove('show');
    toast(pend.length+' pacote(s) faltando!','err'); beepError(); return;
  }
  if(fotosVeiculo.length<3){
    document.getElementById('fotoAlert').style.display='block';
    document.getElementById('fotoAlert').textContent='⚠ Faltam '+(3-fotosVeiculo.length)+' foto(s) do veículo.';
    document.getElementById('btnFotoVeiculo').scrollIntoView({behavior:'smooth',block:'center'});
    toast('Tire mais '+(3-fotosVeiculo.length)+' foto(s) do veículo!','err'); beepError(); return;
  }
  var loteDate = todayStr();
var now=nowTS();
var obs=document.getElementById('obsLote').value.trim();
  colSession.forEach(function(chave){
    if(problemaPkgs.indexOf(chave)!==-1) return;
    for(var i=0;i<packages.length;i++){
      if(packages[i].etiqueta===chave&&packages[i].date===todayStr()){
        packages[i].status='coletado'; packages[i].colT=now; if(obs) packages[i].obs=obs; break;
      }
    }
  });
  problemaPkgs.forEach(function(chave){
    for(var i=0;i<packages.length;i++){
      if(packages[i].etiqueta===chave&&packages[i].date===todayStr()){
        packages[i].status='problema'; packages[i].colT=now; packages[i].obs=obs||'Problema na coleta'; break;
      }
    }
  });
  sv('expv5_pkgs',packages);
  var loteId='lote_'+activeMkt+'_'+Date.now();
  var qtdEntregues=colSession.length-problemaPkgs.filter(function(e){return colSession.indexOf(e)!==-1;}).length;
  // Marca loteId em cada scan da sessão para associação correta no histórico
  colSession.forEach(function(chave){
  for(var i=0;i<scans.length;i++){
    if(
      scans[i].etiqueta===chave &&
      scans[i].date===loteDate &&
      scans[i].tipo!=='lote' &&
      scans[i].mkt===activeMkt
    ){
      scans[i].loteId = loteId;
    }
  }
});
scans.unshift({tipo:'lote',id:loteId,mkt:activeMkt,date:loteDate,time:now,qtd:qtdEntregues,problemas:problemaPkgs.length,obs:obs,fotosVeiculo:fotosVeiculo.slice()});
  sv('expv5_scans',scans);
  sv('expv5_scans',scans); // salva loteId nos scans antes de sync
  syncToServer();
  // Upload das fotos do veículo para o servidor
  uploadLotePhotos(loteId, fotosVeiculo);
  // Atualiza Bling com delay para evitar rate limit (1100ms entre cada)
  var toUpdate=colSession.filter(function(c){return problemaPkgs.indexOf(c)===-1;});
  var blingIds=[];
  toUpdate.forEach(function(chave){
    for(var i=0;i<packages.length;i++){
      if(packages[i].etiqueta===chave&&packages[i].date===todayStr()){
        blingIds.push(packages[i].blingId); break;
      }
    }
  });
  blingIds.forEach(function(id,idx){
    setTimeout(function(){updateBlingStatus(id);},idx*1200);
  });
  var mktInfo=MKT[activeMkt]||{n:activeMkt};
  var msgFinal=mktInfo.n+': '+qtdEntregues+' entregues'+(problemaPkgs.length>0?', '+problemaPkgs.length+' problema(s)':'')+' ✓';
  toast(msgFinal,'ok');
  beepSuccess();
  // Sincroniza imediatamente para outros dispositivos verem o histórico
  syncToServer();
  closeColeta(); renderMktGrid(); updateBadge();
}
function updateBlingStatus(id){
  // Bling v3: PATCH /pedidos/vendas/{id}/situacoes/{idSituacao} sem body
  apiFetch('/bling/pedidos/vendas/'+id+'/situacoes/743515',{method:'PATCH'})
  .then(function(r){
    if(r.ok){
      console.log('✅ DESPACHADO: #'+id);
    } else {
      return r.text().then(function(txt){
        console.warn('⚠ Falha PATCH blingId='+id+' status='+r.status+' resp='+txt.substring(0,100));
        // Retry após 3s
        setTimeout(function(){
          apiFetch('/bling/pedidos/vendas/'+id+'/situacoes/743515',{method:'PATCH',headers:{'Content-Type':'application/json'},body:body})
          .then(function(r2){console.log(r2.ok?'✅ Retry OK #'+id:'❌ Retry falhou #'+id+': '+r2.status);})
          .catch(function(){});
        },3000);
      });
    }
  })
  .catch(function(e){console.error('❌ updateBlingStatus erro:',e.message);});
}

// ═══ DIA ═══
function diaPkgRow(p){
  var statusColor=p.status==='coletado'?'var(--gr)':p.status==='problema'?'var(--rd)':'var(--am)';
  var colT=p.colT?'<span class="dia-pkg-time">'+p.colT+'</span>':'';
  return '<div class="dia-pkg-row">'+
    '<div class="dia-pkg-status" style="background:'+statusColor+'"></div>'+
    '<div class="dia-pkg-info">'+
      '<div class="dia-pkg-num">'+p.numero+
        (p.nf?'<span class="dia-pkg-nf"> · NF '+p.nf+'</span>':'')+
        (p.numLoja?'<span style="font-size:10px;font-family:var(--mono);color:var(--bl)"> · 🛒'+p.numLoja+'</span>':'')+
      '</div>'+
      '<div class="dia-pkg-dest">'+p.destinatario+'</div>'+
    '</div>'+
    colT+
  '</div>';
}

function diaToggle(id){
  var el=document.getElementById(id);
  var btn=document.getElementById('btn_'+id);
  if(!el) return;
  var open=el.style.display!=='none';
  el.style.display=open?'none':'block';
  btn.querySelector('.dia-arrow').textContent=open?'▶':'▼';
}

function getDiaDate(){
  return diaSelectedDate || todayStr();
}

function diaNavDate(dir){
  var cur=getDiaDate();
  var d=new Date(cur+'T12:00:00');
  d.setDate(d.getDate()+dir);
  var newDate=d.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  var today=todayStr();
  // Não avança além de hoje
  if(newDate>today) return;
  diaSelectedDate=newDate===today?'':newDate;
  updateDiaLabel();
  renderDia();
}

function updateDiaLabel(){
  var today=todayStr();
  var date=getDiaDate();
  var label;
  if(date===today) label='Hoje';
  else{
    var d=new Date(date+'T12:00:00');
    var days=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    label=days[d.getDay()]+' '+d.getDate()+'/'+String(d.getMonth()+1).padStart(2,'0');
  }
  var lbl=document.getElementById('diaDateLabel');
  if(lbl) lbl.textContent='📅 '+label;
  // Oculta botão ">" quando está em hoje
  var btnNext=document.getElementById('diaBtnNext');
  if(btnNext) btnNext.style.opacity=date===today?'0.3':'1';
}

function renderDia(){
  var diaDate=getDiaDate();
  var today=packages.filter(function(p){return p.date===diaDate;});
  var isToday=diaDate===todayStr();
  var col=today.filter(function(p){return p.status==='coletado';}).length;
  var prob=today.filter(function(p){return p.status==='problema';}).length;
  var pend=today.length-col-prob;
  // Atualiza título
  document.getElementById('diaTitulo').textContent=isToday?'Resumo do Dia':'Histórico — '+diaDate;
  updateDiaLabel();
  document.getElementById('dayCards').innerHTML=
    '<div class="day-card"><div class="day-lbl">Total</div><div class="day-val">'+today.length+'</div></div>'+
    '<div class="day-card"><div class="day-lbl">Expedidos</div><div class="day-val" style="color:var(--gr)">'+col+'</div></div>'+
    '<div class="day-card"><div class="day-lbl">Pendentes</div><div class="day-val" style="color:var(--am)">'+pend+'</div></div>'+
    '<div class="day-card"><div class="day-lbl">Problemas</div><div class="day-val" style="color:var(--rd)">'+prob+'</div></div>';

  // Separa FLEX dos outros (urgentes do ML ficam no card FLEX)
  var flexPkgsDia=today.filter(function(p){return p.urgente;});
  var mkts=[];
  today.forEach(function(p){
    if(p.urgente) return; // FLEX vai em seção própria
    if(mkts.indexOf(p.mkt)===-1) mkts.push(p.mkt);
  });

  var diaHtml='';

  // Card FLEX separado (se tiver)
  if(flexPkgsDia.length>0){
    var fCol=flexPkgsDia.filter(function(p){return p.status==='coletado';});
    var fPend=flexPkgsDia.filter(function(p){return p.status==='pendente';});
    var fProb=flexPkgsDia.filter(function(p){return p.status==='problema';});
    var fPct=flexPkgsDia.length?Math.round(fCol.length/flexPkgsDia.length*100):0;
    var fUid='dia_mkt_flex';
    diaHtml+='<div class="dia-section-box" style="border-color:var(--rd3)">';
    diaHtml+='<button class="dia-toggle" id="btn_'+fUid+'" data-uid="'+fUid+'" onclick="diaToggle(this.dataset.uid)">';
    diaHtml+='<div style="display:flex;align-items:center;gap:8px">';
    diaHtml+='<span class="mkt-chip c-rd">⚡ FLEX</span>';
    diaHtml+='<span style="font-family:var(--mono);font-size:11px;color:var(--tm)">'+
      '<span style="color:var(--gr)">'+fCol.length+' exp.</span> · '+
      '<span style="color:var(--am)">'+fPend.length+' pend.</span>'+
      (fProb.length>0?' · <span style="color:var(--rd)">'+fProb.length+' prob.</span>':'')+
    '</span></div>';
    diaHtml+='<span style="color:var(--tm);font-size:12px"><span class="dia-arrow">▶</span> '+fPct+'%</span>';
    diaHtml+='</button>';
    diaHtml+='<div class="prog-bar-wrap" style="margin:8px 0 0"><div class="prog-bar" style="width:'+fPct+'%;background:var(--rd)"></div></div>';
    diaHtml+='<div id="'+fUid+'" style="display:none;margin-top:10px">';
    if(fCol.length>0){diaHtml+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gr);margin-bottom:4px">✓ Expedidos ('+fCol.length+')</div>';diaHtml+=fCol.map(diaPkgRow).join('');}
    if(fPend.length>0){diaHtml+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--am);margin:'+(fCol.length>0?'10':'0')+'px 0 4px">⏳ Pendentes ('+fPend.length+')</div>';diaHtml+=fPend.map(diaPkgRow).join('');}
    if(fProb.length>0){diaHtml+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--rd);margin:10px 0 4px">🚫 Problemas ('+fProb.length+')</div>';diaHtml+=fProb.map(diaPkgRow).join('');}
    diaHtml+='</div></div>';
  }

  document.getElementById('dayByMkt').innerHTML=diaHtml+mkts.map(function(m){
    var mp=today.filter(function(p){return p.mkt===m&&!p.urgente;});
    if(mp.length===0) return '';
    var mc=mp.filter(function(p){return p.status==='coletado';});
    var mpb=mp.filter(function(p){return p.status==='problema';});
    var mpp=mp.filter(function(p){return p.status==='pendente';});
    var pct=mp.length?Math.round(mc.length/mp.length*100):0;
    var info=MKT[m]||{cls:'c-outro',icon:'📦',n:m};
    var uid='dia_mkt_'+m;
    var html='<div class="dia-section-box">';
    // Cabeçalho clicável
    html+='<button class="dia-toggle" id="btn_'+uid+'" data-uid="'+uid+'" onclick="diaToggle(this.dataset.uid)">';
    html+='<div style="display:flex;align-items:center;gap:8px">';
    html+='<span class="mkt-chip '+info.cls+'">'+info.icon+' '+info.n+'</span>';
    html+='<span style="font-family:var(--mono);font-size:11px;color:var(--tm)">'+
      '<span style="color:var(--gr)">'+mc.length+' exp.</span> · '+
      '<span style="color:var(--am)">'+mpp.length+' pend.</span>'+
      (mpb.length>0?' · <span style="color:var(--rd)">'+mpb.length+' prob.</span>':'')+
    '</span></div>';
    html+='<span style="color:var(--tm);font-size:12px"><span class="dia-arrow">▶</span> '+pct+'%</span>';
    html+='</button>';
    // Barra de progresso
    html+='<div class="prog-bar-wrap" style="margin:8px 0 0"><div class="prog-bar" style="width:'+pct+'%"></div></div>';
    // Lista de pedidos (colapsada por padrão)
    html+='<div id="'+uid+'" style="display:none;margin-top:10px">';
    // Expedidos
    if(mc.length>0){
      html+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--gr);margin-bottom:4px">✓ Expedidos ('+mc.length+')</div>';
      html+=mc.map(diaPkgRow).join('');
    }
    // Pendentes
    if(mpp.length>0){
      html+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--am);margin:'+(mc.length>0?'10':'0')+'px 0 4px">⏳ Pendentes ('+mpp.length+')</div>';
      html+=mpp.map(diaPkgRow).join('');
    }
    // Problemas
    if(mpb.length>0){
      html+='<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--rd);margin:10px 0 4px">🚫 Problemas ('+mpb.length+')</div>';
      html+=mpb.map(diaPkgRow).join('');
    }
    html+='</div></div>';
    return html;
  }).join('');
  // Lotes
  var lotes=scans.filter(function(s){return s.tipo==='lote'&&s.date===diaDate;});
  if(lotes.length>0){
    var html='<div class="dia-section-lbl">Lotes fechados hoje</div>';
    lotes.forEach(function(l){
      var info=MKT[l.mkt]||{icon:'📦',n:l.mkt};
      html+='<div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:12px;margin-bottom:10px">';
      html+='<div style="display:flex;justify-content:space-between;margin-bottom:6px">';
      html+='<span style="font-size:12px;font-weight:600">'+info.icon+' '+info.n+'</span>';
      html+='<span style="font-size:11px;color:var(--tm)">'+l.time+'</span></div>';
      html+='<div style="font-size:11px;font-family:var(--mono);color:var(--tm);margin-bottom:'+(l.obs?'6':'0')+'px">✓ '+l.qtd+' entregues'+(l.problemas>0?' · 🚫 '+l.problemas+' prob.':'')+'</div>';
      if(l.obs) html+='<div style="font-size:11px;color:var(--am);background:var(--am2);border-radius:6px;padding:6px 8px;margin-bottom:6px">📝 '+l.obs+'</div>';
      if(l.fotosVeiculo&&l.fotosVeiculo.length>0){
        html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
        l.fotosVeiculo.forEach(function(f,idx){
          html+='<img src="'+f+'" style="width:60px;height:60px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--b2)" onclick="verFotoLote(\''+l.id+'\','+idx+')" alt="foto">';
        });
        html+='</div>';
      }
      html+='</div>';
    });
    document.getElementById('dayLotes').innerHTML=html;
  } else {
    document.getElementById('dayLotes').innerHTML='';
  }
}
function toggleHistLote(id, el){
  var body = document.getElementById(id);
  if(!body) return;

  var abrir = body.style.display === 'none' || body.style.display === '';

  body.style.display = abrir ? 'block' : 'none';
  histLoteAberto = abrir ? id : '';

  var arrow = el ? el.querySelector('.lote-arrow') : null;
  if(arrow) arrow.textContent = abrir ? '▲' : '▼';
}

function toggleLotePkgs(loteId, headerEl){
  var el=document.getElementById('lote-pkgs-'+loteId);
  if(!el) return;
  var visible=el.style.display!=='none';
  el.style.display=visible?'none':'block';
}

function verFotoLote(loteId,idx){
  idx=parseInt(idx)||0;
  var lote=null;
  for(var i=0;i<scans.length;i++){if(scans[i].id===loteId){lote=scans[i];break;}}

  // Tenta foto local primeiro
  var localFoto=lote&&lote.fotosVeiculo&&lote.fotosVeiculo[idx];
  if(localFoto){
    _showLotePhotoModal(localFoto);
    return;
  }

  // Busca no servidor (Supabase)
  apiFetch('/photos/lote/'+encodeURIComponent(loteId)+'/'+idx)
  .then(function(r){return r.ok?r.json():null;})
  .then(function(d){
    if(d&&d.url&&d.url.startsWith('http')){
      // Testa se a URL realmente existe no Supabase antes de abrir
      var img=new Image();
      img.onload=function(){_showLotePhotoModal(d.url);};
      img.onerror=function(){_showLoteMsgNaoDisp();};
      img.src=d.url;
    } else if(d&&d.photo){
      _showLotePhotoModal(d.photo);
    } else {
      _showLoteMsgNaoDisp();
    }
  })
  .catch(function(){
    openModal('<div class="modal-img-wrap" style="text-align:center;padding:24px"><div style="font-size:52px">🚛</div><div style="color:var(--tm);font-size:13px;margin-top:12px">Erro ao carregar foto</div><button class="modal-close" onclick="closeTopModal()">✕</button></div><button class="modal-back" onclick="closeTopModal()">← Fechar</button>');
  });
}

function _showLoteMsgNaoDisp(){
  openModal('<div class="modal-img-wrap" style="text-align:center;padding:28px 20px">'+
    '<div style="font-size:52px;margin-bottom:14px">🚛</div>'+
    '<div style="color:var(--tx);font-size:15px;font-weight:700;margin-bottom:10px">Foto não disponível</div>'+
    '<div style="color:var(--tm);font-size:12px;line-height:1.9">'+
      'Fotos tiradas antes de 02/04/2026<br>não foram enviadas ao servidor.<br><br>'+
      '📱 Veja pelo celular da expedição<br>ou tire novas fotos no próximo lote.'+
    '</div>'+
    '<button class="modal-close" onclick="closeTopModal()">✕</button>'+
    '</div>'+
    '<button class="modal-back" onclick="closeTopModal()">← Fechar</button>');
}

function _showLotePhotoModal(src){
  openModal('<div class="modal-img-wrap">'+
    '<img src="'+src+'" alt="foto veículo" style="max-width:100%;max-height:82vh;border-radius:8px;display:block">'+
    '<button class="modal-close" onclick="closeTopModal()">✕</button>'+
    '</div>'+
    '<button class="modal-back" onclick="closeTopModal()">← Voltar</button>');
}

// ═══ HISTÓRICO ═══
// ═══ CALENDÁRIO PICKER ═══
var calState={month:0,year:0}; // mês/ano atual do cal visível

function buildCal(containerId, selectedDate, onSelect, datesWithData){
  var today=todayStr();
  var sel=selectedDate||today;
  var d=new Date(sel+'T12:00:00');
  if(!calState.month){calState.month=d.getMonth();calState.year=d.getFullYear();}
  var m=calState.month, y=calState.year;
  var meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var dias=['D','S','T','Q','Q','S','S'];
  var firstDay=new Date(y,m,1).getDay();
  var daysInMonth=new Date(y,m+1,0).getDate();
  var html='<div class="cal-header">';
  html+='<button class="cal-nav" data-dir="-1" data-cid="'+containerId+'" data-os="'+onSelect+'" onclick="calNav(Number(this.dataset.dir),this.dataset.cid,this.dataset.os)">‹</button>';
  html+='<span class="cal-title">'+meses[m]+' '+y+'</span>';
  var todayD=new Date(today+'T12:00:00');
  var isCurrentMonthYear=(y===todayD.getFullYear()&&m===todayD.getMonth());
  html+='<button class="cal-nav" '+(isCurrentMonthYear?'style="opacity:.3" disabled':'')+' data-dir="1" data-cid="'+containerId+'" data-os="'+onSelect+'" onclick="calNav(Number(this.dataset.dir),this.dataset.cid,this.dataset.os)">›</button>';
  html+='</div>';
  html+='<div class="cal-grid">';
  dias.forEach(function(d){html+='<div class="cal-dow">'+d+'</div>';});
  for(var i=0;i<firstDay;i++) html+='<div class="cal-day empty"></div>';
  for(var day=1;day<=daysInMonth;day++){
    var dateStr=y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    var isSel=dateStr===sel;
    var isToday2=dateStr===today;
    var isFuture=dateStr>today;
    var hasData=datesWithData&&datesWithData.indexOf(dateStr)!==-1;
    var cls='cal-day'+(isSel?' selected':isToday2?' today':'')+(isFuture?' future':'')+(hasData?' has-data':'');
    html+='<div class="'+cls+'" data-date="'+dateStr+'" data-cid="'+containerId+'" data-os="'+onSelect+'" onclick="calSelect(this.dataset.date,this.dataset.cid,this.dataset.os)">'+day+'</div>';
  }
  html+='</div>';
  html+='<div style="text-align:center;margin-top:8px"><button data-date="'+today+'" data-cid="'+containerId+'" data-os="'+onSelect+'" onclick="calSelect(this.dataset.date,this.dataset.cid,this.dataset.os)" style="font-size:11px;color:var(--bl);background:none;border:none;cursor:pointer;font-family:var(--sans)">Hoje</button></div>';
  document.getElementById(containerId).innerHTML=html;
}

function calNav(dir, containerId, onSelect){
  calState.month+=dir;
  if(calState.month>11){calState.month=0;calState.year++;}
  if(calState.month<0){calState.month=11;calState.year--;}
  var selDate=containerId==='calDia'?getDiaDate():(histFilterDate||todayStr());
  var datas=getDatasComDados();
  buildCal(containerId,selDate,onSelect,datas);
}

function calSelect(date, containerId, onSelect){
  calState.month=0;calState.year=0; // reseta estado do cal
  document.getElementById(containerId).style.display='none';
  window[onSelect](date);
}

function getDatasComDados(){
  var datas=[];
  scans.forEach(function(s){if(s.date&&datas.indexOf(s.date)===-1)datas.push(s.date);});
  packages.forEach(function(p){if(p.date&&(p.status==='coletado'||p.status==='problema')&&datas.indexOf(p.date)===-1)datas.push(p.date);});
  return datas;
}

function toggleCalDia(){
  var cal=document.getElementById('calDia');
  var isOpen=cal.style.display!=='none';
  // Fecha outros calendários
  document.getElementById('calHist').style.display='none';
  if(isOpen){cal.style.display='none';return;}
  calState.month=0;calState.year=0;
  buildCal('calDia',getDiaDate(),'onCalDiaSelect',getDatasComDados());
  cal.style.display='block';
}

function onCalDiaSelect(date){
  var today=todayStr();
  diaSelectedDate=date===today?'':date;
  updateDiaLabel();
  renderDia();
}

function toggleCalHist(){
  var cal=document.getElementById('calHist');
  var isOpen=cal.style.display!=='none';
  document.getElementById('calDia').style.display='none';
  if(isOpen){cal.style.display='none';return;}
  calState.month=0;calState.year=0;
  buildCal('calHist',histFilterDate||todayStr(),'onCalHistSelect',getDatasComDados());
  cal.style.display='block';
}

function onCalHistSelect(date){
  histFilterDate=date;
  // Atualiza chip de data ativo
  var chips=document.getElementById('filterDateRow').querySelectorAll('.filter-chip');
  chips.forEach(function(c){c.className='filter-chip'+(c.dataset.d===date?' on':'');});
  renderHistContent();
}

// Fecha calendários ao clicar fora
document.addEventListener('click',function(e){
  ['calDia','calHist'].forEach(function(id){
    var cal=document.getElementById(id);
    if(!cal) return;
    var btn=cal.previousElementSibling;
    if(!cal.contains(e.target)&&(!btn||!btn.contains(e.target))){
      cal.style.display='none';
    }
  });
});

// Extrai string de tracking de qualquer valor (string, número, ou objeto aninhado)
function extractTrackStr(v, depth){
  depth=depth||0;
  if(depth>4||v===null||v===undefined) return '';
  if(typeof v==='string'){
    var s=v.trim();
    // Aceita códigos alfanuméricos de 6+ caracteres (tracking ML, Shopee, etc.)
    return (s.length>=6&&!/object/i.test(s))?s:'';
  }
  if(typeof v==='number') return String(v).length>=6?String(v):'';
  if(Array.isArray(v)){
    for(var ai=0;ai<v.length;ai++){var ar=extractTrackStr(v[ai],depth+1);if(ar)return ar;}
    return '';
  }
  if(typeof v==='object'){
    // Tenta campos prioritários primeiro
    var prio=['numeracao','numero','codigoRastreio','codigoRastreamento','tracking','rastreio','etiqueta'];
    for(var pi=0;pi<prio.length;pi++){
      if(v[prio[pi]]!==undefined){var pr=extractTrackStr(v[prio[pi]],depth+1);if(pr)return pr;}
    }
    // Depois todos os outros campos
    var ks=Object.keys(v);
    for(var ki=0;ki<ks.length;ki++){
      if(prio.indexOf(ks[ki])===-1){var kr=extractTrackStr(v[ks[ki]],depth+1);if(kr)return kr;}
    }
  }
  return '';
}

function formatDate(dateStr){
  if(!dateStr) return '';
  var today=todayStr();
  var d1=new Date(); d1.setDate(d1.getDate()-1);
  var ontem=d1.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  if(dateStr===today) return 'Hoje';
  if(dateStr===ontem) return 'Ontem';
  // Formata como DD/MM
  var parts=dateStr.split('-');
  if(parts.length===3) return parts[2]+'/'+parts[1]+'/'+parts[0];
  return dateStr;
}

function highlight(text, q){
  if(!q||!text) return String(text||'');
  var re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return String(text).replace(re,'<span class="hist-highlight">$1</span>');
}

function renderHistorico(){
  var today=todayStr();
  // Coleta todas as datas com scans OU pacotes
  var datas=[];
  scans.forEach(function(s){if(s.date&&datas.indexOf(s.date)===-1) datas.push(s.date);});
  packages.forEach(function(p){if(p.date&&(p.status==='coletado'||p.status==='problema')&&datas.indexOf(p.date)===-1) datas.push(p.date);});
  datas.sort(function(a,b){return b>a?1:b<a?-1:0;});
  if(datas.indexOf(today)===-1) datas.unshift(today);
  datas=datas.slice(0,30); // últimos 30 dias com registros

  // Chips de data — "Hoje", "Ontem", depois datas
  var ontem=new Date(); ontem.setDate(ontem.getDate()-1);
  var ontemStr=ontem.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  document.getElementById('filterDateRow').innerHTML=datas.map(function(d){
    var label=d===today?'Hoje':d===ontemStr?'Ontem':d.slice(5); // MM-DD
    var on=histFilterDate===d||(!histFilterDate&&d===today);
    if(on&&!histFilterDate) histFilterDate=today;
    return '<button class="filter-chip'+(on?' on':'')+'" data-d="'+d+'" onclick="setHistDate(this.dataset.d)">'+label+'</button>';
  }).join('');

  // Chips de marketplace — gerado dos scans reais da data selecionada
  var mktsReais=['todos'];
  scans.forEach(function(s){
    if(s.tipo==='lote') return;
    var m=s.mkt||'outro';
    if(mktsReais.indexOf(m)===-1) mktsReais.push(m);
  });
  // Também adiciona FLEX se houver scans urgentes
  var temFlex=scans.some(function(s){return s.tipo!=='lote'&&s.mkt==='flex';});
  if(!temFlex&&mktsReais.indexOf('flex')===-1){
    // Verifica nos packages coletados se há urgentes
    packages.forEach(function(p){
      if(p.urgente&&(p.status==='coletado'||p.status==='problema')&&mktsReais.indexOf('flex')===-1){
        mktsReais.push('flex');
      }
    });
  }
  document.getElementById('filterMktRow').innerHTML=mktsReais.map(function(m){
    var on=(!histFilterMkt&&m==='todos')||(histFilterMkt===m);
    var info=MKT[m]||{icon:'📦',n:m};
    var label=m==='todos'?'Todos':info.icon+' '+info.n;
    return '<button class="filter-chip'+(on?' on-am':'')+'" data-m="'+m+'" onclick="setHistMkt(this.dataset.m)">'+label+'</button>';
  }).join('');

  renderHistContent();
}

function setHistDate(d){
  histFilterDate=d;
  // Atualiza chips
  var chips=document.getElementById('filterDateRow').querySelectorAll('.filter-chip');
  chips.forEach(function(c){c.className='filter-chip'+(c.dataset.d===d?' on':'');});
  renderHistContent();
}

function setHistMkt(m){
  histFilterMkt=m==='todos'?'':m;
  var chips=document.getElementById('filterMktRow').querySelectorAll('.filter-chip');
  chips.forEach(function(c){c.className='filter-chip'+(c.dataset.m===m?' on-am':'');});
  renderHistContent();
}

function renderHistContent(){
  var date=histFilterDate||todayStr();
  var q=(document.getElementById('histSearch')||{}).value;
  q=q?q.trim().toUpperCase():'';

  // Lotes do dia filtrado
  var lotes=scans.filter(function(s){
    return s.tipo==='lote'&&s.date===date&&(!histFilterMkt||s.mkt===histFilterMkt);
  });
  lotes.sort(function(a,b){
    var ta=a.time||''; var tb=b.time||'';
    return tb>ta?1:tb<ta?-1:0;
  });
  // Scans individuais do dia filtrado
  var pkgScans=scans.filter(function(s){
    if(s.tipo==='lote'||s.date!==date) return false;
    if(!histFilterMkt) return true;
    return s.mkt===histFilterMkt;
  });
  // Mais recente primeiro
  pkgScans.sort(function(a,b){
    var ta=a.time||''; var tb=b.time||'';
    return tb>ta?1:tb<ta?-1:0;
  });

  // Filtro de busca textual
  if(q){
    pkgScans=pkgScans.filter(function(s){
      var pkg=null;
      for(var k=0;k<packages.length;k++){if(packages[k].etiqueta===s.etiqueta){pkg=packages[k];break;}}
      var campos=[s.numero,s.etiqueta,s.destinatario,pkg&&pkg.nf,pkg&&pkg.numLoja,pkg&&pkg.numeracao].join(' ').toUpperCase();
      return campos.indexOf(q)!==-1;
    });
  }

  // ── TOTALIZADOR ──────────────────────────────────────────────────────────
  var totalExp=pkgScans.length;
  var totalLotes=lotes.length;
  // Conta por marketplace
  var mktCount={};
  pkgScans.forEach(function(s){
    var m=s.mkt||(s.urgente?'flex':'outro');
    mktCount[m]=(mktCount[m]||0)+1;
  });
  var statsHtml='';
  if(totalLotes>0||totalExp>0){
    statsHtml+='<div class="hist-stat-card"><div class="hist-stat-val" style="color:var(--gr)">'+totalExp+'</div><div class="hist-stat-lbl">Bipados</div></div>';
    statsHtml+='<div class="hist-stat-card"><div class="hist-stat-val" style="color:var(--bl)">'+totalLotes+'</div><div class="hist-stat-lbl">Lotes</div></div>';
    Object.keys(mktCount).forEach(function(m){
      var info=MKT[m]||{icon:'📦',n:m};
      statsHtml+='<div class="hist-stat-card"><div class="hist-stat-val">'+mktCount[m]+'</div><div class="hist-stat-lbl">'+info.icon+' '+info.n+'</div></div>';
    });
  }
  document.getElementById('histStats').innerHTML=statsHtml;

  var html='';

  if(lotes.length===0&&pkgScans.length===0){
    html='<div class="hist-empty">'+(q?'Nenhum resultado para "'+q+'"':'Nenhum registro para este filtro')+'</div>';
    document.getElementById('histContent').innerHTML=html;
    return;
  }

  // ── Associa cada scan ao seu lote por mkt + ordem temporal ───────────────
  function getScansDaLote(lote, todosPkgScans, lotesOrdenados){
    // Primeiro tenta por loteId
    var porId=todosPkgScans.filter(function(s){return s.loteId===lote.id;});
    if(porId.length>0) return porId;
    // Fallback: usa janela de tempo — scans do mesmo mkt entre lote anterior e este lote
    var idxLote=lotesOrdenados.indexOf(lote);
    var lotePrev=lotesOrdenados[idxLote+1]; // lotes estão do mais recente pro mais antigo
    var tsLote=lote.time||'99:99';
    var tsPrev=lotePrev?lotePrev.time:'00:00';
    return todosPkgScans.filter(function(s){
      if(s.mkt!==lote.mkt&&!(lote.mkt==='flex'&&s.urgente)) return false;
      var ts=s.time||'';
      return ts<=tsLote&&ts>tsPrev;
    });
  }

  // Busca com scan individual mostra pacotes + lote referente
  if(q){
    html+='<div style="font-size:11px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--tm);margin-bottom:8px">Resultados ('+pkgScans.length+')</div>';
    html+='<div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:10px 14px">';
    pkgScans.forEach(function(s){
      var mktInfo=MKT[s.mkt]||{icon:'📦'};
      var pkg=null; for(var k=0;k<packages.length;k++){if(packages[k].etiqueta===s.etiqueta){pkg=packages[k];break;}}
      var nf=pkg&&pkg.nf?pkg.nf:''; var numLoja=pkg&&pkg.numLoja?pkg.numLoja:''; var track=pkg&&pkg.numeracao?pkg.numeracao:'';
      var supaBase='https://wexikjzztxpfdbzjfnxl.supabase.co/storage/v1/object/public/expedicao/';
      var photoSrc=s.photo||(s.photoUrl?s.photoUrl:(supaBase+'scan_'+s.etiqueta+'_'+s.date));
      html+='<div class="hist-pkg">';
      html+='<img src="'+photoSrc+'" data-et="'+s.etiqueta+'" onclick="verFotoScan(this.dataset.et)" onerror="onScanImgError(this)" alt="etiqueta" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;cursor:pointer;border:1px solid var(--b2)">';
      html+='<div class="hist-pkg-info">';
      if(nf) html+='<div style="font-size:12px;font-weight:700;color:var(--gr);font-family:var(--mono)">'+highlight('NF '+nf,q)+'</div>';
      html+='<div class="hist-pkg-num">'+mktInfo.icon+' '+highlight(s.numero,q)+'</div>';
      html+='<div class="hist-pkg-dest">'+highlight(s.destinatario,q)+'</div>';
      if(track) html+='<div style="font-size:10px;font-family:var(--mono);color:var(--tm)">📦 '+highlight(track,q)+'</div>';
      html+='<div style="font-size:10px;color:var(--th);margin-top:2px">'+s.time+'</div>';
      html+='</div></div>';
    });
    html+='</div>';
  } else {
    // ── LOTES como cards colapsáveis ─────────────────────────────────────
    if(lotes.length>0){
      lotes.forEach(function(l){
        var info=MKT[l.mkt]||{icon:'📦',n:l.mkt};
        var supaBase='https://wexikjzztxpfdbzjfnxl.supabase.co/storage/v1/object/public/expedicao/';
        var nFotos=(l.fotosVeiculo&&l.fotosVeiculo.length)||0;
        var lotePkgs=getScansDaLote(l,pkgScans,lotes);
        // Card do lote — clica para expandir
        html+='<div style="background:var(--s1);border:1.5px solid var(--b1);border-radius:var(--rl);margin-bottom:10px;overflow:hidden">';
        // Cabeçalho clicável
        html+='<div onclick="toggleHistLote(\'lh_'+l.id+'\',this)" style="padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">';
        html+='<div style="display:flex;align-items:center;gap:10px">';
        html+='<span style="font-size:22px">'+info.icon+'</span>';
        html+='<div>';
        html+='<div style="font-size:14px;font-weight:700">'+info.n+'</div>';
        html+='<div style="font-size:11px;color:var(--tm);font-family:var(--mono)">'+l.time+' · '+l.qtd+' entregues'+(l.problemas>0?' · 🚫 '+l.problemas+' prob.':'')+'</div>';
        html+='</div></div>';
        html+='<div style="display:flex;align-items:center;gap:8px">';
        html+='<span style="font-size:12px;color:var(--bl);font-family:var(--mono)">'+lotePkgs.length+' pedidos</span>';
        html+='<span class="lote-arrow" style="font-size:14px;color:var(--tm);transition:.2s">▼</span>';
        html+='</div></div>';
        // Corpo colapsável
        html+='<div id="lh_'+l.id+'" style="display:none;border-top:1px solid var(--b1);padding:12px 14px">';
        // Obs
        if(l.obs) html+='<div style="font-size:11px;color:var(--am);background:var(--am2);border-radius:6px;padding:6px 10px;margin-bottom:10px">📝 '+l.obs+'</div>';
        // Fotos do veículo
        html+='<div style="font-size:11px;color:var(--tm);font-family:var(--mono);margin-bottom:6px">📸 FOTOS DO VEÍCULO</div>';
        html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
        if(nFotos>0){
          l.fotosVeiculo.forEach(function(f,idx){
            html+='<img src="'+f+'" data-id="'+l.id+'" data-idx="'+idx+'" onclick="verFotoLote(this.dataset.id,this.dataset.idx)" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid var(--b2)">';
          });
        } else {
          for(var fi=0;fi<3;fi++){
            html+='<img src="'+supaBase+'lote_'+l.id+'_'+fi+'" data-id="'+l.id+'" data-idx="'+fi+'" onclick="verFotoLote(this.dataset.id,this.dataset.idx)" onerror="this.outerHTML=\'<div style=&quot;width:80px;height:80px;border-radius:8px;background:var(--s2);border:1px dashed var(--b2);display:flex;align-items:center;justify-content:center;font-size:20px&quot;>🚛</div>\'" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid var(--b2)">';
          }
        }
        html+='</div>';
        // Pacotes do lote
        if(lotePkgs.length>0){
          html+='<div style="font-size:11px;color:var(--tm);font-family:var(--mono);margin-bottom:6px">📦 PACOTES DESTE LOTE ('+lotePkgs.length+')</div>';
          lotePkgs.forEach(function(s){
            var pkg=null; for(var k=0;k<packages.length;k++){if(packages[k].etiqueta===s.etiqueta){pkg=packages[k];break;}}
            var nf=pkg&&pkg.nf?pkg.nf:''; var track=pkg&&pkg.numeracao?pkg.numeracao:'';
            var photoSrc=s.photo||(s.photoUrl?s.photoUrl:(supaBase+'scan_'+s.etiqueta+'_'+s.date));
            html+='<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--b1)">';
            html+='<img src="'+photoSrc+'" data-et="'+s.etiqueta+'" onclick="verFotoScan(this.dataset.et)" onerror="onScanImgError(this)" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;cursor:pointer;border:1px solid var(--b2)">';
            html+='<div style="flex:1;min-width:0">';
            if(nf) html+='<div style="font-size:11px;font-weight:700;color:var(--gr);font-family:var(--mono)">NF '+nf+'</div>';
            html+='<div style="font-size:13px;font-weight:700">'+s.numero+'</div>';
            html+='<div style="font-size:11px;color:var(--tm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+s.destinatario+'</div>';
            if(track) html+='<div style="font-size:10px;font-family:var(--mono);color:var(--bl)">📦 '+track+'</div>';
            html+='</div></div>';
          });
        } else {
          html+='<div style="font-size:11px;color:var(--tm);font-style:italic">Nenhum pacote registrado neste lote</div>';
        }
        html+='</div></div>';
      });
    } else if(pkgScans.length>0){
      // Sem lotes — mostra scans avulsos
      html+='<div style="font-size:11px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--tm);margin-bottom:8px">Bipados sem lote ('+pkgScans.length+')</div>';
      html+='<div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:10px 14px">';
      pkgScans.forEach(function(s){
        var mktInfo=MKT[s.mkt]||{icon:'📦'};
        var pkg=null; for(var k=0;k<packages.length;k++){if(packages[k].etiqueta===s.etiqueta){pkg=packages[k];break;}}
        var nf=pkg&&pkg.nf?'NF '+pkg.nf:''; var track=pkg&&pkg.numeracao?pkg.numeracao:'';
        var supaBase='https://wexikjzztxpfdbzjfnxl.supabase.co/storage/v1/object/public/expedicao/';
        var photoSrc=s.photo||(s.photoUrl?s.photoUrl:(supaBase+'scan_'+s.etiqueta+'_'+s.date));
        html+='<div class="hist-pkg">';
        html+='<img src="'+photoSrc+'" data-et="'+s.etiqueta+'" onclick="verFotoScan(this.dataset.et)" onerror="onScanImgError(this)" alt="etiqueta" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;cursor:pointer;border:1px solid var(--b2)">';
        html+='<div class="hist-pkg-info">';
        if(nf) html+='<div style="font-size:12px;font-weight:700;color:var(--gr);font-family:var(--mono)">'+nf+'</div>';
        html+='<div class="hist-pkg-num">'+mktInfo.icon+' '+s.numero+'</div>';
        html+='<div class="hist-pkg-dest">'+s.destinatario+'</div>';
        if(track) html+='<div style="font-size:10px;font-family:var(--mono);color:var(--tm)">📦 '+track+'</div>';
        html+='</div></div>';
      });
      html+='</div>';
    }
  }

document.getElementById('histContent').innerHTML=html;
}
// ═══ MODAL — fechar com botão Voltar Android ═══
function closeTopModal(){
  var modals=document.querySelectorAll('.modal-overlay');
  if(modals.length>0){
    modals[modals.length-1].remove();
    // Remove o estado de histórico que foi empurrado ao abrir
    if(history.state&&history.state.modal){
      history.back();
    }
    return true;
  }
  return false;
}

// Botão Voltar do Android — intercepta e mantém no site
window.addEventListener('popstate',function(e){
  // Se tem modal aberto, fecha o modal
  if(document.querySelector('.modal-overlay')){
    document.querySelector('.modal-overlay').remove();
    history.pushState({app:true},''); // re-empurra estado para continuar interceptando
    return;
  }
  // Se tem card de loja aberto, fecha o card
  if(activeMkt){
    closeColeta();
    history.pushState({app:true},'');
    return;
  }
  // Caso contrário, re-empurra estado para não sair do site
  history.pushState({app:true},'');
});

// Empurra estado inicial ao carregar para interceptar o primeiro "voltar"
(function(){
  if(window.history&&window.history.pushState){
    history.pushState({app:true},'');
  }
})();

function openModal(html){
  history.pushState({modal:true},'');
  var modal=document.createElement('div');
  modal.className='modal-overlay';
  modal.innerHTML=html;
  // Fecha ao clicar no overlay (não nos elementos internos)
  modal.addEventListener('click',function(e){
    if(e.target===modal) closeTopModal();
  });
  // Impede propagação de cliques internos (resolve problema no desktop)
  modal.addEventListener('click',function(e){
    if(e.target!==modal) e.stopPropagation();
  });
  document.body.appendChild(modal);
  return modal;
}

// ═══ NAV ═══
function showPage(page){
  document.getElementById('pageRomaneio').style.display=page==='romaneio'?'block':'none';
  document.getElementById('pageDia').style.display=page==='dia'?'block':'none';
  document.getElementById('pageHist').style.display=page==='historico'?'block':'none';
  document.getElementById('navRom').className='nav-btn'+(page==='romaneio'?' active':'');
  document.getElementById('navDia').className='nav-btn'+(page==='dia'?' active':'');
  document.getElementById('navHist').className='nav-btn'+(page==='historico'?' active':'');
  if(page==='dia'){
    if(!diaSelectedDate) updateDiaLabel();
    renderDia();
  }
  if(page==='historico'){
    // Busca dados atualizados do servidor antes de renderizar
    console.log('📂 Carregando histórico do servidor...');
    loadFromServer(function(){
      console.log('✅ Histórico carregado');
      renderHistorico();
    });
  }
  if(page==='romaneio'){
    // Auto-refresh: se passaram mais de 2 minutos desde a última busca, atualiza
    var mins2=2*60*1000;
    if(lastPullAt>0&&Date.now()-lastPullAt>mins2){
      var btn=document.getElementById('syncBtn');
      if(btn&&!btn.disabled) pullFromBling();
    }
  }
}
function updateBadge(){
  var n=todayPkgs().filter(function(p){return p.status==='pendente';}).length;
  var b=document.getElementById('nbRom');
  b.textContent=n; b.className='nav-badge'+(n>0?' show':'');
}
function flash(msg,type){toast(msg,type);}
function toast(msg,type){
  type=type||'ok';
  var a=document.getElementById('toasts');
  var t=document.createElement('div');
  t.className='toast t-'+type; t.textContent=msg;
  a.appendChild(t); setTimeout(function(){t.remove();},2800);
}
function exportCSV(){
  var diaDate=getDiaDate();
  var rows=[['Número','Marketplace','Destinatário','Serviço','Rastreio','Separado','Coletado','Status','Obs']];
  packages.filter(function(p){return p.date===diaDate;}).forEach(function(p){
    rows.push([p.numero,(MKT[p.mkt]||{n:p.mkt}).n,p.destinatario,p.servico,p.numeracao||'',p.pulledAt,p.colT||'',p.status,p.obs||'']);
  });
  var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  a.download='expedicao_'+getDiaDate()+'.csv'; a.click();
}
function clearDay(){
  if(!confirm('Limpar registros de hoje?')) return;
  packages=packages.filter(function(p){return p.date!==todayStr();});
  scans=scans.filter(function(s){return s.date!==todayStr();});
  sv('expv5_pkgs',packages); sv('expv5_scans',scans);
  renderMktGrid(); updateBadge(); renderDia();
  toast('Limpo','warn');
}

// ═══ BUSCA NF ═══
// A NF não vem no pedido — precisa consultar endpoint separado /nfe
function detectNF(pkgsSemNF, onDone){
  // Busca NF para todos os pedidos sem NF — EM LOTE (muito mais rápido)
  if(pkgsSemNF.length===0){ if(onDone) onDone(); return; }
  console.log('🧾 detectNF batch para '+pkgsSemNF.length+' pedidos sem NF');
  
  var pedidos = pkgsSemNF.map(function(p){ return { blingId: p.blingId, numero: p.numero }; });
  
  apiFetch('/nfs-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedidos: pedidos })
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    var nfs = data.nfs || {};
    var found = 0;
    
    Object.keys(nfs).forEach(function(blingId){
      var nf = nfs[blingId];
      var p = packages.find(function(x){ return String(x.blingId) === String(blingId); });
      if(p && nf.numero){
        p.nf = String(nf.numero).trim();
        if(nf.chave) p.nfChave = String(nf.chave).replace(/\s/g,'');
        found++;
        console.log('✅ NF #'+p.numero+': '+p.nf);
      }
    });
    
    sv('expv5_pkgs', packages);
    syncToServer();
    renderMktGrid();
    if(activeMkt) renderPkgList();
    if(onDone) onDone();
  })
  .catch(function(e){
    console.error('❌ detectNF batch erro:', e.message);
    if(onDone) onDone();
  });
}

// ═══ SYNC SERVIDOR ═══
function stripPhotos(arr){
  // Remove fotos antes de enviar pro servidor (economia de banda)
  return arr.map(function(item){
    var copy={};
    Object.keys(item).forEach(function(k){
      if(k==='photo'||k==='fotosVeiculo') return; // não envia fotos
      copy[k]=item[k];
    });
    return copy;
  });
}

// ─── Upload de fotos para o servidor ────────────────────────────────────────
function uploadScanPhoto(etiqueta, date, photo){
  if(!photo||!etiqueta) return;
  var key='scan_'+etiqueta+'_'+date;
  console.log('📤 Enviando foto etiqueta: '+key+' ('+Math.round(photo.length/1024)+'KB)');
  apiFetch('/photos/scan',{method:'POST',body:JSON.stringify({key:key,photo:photo})})
  .then(function(r){return r.json();})
  .then(function(d){
    console.log('✅ Foto etiqueta enviada:', key, d);
    // Salva URL do Supabase no scan para acesso posterior
    if(d&&d.url){
      for(var i=0;i<scans.length;i++){
        if(scans[i].etiqueta===etiqueta&&scans[i].date===date){
          scans[i].photoUrl=d.url;
          sv('expv5_scans',scans);
          break;
        }
      }
    }
  })
  .catch(function(e){console.error('❌ Erro upload foto etiqueta:', e.message);});
}

function uploadLotePhotos(loteId, fotos){
  if(!loteId||!fotos||!fotos.length){
    console.warn('uploadLotePhotos: sem fotos para enviar', loteId, fotos&&fotos.length);
    return;
  }
  console.log('📤 Enviando '+fotos.length+' foto(s) do veículo para servidor... loteId='+loteId);
  apiFetch('/photos/lote',{method:'POST',body:JSON.stringify({loteId:loteId,fotos:fotos})})
  .then(function(r){return r.json();})
  .then(function(d){console.log('✅ Fotos veículo enviadas:', JSON.stringify(d));})
  .catch(function(e){console.error('❌ Erro upload fotos veículo:', e.message);});
}

function getPhotoFromServer(key, cb){
  apiFetch('/photos/scan/'+key)
  .then(function(r){return r.ok?r.json():null;})
  .then(function(d){
    if(!d) return cb(null);
    // Supabase retorna URL pública; memória retorna base64
    cb(d.url||d.photo||null);
  })
  .catch(function(){cb(null);});
}

function syncToServer(){
  // Envia TODOS os pacotes e TODOS os scans, não só os de hoje.
  // Isso permite o histórico enxergar dias anteriores, como ontem.
  var pkgHoje = packages;
  var scanHoje = stripPhotos(scans);

  // Inclui estado ativo: quem está fazendo expedição de qual loja
  var activeState = activeMkt
    ? { user: currentUser, mkt: activeMkt, ts: Date.now() }
    : null;

  apiFetch('/sync/packages', {
    method: 'POST',
    body: JSON.stringify({ packages: pkgHoje })
  }).catch(function(){});

  apiFetch('/sync/scans', {
    method: 'POST',
    body: JSON.stringify({ scans: scanHoje })
  }).catch(function(){});

  if(activeState){
    apiFetch('/sync/active', {
      method: 'POST',
      body: JSON.stringify(activeState)
    }).catch(function(){});
  } else {
    apiFetch('/sync/active', {
      method: 'POST',
      body: JSON.stringify({
        user: currentUser,
        mkt: null,
        ts: Date.now()
      })
    }).catch(function(){});
  }
}

function loadFromServer(cb){
  apiFetch('/sync/data')
  .then(function(r){return r.json();})
  .then(function(d){
    var serverPkgs=d.packages||[];
    var serverScans=d.scans||[];
    var today=todayStr();

    // Merge packages: server tem prioridade para campos que o cliente pode não ter
    if(serverPkgs.length>0){
      var localMap={};
      packages.forEach(function(p){localMap[p.blingId]=p;});
      serverPkgs.forEach(function(sp){
        if(localMap[sp.blingId]){
          // Pega campos do servidor se mais completos
          if(sp.nf&&!localMap[sp.blingId].nf) localMap[sp.blingId].nf=sp.nf;
          if(sp.nfChave&&!localMap[sp.blingId].nfChave) localMap[sp.blingId].nfChave=sp.nfChave;
          if(sp.numeracao&&!localMap[sp.blingId].numeracao) localMap[sp.blingId].numeracao=sp.numeracao;
          if(sp.numLoja&&!localMap[sp.blingId].numLoja) localMap[sp.blingId].numLoja=sp.numLoja;
          // Servidor diz coletado e local diz pendente: atualiza local
          if(sp.status==='coletado'&&localMap[sp.blingId].status==='pendente'){
            localMap[sp.blingId].status=sp.status;
            localMap[sp.blingId].colT=sp.colT;
            localMap[sp.blingId].obs=sp.obs;
          }
          // Servidor diz problema e local diz pendente: atualiza local
          if(sp.status==='problema'&&localMap[sp.blingId].status==='pendente'){
            localMap[sp.blingId].status=sp.status;
            localMap[sp.blingId].colT=sp.colT;
            localMap[sp.blingId].obs=sp.obs;
          }
        } else if(sp.date===today){
          // Pacote do servidor que não está local — adiciona
          packages.push(sp);
        }
      });
      sv('expv5_pkgs',packages);
    }

    // Merge scans: adiciona scans do servidor que não existem localmente
    if(serverScans.length>0){
      var localIds={};
      scans.forEach(function(s){
        var key=(s.tipo==='lote'?s.id:s.etiqueta+'_'+s.date+'_'+s.time);
        localIds[key]=true;
      });
      var novos=serverScans.filter(function(s){
        var key=(s.tipo==='lote'?s.id:s.etiqueta+'_'+s.date+'_'+s.time);
        return !localIds[key];
      });
      if(novos.length>0){
        scans=scans.concat(novos);
        sv('expv5_scans',scans);
        console.log('📥 '+novos.length+' scans novos do servidor (incluindo lotes)');
      }
    }
    // Merge packages: atualiza status dos pacotes que foram coletados em outro dispositivo
    if(serverPkgs.length>0){
      var today=todayStr();
      var localPkgMap={};
      packages.forEach(function(p){localPkgMap[p.blingId]=p;});
      serverPkgs.forEach(function(sp){
        if(localPkgMap[sp.blingId]&&sp.date===today){
          // Atualiza status se o servidor tem status mais avançado
          var statusOrder={pendente:0,problema:1,coletado:2};
          var localStatus=statusOrder[localPkgMap[sp.blingId].status]||0;
          var serverStatus=statusOrder[sp.status]||0;
          if(serverStatus>localStatus){
            localPkgMap[sp.blingId].status=sp.status;
            localPkgMap[sp.blingId].colT=sp.colT;
          }
        }
      });
      sv('expv5_pkgs',packages);
    }

    // Atualiza indicador de quem está fazendo expedição
    if(d.activeUsers) renderActiveUsers(d.activeUsers);
    if(cb) cb();
  })
  .catch(function(){if(cb) cb();});
}

function renderActiveUsers(activeUsers){
  var outros=activeUsers.filter(function(u){
    return u.user!==currentUser&&u.mkt&&(Date.now()-u.ts)<1800000; // ativo nos últimos 2min
  });
  var banner=document.getElementById('activeBanner');
  if(!banner) return;
  if(outros.length>0){
    var html=outros.map(function(u){
      var info=MKT[u.mkt]||{icon:'📦',n:u.mkt};
      return '👤 '+u.user+' está expedindo '+info.icon+' '+info.n;
    }).join(' · ');
    banner.textContent=html;
    banner.style.display='block';
  } else {
    banner.style.display='none';
  }
}

// ═══ INIT ═══
function initApp(){
  packages=ld('expv5_pkgs',[]); scans=ld('expv5_scans',[]);
  
  // ═══ PEDIDOS PENDENTES DE DIAS ANTERIORES → APARECEM HOJE ═══
  // Se ainda está pendente (não foi bipado), atualiza date para hoje
  // Assim aparece na tela de expedição atual
  var hoje = todayStr();
  var atualizados = 0;
  packages.forEach(function(p){
    if(p.status === 'pendente' && p.date && p.date !== hoje){
      p.date = hoje;
      atualizados++;
    }
  });
  if(atualizados > 0){
    sv('expv5_pkgs', packages);
    console.log('📦 '+atualizados+' pedidos pendentes de dias anteriores atualizados para hoje');
  }
  
  // Limpa valores incorretos no localStorage
  var cleaned=false;
  packages.forEach(function(p){
    if(p.numeracao&&String(p.numeracao).toLowerCase().indexOf('object')!==-1){
      p.numeracao=''; cleaned=true;
    }
    if(p.numLoja&&String(p.numLoja).toLowerCase().indexOf('object')!==-1){
      p.numLoja=''; cleaned=true;
    }
    // Remove urgente indevido de TODOS os pedidos (não só Shopee)
    // Só é urgente se o serviço contém uma das FLEX_KEYWORDS
    if(p.urgente){
      var svcLow=(p.servico||'').toLowerCase();
      var validFlex=FLEX_KEYWORDS.some(function(f){return svcLow.indexOf(f)!==-1;});
      if(!validFlex){
        p.urgente=false;
        console.log('🧹 Removendo urgente indevido: #'+p.numero+' mkt='+p.mkt+' servico='+(p.servico||'vazio'));
        cleaned=true;
      }
    }
  });
  if(cleaned){sv('expv5_pkgs',packages); console.log('🧹 localStorage limpo');}
  document.getElementById('userChip').textContent='👤 '+currentUser;
  renderMktGrid(); updateBadge();
  // 1. Envia dados locais para o servidor (para outros dispositivos verem)
  if(packages.length>0||scans.length>0){
    syncToServer();
    console.log('📤 initApp: enviando '+packages.length+' pacotes e '+scans.length+' scans ao servidor');
  }
  // 2. Busca dados do servidor e faz merge
  loadFromServer(function(){
    renderMktGrid(); updateBadge();
    setTimeout(pullFromBling,1200);
  });

  // Auto-sync a cada 30s — envia E recebe dados entre dispositivos
  setInterval(function(){
    syncToServer();
    loadFromServer(function(){
      renderMktGrid(); updateBadge();
      if(activeMkt) renderPkgList();
    });
  }, 30000);

  // Auto-sync do servidor a cada 30 segundos (para ver dados de outros dispositivos)
  setInterval(function(){
    if(!activeMkt){ // Só se não estiver bipando
      loadFromServer(function(){
        // Atualiza histórico se estiver na aba
        if(document.getElementById('pageHist').style.display!=='none'){
          renderHistorico();
        }
      });
    }
  }, 30000);

  // Auto-busca Bling a cada 10 minutos silenciosamente
  // Não executa se já tiver uma busca em andamento ou se estiver bipando
  setInterval(function(){
    var btn=document.getElementById('syncBtn');
    if(btn&&!btn.disabled&&!activeMkt){
      console.log('🔄 Auto-busca Bling (10min)...');
      pullFromBling();
    }
  }, 10*60*1000);
}

(function(){
  sessionToken=ld('expv5_session','');
  currentUser=ld('expv5_user','');
  var loginTime=ld('expv5_login_time',0);
  var within24h=loginTime&&(Date.now()-loginTime<24*60*60*1000);
  if(sessionToken&&within24h){
    // Verifica com o servidor se a sessão ainda é válida antes de auto-logar
    // (após redeploy do Render, sessões em memória são perdidas)
    fetch('/me',{headers:{'x-session-token':sessionToken}})
    .then(function(r){
      if(r.ok){
        document.getElementById('loginScreen').style.display='none';
        document.getElementById('appWrap').classList.add('show');
        initApp();
      } else {
        // Sessão inválida no servidor — mostra login
        sv('expv5_session',''); sv('expv5_user',''); sv('expv5_login_time',0);
        sessionToken=''; currentUser='';
        // Não força focus — usuário pode já estar digitando
      }
    })
    .catch(function(){
      // Erro de rede — tenta mesmo assim
      document.getElementById('loginScreen').style.display='none';
      document.getElementById('appWrap').classList.add('show');
      initApp();
    });
    return;
  }
  sv('expv5_session',''); sv('expv5_user',''); sv('expv5_login_time',0);
  // Não força focus — evita roubar foco de outro campo
})();

function onScanImgError(img){
  if(!img.dataset.tried){
    img.dataset.tried='1';
    var supaBase='https://wexikjzztxpfdbzjfnxl.supabase.co/storage/v1/object/public/expedicao/';
    var date=(img.dataset.date||new Date().toISOString().slice(0,10));
    img.src=supaBase+'scan_'+img.dataset.et+'_'+date;
  } else {
    img.style.opacity='.15';
  }
}
