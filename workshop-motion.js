/* Locally hosted, licensed footage. Continuous playback with an accessible pause. */
function mountWorkshopScene(){
 const host=document.querySelector('body.logged-out .auth-video');if(!host)return;
 host.classList.add('workshop-scene');host.dataset.motionEngine='video';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 host.innerHTML='<video class="entry-film" muted loop playsinline preload="auto" poster="assets/driving-poster.jpg" aria-label="Video ilustrativo de un automóvil en carretera"><source src="assets/enjoy-driving-28.mp4" type="video/mp4"></video><button class="workshop-scene-toggle" type="button" aria-label="Reproducir video" aria-pressed="true">▶</button>';
 const video=host.querySelector('video'),button=host.querySelector('button');let manuallyPaused=reduced;
 video.muted=true;video.defaultMuted=true;
 const update=()=>{button.textContent=video.paused?'▶':'Ⅱ';button.setAttribute('aria-label',video.paused?'Reproducir video':'Pausar video');button.setAttribute('aria-pressed',String(video.paused));};
 video.addEventListener('play',update);video.addEventListener('pause',update);
 const play=()=>video.play().catch(()=>{update();});
 button.addEventListener('click',()=>{manuallyPaused=!video.paused;if(video.paused)play();else video.pause();});
 if(!reduced){video.autoplay=true;play();}update();
 const visibility=()=>{if(!video.isConnected){document.removeEventListener('visibilitychange',visibility);return;}if(document.hidden)video.pause();else if(!manuallyPaused)play();};document.addEventListener('visibilitychange',visibility);
}
const loginBeforeWorkshopScene=loginPage;loginPage=function(){loginBeforeWorkshopScene();mountWorkshopScene();};mountWorkshopScene();
