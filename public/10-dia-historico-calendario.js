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
