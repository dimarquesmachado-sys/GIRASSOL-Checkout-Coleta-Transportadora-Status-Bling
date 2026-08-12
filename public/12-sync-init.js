// ═══ SYNC SERVIDOR ═══
// (stripPhotos agora vive no 03-storage-helpers-som.js, junto com svScans)

// ─── Upload de fotos para o servidor ────────────────────────────────────────
function uploadScanPhoto(etiqueta, date, photo, _tentativa){
  if(!photo||!etiqueta) return;
  _tentativa = _tentativa || 1;
  var key='scan_'+etiqueta+'_'+date;
  if(_tentativa===1) console.log('📤 Enviando foto etiqueta: '+key+' ('+Math.round(photo.length/1024)+'KB)');
  apiFetch('/photos/scan',{method:'POST',body:JSON.stringify({key:key,photo:photo})})
  .then(function(r){return r.json();})
  .then(function(d){
    if(d&&d.url){
      console.log('✅ Foto etiqueta enviada:', key);
      // Salva URL do Supabase no scan para acesso posterior
      for(var i=0;i<scans.length;i++){
        if(scans[i].etiqueta===etiqueta&&scans[i].date===date){
          scans[i].photoUrl=d.url;
          svScans();
          break;
        }
      }
    } else if(!(d&&d.ok)){
      throw new Error('servidor não confirmou o salvamento'); // só repete se REALMENTE falhou
    }
  })
  .catch(function(e){
    // RETRY: falha de rede ou Supabase engasgado perdia a foto pra sempre (o base64
    // é descartado logo após bipar). Agora tenta até 4x com espera crescente.
    console.error('❌ Erro upload foto '+key+' (tentativa '+_tentativa+'): '+e.message);
    if(_tentativa < 4){
      setTimeout(function(){ uploadScanPhoto(etiqueta, date, photo, _tentativa+1); }, _tentativa*2500);
    } else {
      console.error('❌ Foto '+key+' NÃO enviada após 4 tentativas — perdida');
    }
  });
}

function uploadLotePhotos(loteId, fotos, _tentativa){
  if(!loteId||!fotos||!fotos.length){
    console.warn('uploadLotePhotos: sem fotos para enviar', loteId, fotos&&fotos.length);
    return;
  }
  _tentativa = _tentativa || 1;
  if(_tentativa===1) console.log('📤 Enviando '+fotos.length+' foto(s) do veículo para servidor... loteId='+loteId);
  apiFetch('/photos/lote',{method:'POST',body:JSON.stringify({loteId:loteId,fotos:fotos})})
  .then(function(r){
    // O servidor responde 502 quando alguma foto não foi salva. Antes o cliente
    // ignorava o status e logava sucesso — a falha passava batida e o base64 era
    // descartado. Agora trata como erro e repete (mesma política da foto de etiqueta).
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  })
  .then(function(d){
    if(!(d&&d.ok)) throw new Error('servidor não confirmou'+(d&&d.falhas?' (fotos '+d.falhas.join(',')+')':''));
    console.log('✅ Fotos veículo enviadas:', JSON.stringify(d));
  })
  .catch(function(e){
    console.error('❌ Erro upload fotos veículo loteId='+loteId+' (tentativa '+_tentativa+'): '+e.message);
    if(_tentativa < 4){
      setTimeout(function(){ uploadLotePhotos(loteId, fotos, _tentativa+1); }, _tentativa*2500);
    } else {
      console.error('❌ Fotos do veículo do lote '+loteId+' NÃO enviadas após 4 tentativas');
    }
  });
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

// Só publica no servidor DEPOIS de um download bem-sucedido. Enquanto o app não
// souber o que existe lá, publicar a base local pode apagar o trabalho dos outros
// aparelhos (vale para o envio do startup E para o timer de 30s).
var baseConfiavel = false;
// Pedidos que o Bling confirmou que saíram (fantasmas). O servidor só remove o
// que estiver nesta lista — ausência na lista enviada não apaga mais nada.
var pkgsRemovidos = ld('expv5_pkgs_removidos',[]);   // sobrevive ao recarregar a página
// Pacotes do servidor mais antigos que a janela: ficam SÓ em memória (não vão pro
// localStorage, pra não estourar a cota), mas voltam no envio pra não sumirem do servidor.
var packagesHistorico = [];
function syncToServer(confirmadoPeloBling){
  if(!baseConfiavel){
    console.warn('⚠ syncToServer ignorado: ainda não houve download bem-sucedido do servidor');
    return;
  }
  // Envia TODOS os pacotes e TODOS os scans, não só os de hoje.
  // Isso permite o histórico enxergar dias anteriores, como ontem.
  // confirmadoPeloBling=true => a busca no Bling foi BEM-SUCEDIDA, então a lista
  // de fantasmas (pkgsRemovidos) é confiável e o servidor pode aplicar as remoções.
  var pkgHoje = packagesHistorico.length ? packages.concat(packagesHistorico) : packages;
  var scanHoje = stripPhotos(scans);

  // Inclui estado ativo: quem está fazendo expedição de qual loja
  var activeState = activeMkt
    ? { user: currentUser, mkt: activeMkt, ts: Date.now() }
    : null;

  // Vão em TODO envio, não só no que vem do pull: se o POST daquele momento falhar,
  // os timers de 30s continuavam mandando lista vazia e a remoção se perdia.
  var removidosEnviados = pkgsRemovidos.slice(0, 500);
  apiFetch('/sync/packages', {
    method: 'POST',
    body: JSON.stringify({
      packages: pkgHoje,
      confirmado: !!confirmadoPeloBling,
      removidos: removidosEnviados
    })
  }).then(function(r){
    // Só tira da lista o que o servidor confirmou ter recebido. Se a rede falhar,
    // os fantasmas continuam pendentes e vão junto no próximo envio.
    if(r && r.ok && removidosEnviados.length){
      pkgsRemovidos = pkgsRemovidos.filter(function(id){ return removidosEnviados.indexOf(id) === -1; });
      sv('expv5_pkgs_removidos', pkgsRemovidos);
    }
  }).catch(function(){});

  apiFetch('/sync/scans', {
    method: 'POST',
    body: JSON.stringify({ scans: scanHoje, removedKeys: removedScanKeys })
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
    var _lim=new Date(); _lim.setDate(_lim.getDate()-45);
    var limiteHistorico=_lim.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
    var histMap={}; packagesHistorico.forEach(function(h){histMap[h.blingId]=true;});

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
          if(sp.codigosBip&&sp.codigosBip.length&&!(localMap[sp.blingId].codigosBip&&localMap[sp.blingId].codigosBip.length)) localMap[sp.blingId].codigosBip=sp.codigosBip;
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
        } else if(sp.date && sp.date < limiteHistorico){
          // Mais antigo que a janela: guarda só em memória (não persiste no
          // localStorage) e devolve no próximo envio, pra não sumir do servidor.
          if(!histMap[sp.blingId]){ histMap[sp.blingId]=true; packagesHistorico.push(sp); }
        } else {
          // Pacote do servidor que não está local — adiciona.
          // CORRIGIDO (11/08): antes só adicionava os de HOJE, então um aparelho
          // sem cache ficava só com os de hoje e, ao republicar, apagava o
          // histórico do servidor. Agora incorpora a janela de 45 dias (mesma
          // retenção dos scans) — sem crescer o localStorage indefinidamente,
          // o que faria sv() estourar a cota e parar de salvar em silêncio.
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
        if(localIds[key]) return false;
        // Não ressuscita scans removidos NESTE aparelho (cancelar/fechar/expirar) —
        // fecha a janela de corrida em que o servidor ainda não processou a remoção.
        if(removedScanKeys.indexOf(scanKeyOf(s))!==-1) return false;
        return true;
      });
      if(novos.length>0){
        scans=scans.concat(novos);
        console.log('📥 '+novos.length+' scans novos do servidor (incluindo lotes)');
      }
      // Dedup local por etiqueta+date (re-bipagem): prefere o que tem loteId, senão o mais recente.
      // APENAS local — NÃO sincroniza aqui (o servidor já faz o próprio dedup no merge).
      var dM={};
      scans.forEach(function(s){
        if(!s) return;
        if(s.tipo==='lote') return;
        var k2=s.etiqueta+'_'+s.date;
        var cur=dM[k2];
        if(!cur) dM[k2]=s;
        else if(s.loteId&&!cur.loteId) dM[k2]=s;
        else if(!s.loteId&&cur.loteId){/* mantém cur */}
        else if((s.ts||0)>(cur.ts||0)) dM[k2]=s;
      });
      // Filtra preservando a ORDEM original do array (restauração depende do índice 0 = mais novo)
      var antes=scans.length;
      scans=scans.filter(function(s){
        if(!s) return false;
        if(s.tipo==='lote') return true;
        return dM[s.etiqueta+'_'+s.date]===s; // só mantém o vencedor de cada chave
      });
      if(scans.length!==antes){
        console.log('🧹 Dedup local: '+(antes-scans.length)+' scans duplicados removidos da exibição');
      }
      svScans();
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
    baseConfiavel = true;  // a partir daqui é seguro publicar
    if(cb) cb(true);   // baixou com sucesso
  })
  .catch(function(){if(cb) cb(false);});   // falhou: quem chamou decide
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
  // 1. BAIXA o servidor PRIMEIRO e faz o merge (ordem corrigida em 11/08).
  //    Antes o app enviava a lista local antes de baixar: um celular guardado há
  //    dias publicava sua base antiga por cima do que os outros já tinham feito.
  //    Agora ele só envia DEPOIS de saber o que existe no servidor.
  loadFromServer(function(okDownload){
    // Só publica a base local se o download REALMENTE aconteceu. Se o GET falhou,
    // enviar agora publicaria uma lista possivelmente incompleta sobre o servidor.
    if(okDownload && (packages.length>0||scans.length>0)){
      syncToServer();
      console.log('📤 initApp: enviando '+packages.length+' pacotes e '+scans.length+' scans ao servidor (após merge)');
    } else if(!okDownload){
      console.warn('⚠ initApp: download do servidor falhou — NÃO enviando a base local agora');
    }
    renderMktGrid(); updateBadge();
    // Só busca no Bling se o download do servidor deu certo. Se falhou, a lista
    // local pode estar incompleta — e o pull manda syncToServer(true), que passa
    // por cima do freio e apagaria o histórico do servidor. O pull periódico
    // (a cada 10 min) tenta de novo quando o servidor voltar.
    if(okDownload){
      setTimeout(pullFromBling,1200);
    } else {
      console.warn('⚠ initApp: pull do Bling adiado — servidor não respondeu ao download inicial');
    }
    // 3. Restaura sessão de coleta se o app recarregou no meio de uma bipagem
    // (ex: funcionário esbarrou no celular). Precisa dos packages já carregados.
    if(typeof restaurarSessaoColeta==='function'){
      setTimeout(restaurarSessaoColeta, 300);
    }
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
        // Atualiza histórico se estiver na aba — MAS só se o usuário não tiver um
        // card de lote aberto (senão o re-render colapsaria o card enquanto ele lê).
        if(document.getElementById('pageHist').style.display!=='none'){
          // Não re-renderiza se o usuário tem QUALQUER card aberto (senão colapsaria
          // enquanto ele lê). Cobre os 3 tipos: marketplace (diaToggle, margin-top:10px),
          // lote (lote-pkgs-*) e lote-do-histórico (lh_*).
          var temCardAberto=false;
          var divs=document.querySelectorAll('#pageHist div[id]');
          for(var i=0;i<divs.length;i++){
            var d=divs[i];
            var ehExp=(d.id.indexOf('lote-pkgs-')===0)||(d.id.indexOf('lh_')===0)||(d.style.marginTop==='10px');
            if(ehExp && d.style.display==='block'){ temCardAberto=true; break; }
          }
          if(!temCardAberto) renderHistorico();
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
