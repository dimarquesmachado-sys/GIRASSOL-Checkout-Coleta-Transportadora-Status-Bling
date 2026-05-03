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
      if(packages[i].etiqueta===chave&&packages[i].date===loteDate){
        packages[i].status='coletado'; packages[i].colT=now; if(obs) packages[i].obs=obs; break;
      }
    }
  });
  problemaPkgs.forEach(function(chave){
    for(var i=0;i<packages.length;i++){
      if(packages[i].etiqueta===chave&&packages[i].date===loteDate){
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
      if(packages[i].etiqueta===chave&&packages[i].date===loteDate){
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
