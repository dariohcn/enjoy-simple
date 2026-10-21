/* Keep startup recoverable without touching account data or permissions. */
(()=>{
 const main=document.querySelector('#contenido');
 const boot=document.querySelector('#startup-state');
 if(!boot)return;
 const timer=setTimeout(()=>{
  if(!boot.isConnected)return;
  boot.querySelector('h1').textContent='La conexión está tardando';
  boot.querySelector('p').textContent='Compruebe su conexión e intente cargar la plataforma nuevamente.';
  boot.querySelector('button').hidden=false;
  boot.classList.add('startup-delayed');
 },15000);
 boot.querySelector('button').addEventListener('click',()=>location.reload());
 const observer=new MutationObserver(()=>{if(!boot.isConnected){clearTimeout(timer);observer.disconnect();}});
 observer.observe(main,{childList:true});
})();
