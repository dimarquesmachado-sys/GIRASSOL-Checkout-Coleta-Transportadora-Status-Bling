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
     (
  p.tracking
    ? '<span style="color:var(--tm)"> · 📦 '+p.tracking+'</span>'
    : ''
)+
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
