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
