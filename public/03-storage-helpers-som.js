// ═══ STORAGE ═══
function sv(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function ld(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}

// ═══ HELPERS ═══
function todayStr(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});}
function nowTS(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function todayPkgs(){return packages.filter(function(p){return p.date===todayStr();});}
function lojaToMkt(id){return LOJA_MAP[String(id)]||null;}
function svcToMkt(s){
  if(!s) return 'melhorenvio';
  var n=s.toLowerCase();
  var keys=Object.keys(MKT);
  for(var i=0;i<keys.length;i++){
    var id=keys[i];
    if(id==='outro'||id==='melhorenvio'||id==='flex') continue;
    var m=MKT[id];
    if(m.svcMatch&&m.svcMatch.some(function(k){return n.indexOf(k)!==-1;})) return id;
  }
  return 'melhorenvio';
}

// ═══ SOM ═══
function beepSuccess(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);
    o.type='sine';
    o.frequency.setValueAtTime(880,ctx.currentTime);
    o.frequency.setValueAtTime(1320,ctx.currentTime+0.1);
    g.gain.setValueAtTime(0.3,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
    o.start(ctx.currentTime);o.stop(ctx.currentTime+0.4);
  }catch(e){}
}
function beepError(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);
    o.type='sawtooth';
    o.frequency.setValueAtTime(200,ctx.currentTime);
    g.gain.setValueAtTime(0.3,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
    o.start(ctx.currentTime);o.stop(ctx.currentTime+0.4);
  }catch(e){}
}
