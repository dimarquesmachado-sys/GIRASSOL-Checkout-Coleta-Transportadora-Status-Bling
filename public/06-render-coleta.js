// ═══ RENDER ═══
// Logos dos marketplaces (fornecidos pelo lojista), embutidos como base64 —
// nunca dependem de link externo: não quebram e funcionam offline.
var MKT_LOGOS = {
  ml: 'data:image/png;base64,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',
  magalu: 'data:image/png;base64,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',
  amazon: 'data:image/png;base64,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'
};
// Ícone do marketplace no card FLEX: logo real se houver, senão bolinha colorida.
function bolinhaMkt(mkt){
  var m=MKT[mkt]; if(!m) return '';
  if(MKT_LOGOS[mkt]){
    return '<img src="'+MKT_LOGOS[mkt]+'" alt="'+m.n+'" title="'+m.n+'" style="height:20px;vertical-align:middle;margin-right:6px;border-radius:3px">';
  }
  var cor=m.dot||'#8E8E93';
  var borda=m.ring?'border:2px solid #fff;':'border:1px solid rgba(255,255,255,.22);';
  return '<span title="'+m.n+'" style="display:inline-block;width:13px;height:13px;border-radius:50%;background:'+cor+';'+borda+'vertical-align:middle;margin-right:6px;box-sizing:border-box"></span>';
}
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
  // ── Clique no card que JÁ está ativo (toggle para fechar) ──
  if(activeMkt===mkt){
    // PROTEÇÃO: se há pacotes bipados nesta sessão, confirma antes de descartar.
    // Evita perda acidental — ex: o funcionário reabre o app, o sistema restaura a
    // tela de bipagem onde ele parou, e ele clica no card por reflexo, zerando tudo.
    if(colSession.length>0){
      if(!confirm('⚠ ATENÇÃO\n\nVocê tem '+colSession.length+' pacote(s) JÁ bipado(s) aqui que ainda NÃO foram despachados.\n\nSe fechar agora, esses bipes serão DESCARTADOS e os pacotes NÃO serão despachados.\n\n👉 Para despachar, finalize a coleta (botão verde) em vez de fechar.\n\nFechar e descartar mesmo assim?')){
        return; // funcionário cancelou — mantém o card aberto com os bipes intactos
      }
    }
    closeColeta();
    return;
  }
  if(_tirando_fotos) return; // Não muda de card durante captura de fotos
  // PROTEÇÃO: trocar para OUTRO card com bipes não finalizados também os descarta.
  // Confirma antes (mesmo risco de perda acidental ao clicar em outro card sem querer).
  if(colSession.length>0){
    if(!confirm('⚠ ATENÇÃO\n\nVocê tem '+colSession.length+' pacote(s) bipado(s) em '+((MKT[activeMkt]||{}).n||activeMkt||'')+' que ainda NÃO foram despachados.\n\nTrocar de card agora vai DESCARTAR esses bipes.\n\n👉 Para despachar, finalize a coleta (botão verde) antes de trocar.\n\nTrocar e descartar mesmo assim?')){
      return; // funcionário cancelou — fica no card atual, bipes intactos
    }
  }
  // Limpa scans da sessão atual ANTES de trocar de card (evita órfãos duplicados)
  if(colSession.length>0){
    var todayK=todayStr();
    var removeu=false;
    for(var iK=scans.length-1;iK>=0;iK--){
      if(scans[iK].tipo==='lote') continue;
      if(scans[iK].date!==todayK) continue;
      if(scans[iK].loteId) continue; // Se já tem loteId, foi finalizado, mantém
      if(colSession.indexOf(scans[iK].etiqueta)!==-1){
        registrarRemocaoScan(scans[iK]); // p/ o servidor remover no merge
        scans.splice(iK,1);
        removeu=true;
      }
    }
    if(removeu){
      svScans();
      syncToServer(); // propaga limpeza para o servidor (evita scan órfão voltar)
    }
  }
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
  // Remove os scans da sessão atual que NÃO foram finalizados em lote
  // (evita duplicatas ao re-bipar a mesma etiqueta depois)
  if(colSession.length>0){
    var today=todayStr();
    var removeu2=false;
    for(var i=scans.length-1;i>=0;i--){
      if(scans[i].tipo==='lote') continue;
      if(scans[i].date!==today) continue;
      if(scans[i].loteId) continue; // Se já tem loteId, foi finalizado, mantém
      if(colSession.indexOf(scans[i].etiqueta)!==-1){
        registrarRemocaoScan(scans[i]); // p/ o servidor remover no merge
        scans.splice(i,1);
        removeu2=true;
      }
    }
    if(removeu2){
      svScans();
      syncToServer(); // propaga limpeza para o servidor (evita scan órfão voltar)
    }
  }
  activeMkt=''; colSession=[]; scanPaused=false; encerrandoParcial=false;
  if(typeof limparSessaoColeta==='function') limparSessaoColeta(); // limpa sessão restaurável
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

function startColetaTimer(deadlineExistente){
  // Limite de 25 min de INATIVIDADE: cada bipe renova o prazo.
  // Assim, uma coleta longa (ex: 40 pacotes) não expira enquanto o funcionário
  // está bipando; só expira se ficar 25 min PARADA (coleta abandonada).
  if(deadlineExistente){
    coletaDeadline = deadlineExistente;            // restauração: continua de onde parou
  } else {
    coletaDeadline = Date.now() + 25*60*1000;      // bipe normal: renova os 25 min
  }
  sv('expv5_coleta_deadline', coletaDeadline);     // persiste p/ sobreviver a reload
  if(coletaTimerInterval) return;                  // já há contador rodando — só renovou o prazo

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
      // Linha 1: número do pedido Bling (principal). No card FLEX (que mistura vários
      // marketplaces), mostra uma bolinha colorida da origem pra identificar de bater o olho.
      '<div class="pkg-num">'+(activeMkt==='flex'?bolinhaMkt(p.mkt):'')+p.numero+'</div>'+
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
