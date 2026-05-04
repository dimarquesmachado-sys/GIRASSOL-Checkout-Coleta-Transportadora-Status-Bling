// ═══ BLING — busca rastreio FLEX ═══
// Busca tracking individual para marketplaces que não trazem rastreio na listagem
function detectTrackingPkgs(pkgs){
  var i=0;
  function next(){
    if(i>=pkgs.length) return;
    var pkg=pkgs[i++];
    // Se já tem tracking VÁLIDO (não é "object" e não é GUID) → pula
    var nAtual=pkg.numeracao?String(pkg.numeracao):'';
    var ehObject=nAtual.toLowerCase().indexOf('object')!==-1;
    var ehGuid=/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(nAtual.trim());
    var ehJson=nAtual.indexOf('{')!==-1;
    if(nAtual&&!ehObject&&!ehGuid&&!ehJson){next();return;}
    setTimeout(function(){
      apiFetch('/bling/pedidos/vendas/'+pkg.blingId)
      .then(function(r){if(!r.ok)return null;return r.json();})
      .then(function(d){
        if(!d) return;
        var order=d.data||d;

        var vol = order.transporte&&order.transporte.volumes&&order.transporte.volumes[0];
        // Mesmos campos que o detectFlexML usa — sem fallback genérico
        var track = extractTrackStr(vol&&vol.numeracao)
                 || extractTrackStr(vol&&vol.codigoRastreio)
                 || extractTrackStr(vol&&vol.codigoRastreamento)
                 || extractTrackStr(vol&&vol.tracking)
                 || extractTrackStr(order.transporte&&order.transporte.codigoRastreamento)
                 || extractTrackStr(order.transporte&&order.transporte.codigoRastreio)
                 || '';

        // Rejeita track se for GUID (formato XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX)
        if(track && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(String(track).trim())){
          track='';
        }

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

        // NF — tenta todos os caminhos
        // numLoja — número da venda no marketplace
        var numLojaD=(order.numeroPedidoLoja)||(order.numeroLoja)||(order.numeroloja)||(order.loja&&order.loja.numeroPedido)||'';
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
          if(numLojaD&&!p.numLoja){p.numLoja=String(numLojaD).trim();}
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
          // Rejeita se for GUID (formato XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX) — não é tracking real
          if(nr && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(String(nr).trim())){
            nr='';
          }
          if(isFlex){
            p.urgente=true;
            p.servico=order.transporte&&order.transporte.volumes&&order.transporte.volumes[0]?
              (order.transporte.volumes[0].servico||svcNome||'ML Flex'):
              (svcNome||'ML Flex');
          }
          if(nr){
            p.numeracao=String(nr).replace(/\s/g,'').toUpperCase();
            console.log('✅ Tracking ML'+(isFlex?' FLEX':'')+'  #'+p.numero+': '+p.numeracao);
          } else {
            // Limpa qualquer tracking inválido salvo anteriormente
            if(p.numeracao && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(String(p.numeracao).trim())){
              delete p.numeracao;
              console.log('🧹 Limpou GUID inválido de #'+p.numero);
            }
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
        // Ignora se for objeto JSON (ML/Magalu às vezes retornam objeto/GUID no campo numeracao)
        if(numeracaoLista && typeof numeracaoLista === 'object') numeracaoLista = '';
        if(numeracaoLista && String(numeracaoLista).indexOf('{') !== -1) numeracaoLista = '';
        if(numeracaoLista && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(String(numeracaoLista).trim())) numeracaoLista = '';
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
      // Ignora se for objeto JSON (ML/Magalu às vezes retornam objeto/GUID no campo numeracao)
      if(numeracaoLista && typeof numeracaoLista === 'object') numeracaoLista = '';
      if(numeracaoLista && String(numeracaoLista).indexOf('{') !== -1) numeracaoLista = '';
      if(numeracaoLista && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(String(numeracaoLista).trim())) numeracaoLista = '';
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
