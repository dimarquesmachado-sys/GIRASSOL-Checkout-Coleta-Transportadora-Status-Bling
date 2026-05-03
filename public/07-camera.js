// ═══ CÂMERA ═══
function toggleBipar(){
  if(scanning){stopCamera();return;}
  startCamera();
}
function startCamera(){
  if(!('BarcodeDetector' in window)){toast('Use Chrome Android para câmera','warn');return;}
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280}}})
  .then(function(stream){
    camStream=stream;
    var v=document.getElementById('camVideo');
    v.srcObject=stream;
    document.getElementById('camWrap').classList.add('show');
    var btn=document.getElementById('biparBtn');
    btn.classList.add('scanning');
    btn.textContent='⏹ PARAR LEITURA';
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
  if(camStream){camStream.getTracks().forEach(function(t){t.stop();});camStream=null;}
  var v=document.getElementById('camVideo');
  if(v) v.srcObject=null;
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
