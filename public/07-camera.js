// ═══ CÂMERA ═══
// Híbrido: BarcodeDetector nativo (Chrome Android, mais rápido)
// + ZXing como fallback (iPhone/Safari e navegadores sem BarcodeDetector)
var zxingReader = null;

function toggleBipar(){
  if(scanning){stopCamera();return;}
  startCamera();
}

function startCamera(){
  if('BarcodeDetector' in window){
    startCameraNativo();
  } else if(typeof ZXing !== 'undefined' && ZXing.BrowserMultiFormatReader){
    startCameraZXing();
  } else {
    toast('Câmera não suportada neste navegador. Digite o código manualmente.','warn');
  }
}

function _uiCameraOn(){
  document.getElementById('camWrap').classList.add('show');
  var btn=document.getElementById('biparBtn');
  btn.classList.add('scanning');
  btn.textContent='⏹ PARAR LEITURA';
}

// ── Caminho 1: BarcodeDetector nativo (Android) ──
function startCameraNativo(){
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280}}})
  .then(function(stream){
    camStream=stream;
    var v=document.getElementById('camVideo');
    v.srcObject=stream;
    _uiCameraOn();
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

// ── Caminho 2: ZXing (iPhone/Safari) ──
function startCameraZXing(){
  var v=document.getElementById('camVideo');
  zxingReader=new ZXing.BrowserMultiFormatReader();
  zxingReader.decodeFromConstraints(
    {video:{facingMode:'environment',width:{ideal:1280}}},
    v,
    function(result, err){
      if(!scanning) return;
      if(scanPaused) return;
      if(result){
        var raw=String(result.getText()||'').trim();
        if(raw && (raw!==lastCode||Date.now()-lastCodeAt>4000)){
          var photo=capturePhoto(v);
          handleScan(raw,photo);
        }
      }
      // err é normal enquanto não acha código (NotFoundException) — ignora
    }
  ).then(function(){
    _uiCameraOn();
    scanning=true;
  }).catch(function(e){
    toast('Câmera: '+(e&&e.message?e.message:'erro ao abrir'),'err');
    if(zxingReader){try{zxingReader.reset();}catch(_){} zxingReader=null;}
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
  if(zxingReader){try{zxingReader.reset();}catch(_){} zxingReader=null;}
  if(camStream){camStream.getTracks().forEach(function(t){t.stop();});camStream=null;}
  var v=document.getElementById('camVideo');
  if(v){
    // ZXing anexa o stream direto no vídeo — para os tracks dele também
    if(v.srcObject){try{v.srcObject.getTracks().forEach(function(t){t.stop();});}catch(_){}}
    v.srcObject=null;
  }
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
