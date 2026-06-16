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
  scans.unshift({etiqueta:chave,mkt:activeMkt,date:today,time:nowTS(),ts:Date.now(),user:currentUser,photo:photo,destinatario:pkg.destinatario,numero:pkg.numero});
  svScans();
  salvarSessaoColeta(); // Salva sessão (colSession+mkt) p/ restaurar se o app recarregar
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
      registrarRemocaoScan(scans[j]); // p/ o servidor remover no merge
      scans.splice(j,1); break;
    }
  }
  svScans();
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

// ═══ PERSISTÊNCIA DE SESSÃO DE COLETA ═══
// Salva a sessão atual (colSession + activeMkt) para sobreviver a recarregamentos
// acidentais do app (ex: funcionário esbarra no celular durante a bipagem).
function salvarSessaoColeta(){
  if(!activeMkt || colSession.length===0){ limparSessaoColeta(); return; }
  sv('expv5_sessao_coleta', {
    mkt: activeMkt,
    colSession: colSession,
    date: todayStr(),
    ts: Date.now()
  });
}

function limparSessaoColeta(){
  sv('expv5_sessao_coleta', null);
  sv('expv5_coleta_deadline', null);
}

// Restaura a sessão se o app recarregou no meio de uma coleta.
// ROBUSTO: reconstrói a partir dos próprios bipes salvos (scans), que sempre
// sobrevivem ao reload. Um bipe de HOJE sem loteId = pacote bipado mas não finalizado.
// O prazo de 25 min é POR MARKETPLACE (cada card é uma sessão própria) — assim,
// restos órfãos de uma tentativa antiga (ex: erro ao finalizar de manhã) NÃO
// contaminam nem expiram a coleta atual de outro card.
function restaurarSessaoColeta(){
  var hoje = todayStr();
  // Bipes de hoje, não finalizados, do PRÓPRIO usuário logado
  var orfaos = scans.filter(function(s){
    return s && s.tipo!=='lote' && s.date===hoje && !s.loteId && s.etiqueta
      && (!s.user || s.user===currentUser);
  });
  if(orfaos.length===0) return false;

  // Agrupa por marketplace — cada card tem o próprio prazo de 25 min
  var porMkt={};
  orfaos.forEach(function(s){
    var m=s.mkt||'';
    if(!porMkt[m]) porMkt[m]=[];
    porMkt[m].push(s);
  });

  var agora=Date.now();
  var candidatoMkt=null, candidatoUltimo=0, candidatoDeadline=0;
  var descartados=0, mktsExpirados=[];

  Object.keys(porMkt).forEach(function(m){
    var lst=porMkt[m];
    var tsL=lst.map(function(s){return s.ts||0;}).filter(function(t){return t>0;});
    if(tsL.length===0) return; // bipes antigos sem timestamp: não restaura nem mexe
    // Prazo de INATIVIDADE: 25 min contados do ÚLTIMO bipe (não do primeiro).
    // Coleta longa ativa (bipando) nunca expira; só expira se ficou 25 min parada.
    var ult=Math.max.apply(null,tsL);
    var dl=ult+25*60*1000;
    if(agora>dl){
      // Ficou 25 min sem bipar → coleta abandonada → descarta SÓ os bipes deste card
      lst.forEach(function(s){
        registrarRemocaoScan(s); // p/ o servidor remover no merge
        var ix=scans.indexOf(s);
        if(ix!==-1){ scans.splice(ix,1); descartados++; }
      });
      mktsExpirados.push(m);
    } else {
      // Card ainda válido — candidato a restaurar (escolhe o de bipe mais recente)
      if(!candidatoMkt || ult>candidatoUltimo){
        candidatoMkt=m; candidatoUltimo=ult; candidatoDeadline=dl;
      }
    }
  });

  if(descartados>0){
    svScans();
    if(typeof syncToServer==='function') syncToServer();
    if(typeof toast==='function') toast('⏰ '+descartados+' bipe(s) de coleta(s) antiga(s) expirou(aram) (25 min)','warn');
    console.log('⏰ Expirados e descartados: '+descartados+' bipes de ['+mktsExpirados.join(', ')+']');
  }

  if(!candidatoMkt){ limparSessaoColeta(); return false; }

  // Restaura o card válido mais recente
  var etiquetas = porMkt[candidatoMkt]
    .filter(function(s){ return scans.indexOf(s)!==-1; })
    .map(function(s){ return s.etiqueta; });
  if(etiquetas.length===0){ limparSessaoColeta(); return false; }

  if(typeof selectMkt === 'function'){
    selectMkt(candidatoMkt);        // selectMkt zera colSession e roda limpeza de órfãos
    colSession = etiquetas.slice(); // restaura DEPOIS (senão a limpeza apaga)
    salvarSessaoColeta();
    if(typeof startColetaTimer==='function') startColetaTimer(candidatoDeadline); // retoma com tempo restante
    if(typeof renderPkgList === 'function') renderPkgList();
    if(typeof renderProgress === 'function') renderProgress();
    // Reaplica após o pullFromBlingMkt do selectMkt terminar (recarrega pacotes)
    setTimeout(function(){
      colSession = etiquetas.slice();
      if(typeof renderPkgList === 'function') renderPkgList();
      if(typeof renderProgress === 'function') renderProgress();
    }, 1500);
  } else {
    colSession = etiquetas.slice();
  }
  if(typeof toast === 'function') toast('↩ Coleta restaurada: '+etiquetas.length+' pacotes bipados','ok');
  return true;
}
