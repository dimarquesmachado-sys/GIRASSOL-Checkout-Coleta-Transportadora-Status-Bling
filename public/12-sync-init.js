// ═══ SYNC SERVIDOR ═══
function stripPhotos(arr){
  return arr.map(function(item){
    var copy={};
    Object.keys(item).forEach(function(k){
      if(k==='photo') return; // mantém fotosVeiculo, remove só foto pesada da etiqueta
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
