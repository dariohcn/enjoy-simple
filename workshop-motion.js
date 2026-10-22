/* Locally hosted, licensed footage. Continuous playback with an accessible pause. */
function mountWorkshopScene(){
 const host=document.querySelector('body.logged-out .auth-video');if(!host)return;
 host.classList.add('workshop-scene');host.dataset.motionEngine='video';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 host.innerHTML='<video class="entry-film" muted loop playsinline preload="auto" poster="assets/driving-poster.jpg" aria-label="Video ilustrativo de un automóvil en carretera"><source src="assets/enjoy-driving-28.mp4" type="video/mp4"></video>';
 const video=host.querySelector('video');let manuallyPaused=reduced;
 video.muted=true;video.defaultMuted=true;
 const play=()=>video.play().catch(()=>{});
 if(!reduced){video.autoplay=true;play();}
 const visibility=()=>{if(!video.isConnected){document.removeEventListener('visibilitychange',visibility);return;}if(document.hidden)video.pause();else if(!manuallyPaused)play();};document.addEventListener('visibilitychange',visibility);
}
const loginBeforeWorkshopScene=loginPage;loginPage=function(){loginBeforeWorkshopScene();mountWorkshopScene();};mountWorkshopScene();
