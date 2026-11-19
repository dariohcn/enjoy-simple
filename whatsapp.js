(() => {
'use strict';
let sdkPromise,preparedAttempt=null,activeSignup=null,identity='';
const message=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const statusText=connection=>{
 if(!connection)return 'Sin conexión';
 if(connection.expiresAt&&Date.parse(connection.expiresAt)<=Date.now())return 'Autorización vencida. Vuelva a conectar.';
 if(connection.templateStatus==='DISCONNECTED')return 'Conexión retirada. Vuelva a conectar.';
 if(connection.connected)return 'Conectado · recordatorios automáticos habilitados';
 if(connection.templateStatus==='APPROVED')return 'Completando conexión';
 if(connection.templateStatus==='REJECTED')return 'Recordatorio rechazado. Consulte al administrador.';
 return 'Pendiente de aprobación o de completar la conexión';
};
function loadSDK(config){
 if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://connect.facebook.net/es_LA/sdk.js';
  script.async=true;
  script.crossOrigin='anonymous';
  const timer=setTimeout(()=>{sdkPromise=null;reject(Error('No se pudo cargar la conexión con WhatsApp. Inténtelo nuevamente.'));},20000);
  script.onload=()=>{clearTimeout(timer);resolve(window.FB);};
  script.onerror=()=>{clearTimeout(timer);script.remove();sdkPromise=null;reject(Error('No se pudo cargar la conexión con WhatsApp.'));};
  document.head.append(script);
 });
 return sdkPromise.then(FB=>{
  FB.init({appId:config.appId,autoLogAppEvents:false,xfbml:false,version:config.apiVersion});
  return FB;
 });
}
function panelMarkup(admin){
 if(admin)return '<h2>WhatsApp de los talleres</h2><p>Configure la aplicación de enjoy una vez. Cada propietario autorizará el número de su taller.</p>'+
  '<form data-wa-settings class="fields"><label>Identificador de la aplicación<input class="form-control" name="appId" inputmode="numeric" pattern="[0-9]{4,40}" required></label>'+
  '<label>Identificador del registro integrado<input class="form-control" name="configId" inputmode="numeric" pattern="[0-9]{4,40}" required></label>'+
  '<label>Versión de la API<input class="form-control" name="apiVersion" placeholder="Versión de su aplicación" pattern="v[0-9]{1,3}[.][0-9]{1,2}" required></label>'+
  '<div><button class="btn" type="submit">Guardar configuración</button></div></form>'+
  '<p data-wa-platform role="status"></p><div data-wa-connections></div>';
 return '<h2>WhatsApp del taller</h2><p>Conecte el número de WhatsApp Business de su taller para enviar recordatorios automáticos una hora antes de la cita.</p>'+
  '<p data-wa-state role="status">Consultando conexión…</p><p data-wa-number></p>'+
  '<p data-wa-platform></p><div class="actions wa-connection-actions">'+
  '<button type="button" class="btn" data-wa-connect disabled>Conectar WhatsApp Business</button>'+
  '<button type="button" class="btn secondary" data-wa-refresh hidden>Comprobar conexión</button>'+
  '<button type="button" class="btn secondary" data-wa-disconnect hidden>Desconectar</button></div>'+
  '<p>El cliente debe autorizar los recordatorios y tener un teléfono registrado con código de país. Los envíos están sujetos a las tarifas de WhatsApp.</p>';
}
async function refreshPanel(panel,admin){
 const note=panel.querySelector('[data-wa-note]');
 const config=await api('whatsapp-status');
 if(!panel.isConnected||session?.email!==identity)return;
 const readiness=await api('whatsapp-readiness');
 if(!panel.isConnected||session?.email!==identity)return;
 const ready=readiness.ready;
 panel.querySelector('[data-wa-platform]').textContent=ready?'Conexión habilitada para los talleres.':
  admin?'Activación pendiente. Complete los identificadores y la clave privada de la aplicación en la configuración del servidor.':
  'El administrador debe completar la activación antes de conectar su número.';
 if(admin){
  const form=panel.querySelector('[data-wa-settings]');
  for(const name of ['appId','configId','apiVersion'])form.elements[name].value=config[name]||'';
  const connections=config.connections||[];
  panel.querySelector('[data-wa-connections]').innerHTML=connections.length?
   table(['Taller','Número emisor','Estado'],connections.map(connection=>'<tr><td>'+message(connection.workshop)+'</td><td>'+
    message(connection.phone)+'</td><td>'+message(statusText(connection))+'</td></tr>')):'<p>Ningún taller ha vinculado su número.</p>';
  labelTables();
  return;
 }
 const connection=config.connection;
 panel.querySelector('[data-wa-state]').textContent=statusText(connection);
 panel.querySelector('[data-wa-number]').textContent=connection?'Número emisor: '+connection.phone:'';
 panel.querySelector('[data-wa-disconnect]').hidden=!connection;
 panel.querySelector('[data-wa-refresh]').hidden=!connection||!ready;
 const connect=panel.querySelector('[data-wa-connect]');
 connect.textContent=connection?'Volver a conectar WhatsApp Business':'Conectar WhatsApp Business';
 connect.disabled=true;
 preparedAttempt=null;
 if(!ready)return;
 await loadSDK(config);
 const attempt=await api('whatsapp-begin');
 if(!panel.isConnected||session?.email!==identity)return;
 preparedAttempt={...config,attemptId:attempt.attemptId,at:Date.now()};
 connect.disabled=false;
 note.textContent='';
}
function startSignup(panel){
 const note=panel.querySelector('[data-wa-note]');
 const current=preparedAttempt;
 if(!current||Date.now()-current.at>8*60000){
  note.textContent='Actualizando autorización. Pulse Conectar nuevamente cuando el botón esté habilitado.';
  refreshPanel(panel,false).catch(error=>{note.textContent=error.message;});
  return;
 }
 if(activeSignup)return;
 preparedAttempt=null;
 const connect=panel.querySelector('[data-wa-connect]');
 connect.disabled=true;
 let code='',assets=null,finishing=false,ended=false;
 const originalIdentity=identity;
 const stop=()=>{
  clearTimeout(timeout);
  window.removeEventListener('message',onMessage);
  activeSignup=null;
 };
 const fail=text=>{
  if(ended)return;
  ended=true;
  stop();note.textContent=text;
  if(panel.isConnected)refreshPanel(panel,false).catch(()=>{});
 };
 const complete=async()=>{
  if(ended||finishing||!code||!assets||!panel.isConnected||session?.email!==originalIdentity)return;
  finishing=true;
  ended=true;
  stop();
  note.textContent='Guardando la conexión del taller…';
  try{
   const result=await api('whatsapp-complete',{attemptId:current.attemptId,code,accountId:assets.waba_id,phoneId:assets.phone_number_id||''});
   note.textContent=result.templateStatus==='APPROVED'?'WhatsApp conectado.':'Autorización guardada. El recordatorio está pendiente de aprobación.';
   await refreshPanel(panel,false);
  }catch(error){
   note.textContent=error.message;
   refreshPanel(panel,false).catch(()=>{});
  }
 };
 const onMessage=event=>{
  let host;
  try{const origin=new URL(event.origin);if(origin.protocol!=='https:')return;host=origin.hostname;}catch{return;}
  if(host!=='facebook.com'&&!host.endsWith('.facebook.com'))return;
  let value;
  try{value=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(value?.type!=='WA_EMBEDDED_SIGNUP')return;
  if(value.event==='FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'){
   assets=value.data;
   complete();
  }else if(value.event==='CANCEL'||value.event==='ERROR'){
   fail('La autorización no se completó. Puede intentarlo nuevamente.');
  }else if(value.event==='FINISH'){
   fail('Seleccione la conexión de su cuenta existente de WhatsApp Business.');
  }
 };
 const timeout=setTimeout(()=>fail('La autorización venció. Vuelva a conectar.'),120000);
 window.addEventListener('message',onMessage);
 activeSignup=stop;
 note.textContent='Complete la autorización en la ventana de WhatsApp.';
 try{
  window.FB.login(response=>{
   if(ended)return;
   if(response.authResponse?.code){code=response.authResponse.code;complete();}
   else fail('La autorización no se completó. Puede intentarlo nuevamente.');
  },{config_id:current.configId,response_type:'code',override_default_response_type:true,
   extras:{setup:{},featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'}});
 }catch{fail('El navegador no pudo abrir la autorización de WhatsApp. Inténtelo nuevamente.');}
}
function mount(){
 const admin=session?.role==='admin';
 if(!session||!(admin&&view==='adminHome'||session.role==='owner'&&view==='security'))return;
 const root=document.querySelector('#contenido');
 if(!root||root.querySelector('#workshop-whatsapp'))return;
 if(identity!==session.email){activeSignup?.();preparedAttempt=null;identity=session.email;}
 const panel=document.createElement('section');
 panel.id='workshop-whatsapp';
 panel.className='card integration-pad';
 panel.innerHTML=panelMarkup(admin)+'<p data-wa-note role="status" aria-live="polite"></p>';
 root.append(panel);
 const note=panel.querySelector('[data-wa-note]');
 if(admin){
  panel.querySelector('[data-wa-settings]').onsubmit=async event=>{
   event.preventDefault();
   const button=event.currentTarget.querySelector('button');
   button.disabled=true;
   try{await api('whatsapp-config-save',Object.fromEntries(new FormData(event.currentTarget)));await refreshPanel(panel,true);note.textContent='Configuración guardada.';}
   catch(error){note.textContent=error.message;}
   finally{button.disabled=false;}
  };
 }else{
  panel.querySelector('[data-wa-connect]').onclick=()=>startSignup(panel);
  panel.querySelector('[data-wa-refresh]').onclick=async event=>{
   event.currentTarget.disabled=true;
   try{await api('whatsapp-refresh');await refreshPanel(panel,false);note.textContent='Estado actualizado.';}
   catch(error){note.textContent=error.message;}
   finally{if(panel.isConnected)panel.querySelector('[data-wa-refresh]').disabled=false;}
  };
  panel.querySelector('[data-wa-disconnect]').onclick=()=>{
   modal('Desconectar WhatsApp','<p class="full">Se detendrán los recordatorios automáticos de este taller. Podrá conectar el número nuevamente.</p>',async()=>{
    await api('whatsapp-disconnect');
    await refreshPanel(panel,false);
   },'Desconectar');
  };
 }
 refreshPanel(panel,admin).catch(error=>{note.textContent=error.message;});
}
const previous=render;
render=function(...args){const result=previous(...args);mount();return result;};
document.addEventListener('click',event=>{
 if(event.target.closest('[data-action="logout"]')){activeSignup?.();preparedAttempt=null;identity='';}
},true);
mount();
})();