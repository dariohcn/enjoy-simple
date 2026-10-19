/* Keep phone content readable when a browser exposes an oversized layout viewport. */
(function(){
 'use strict';
 function decide(m){
  const sw=Number(m.screenWidth)||Number(m.layoutWidth),sh=Number(m.screenHeight)||Number(m.height);
  const short=Math.min(sw,sh),long=Math.max(sw,sh);
  const phone=!!(m.touchPoints||m.mobile)&&(short<=600||(short<=1000&&long/short>=1.85));
  const logicalShort=phone&&short>600?430:short;
  const deviceWidth=sw>sh?logicalShort*(long/short):logicalShort;
  const ratio=phone?Number(m.layoutWidth)/deviceWidth:1;
  return {phone,scale:phone&&ratio>1.2?Math.min(4,ratio):1,landscape:sw>sh};
 }
 if(typeof module==='object'&&module.exports){module.exports={decide};return;}
 const root=document.documentElement;
 function read(){return {layoutWidth:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height,touchPoints:navigator.maxTouchPoints||0,mobile:!!navigator.userAgentData?.mobile||/Android.*Mobile|iPhone|iPod/i.test(navigator.userAgent)};}
 let current={phone:false,scale:1,landscape:false};
 function apply(m){m=m||read();const next=decide(m);current=next;
  if(next.phone){root.dataset.enjoyPhone='true';root.dataset.phoneOrientation=next.landscape?'landscape':'portrait';root.style.setProperty('--phone-scale',String(next.scale));root.style.setProperty('--phone-height',Math.round(m.height/next.scale)+'px');}
  else{delete root.dataset.enjoyPhone;delete root.dataset.phoneOrientation;root.style.removeProperty('--phone-scale');root.style.removeProperty('--phone-height');}
  return next;
 }
 window.EnjoyViewport={apply,isPhone:()=>current.phone};
 apply();window.addEventListener('resize',()=>apply());window.addEventListener('orientationchange',()=>apply());window.addEventListener('pageshow',()=>apply());
})();
