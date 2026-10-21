/* Motion (MIT): animated workshop scene, served entirely from this repository. */
let enjoySceneAnimations=[],enjoyScenePaused=false;
function mountWorkshopScene(){
 enjoySceneAnimations.forEach(a=>a.stop());enjoySceneAnimations=[];
 const host=document.querySelector('body.logged-out .auth-video');if(!host)return;
 host.classList.add('workshop-scene');
 host.innerHTML='<img class="workshop-scene-photo" src="assets/enjoy-workshop-scene.png" width="1536" height="1024" fetchpriority="high" alt="Técnico realizando un diagnóstico con una tableta en un taller automotriz"><span class="workshop-scene-glow" aria-hidden="true"></span><button class="workshop-scene-toggle" type="button" aria-label="Pausar movimiento de la escena" aria-pressed="false">Ⅱ</button>';
 const photo=host.querySelector('img'),glow=host.querySelector('.workshop-scene-glow'),button=host.querySelector('button');
 enjoyScenePaused=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(window.Motion?.animate&&!enjoyScenePaused){
 enjoySceneAnimations=[Motion.animate(photo,{scale:[1,1.055],x:['-.3%','.3%']},{duration:12,ease:'easeInOut',repeat:Infinity,repeatType:'reverse'}),Motion.animate(glow,{opacity:[.05,.2]},{duration:5,ease:'easeInOut',repeat:Infinity,repeatType:'reverse'})];
 host.dataset.motionEngine='motion';
 }else if(!enjoyScenePaused){host.classList.add('workshop-css-motion');host.dataset.motionEngine='css-fallback';}
 const update=()=>{button.textContent=enjoyScenePaused?'▶':'Ⅱ';button.setAttribute('aria-label',enjoyScenePaused?'Reanudar movimiento de la escena':'Pausar movimiento de la escena');button.setAttribute('aria-pressed',String(enjoyScenePaused));host.classList.toggle('scene-paused',enjoyScenePaused);};
 button.addEventListener('click',()=>{enjoyScenePaused=!enjoyScenePaused;if(!enjoySceneAnimations.length&&host.dataset.motionEngine!=='css-fallback')host.classList.add('workshop-css-motion');enjoySceneAnimations.forEach(a=>enjoyScenePaused?a.pause():a.play());update();});update();
}
document.addEventListener('visibilitychange',()=>{enjoySceneAnimations.forEach(a=>document.hidden||enjoyScenePaused?a.pause():a.play());});
const loginBeforeWorkshopScene=loginPage;loginPage=function(){loginBeforeWorkshopScene();mountWorkshopScene();};
mountWorkshopScene();
