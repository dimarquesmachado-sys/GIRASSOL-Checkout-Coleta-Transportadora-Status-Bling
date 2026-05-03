// ═══ AUTH ═══
function togglePass(){
  var i=document.getElementById('loginPass');
  var b=document.getElementById('eyeBtn');
  i.type=i.type==='password'?'text':'password';
  b.textContent=i.type==='password'?'👁':'🙈';
}
document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&document.getElementById('loginScreen').style.display!=='none') doLogin();
});
function doLogin(){
  var usuario=document.getElementById('loginUser').value.trim();
  var senha=document.getElementById('loginPass').value;
  var btn=document.getElementById('loginBtn');
  var err=document.getElementById('loginErr');
  err.style.display='none';
  if(!usuario||!senha){err.textContent='Preencha usuário e senha.';err.style.display='block';return;}
  btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
  fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:usuario,senha:senha})})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
  .then(function(res){
    if(!res.ok) throw new Error(res.d.error||'Usuário ou senha incorretos.');
    sessionToken=res.d.token; currentUser=res.d.usuario;
    sv('expv5_session',sessionToken); sv('expv5_user',currentUser); sv('expv5_login_time',Date.now());
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appWrap').classList.add('show');
    initApp();
  })
  .catch(function(e){err.textContent=e.message;err.style.display='block';})
  .finally(function(){btn.disabled=false;btn.innerHTML='Entrar';});
}
function doLogout(){
  fetch('/logout',{method:'POST',headers:{'x-session-token':sessionToken}}).catch(function(){});
  sessionToken=''; currentUser='';
  sv('expv5_session',''); sv('expv5_user',''); sv('expv5_login_time',0);
  document.getElementById('appWrap').classList.remove('show');
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginPass').value='';
}
function apiFetch(path,opts){
  opts=opts||{};
  var sep=path.indexOf('?')!==-1?'&':'?';
  var url=path.indexOf('/bling/')!==-1?path+sep+'_='+Date.now():path;
  return fetch(url,Object.assign({},opts,{headers:Object.assign({},opts.headers||{},{'x-session-token':sessionToken,'Content-Type':'application/json','Cache-Control':'no-cache'})}))
  .then(function(r){
    if(r.status===401){
      // Lê o body para ver se é erro NOSSO ou do Bling
      return r.json().then(function(body){
        var nossoErro = body&&(body.error==='Não autorizado.'||body.error==='Sessão expirada.');
        if(nossoErro){ doLogout(); }
        throw new Error(body&&body.error||'Erro de autorização');
      });
    }
    return r;
  });
}
