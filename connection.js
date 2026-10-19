'use strict';
/* Public browser configuration contains no privileged credential. */
const EnjoyConnection = (() => {
  const storageKey='enjoy.access.v1';
  let tokens=null,refreshing=null;
  try{tokens=JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{sessionStorage.removeItem(storageKey)}
  function settings(){
    const c=window.ENJOY_CONFIG||{};
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.endpoint||'')||!c.publicKey)throw Error('El acceso aún no está habilitado. Consulte al administrador.');
    if(c.publicKey.startsWith('sb_secret_'))throw Error('Configuración de acceso inválida.');
    try{if(JSON.parse(atob(c.publicKey.split('.')[1]||'')).role==='service_role')throw Error('Configuración de acceso inválida.')}catch(e){if(e.message==='Configuración de acceso inválida.')throw e}
    return c;
  }
  function remember(value){tokens=value?{access_token:value.access_token,refresh_token:value.refresh_token,expires_at:value.expires_at||Math.floor(Date.now()/1000)+(value.expires_in||3600)}:null;if(tokens)sessionStorage.setItem(storageKey,JSON.stringify(tokens));else sessionStorage.removeItem(storageKey)}
  async function request(path,body,token,method='POST'){
    const c=settings(),response=await fetch(c.endpoint+path,{method,headers:{apikey:c.publicKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      let message=result.message||result.msg||result.error_description||'';
      if(path.startsWith('/auth/'))message=response.status===429?'Demasiados intentos. Espere unos minutos.':/confirm/i.test(message)?'Confirme su correo electrónico antes de ingresar.':'No se pudo validar la cuenta. Revise el correo y la contraseña.';
      else if(!/^(Su |El |La |Los |No |Debe |Complete |Ingrese |Registro|Revise |Servicio|Vehículo|Fecha|Permiso|Estado|Identificador|Operación|Seleccione)/.test(message))message='No se pudo completar la operación.';
      const error=Error(message);error.status=response.status;throw error;
    }
    return result;
  }
  async function access(){
    if(!tokens)return null;
    if(tokens.expires_at<=Date.now()/1000+60){
      if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:tokens.refresh_token}).then(remember).catch(e=>{remember(null);throw e}).finally(()=>{refreshing=null});
      await refreshing;
    }
    return tokens.access_token;
  }
  async function rpc(action,payload={}){const token=await access();if(!token)throw Error('Debe iniciar sesión.');return request('/rest/v1/rpc/enjoy_api',{action,payload},token)}
  async function api(path,body){
    if(path==='register'){
      const b=body||{};
      if((b.password||'').length<10)throw Error('La contraseña debe tener al menos 10 caracteres.');
      for(const k of ['name','owner','email','location'])if(!String(b[k]||'').trim())throw Error('Complete los datos requeridos.');
      if(b.whatsappOptIn&&!/^[1-9]\d{7,14}$/.test(String(b.phone||'').replace(/[^0-9]/g,'')))throw Error('Ingrese WhatsApp con código de país.');
      await request('/auth/v1/signup',{email:b.email.trim(),password:b.password,data:{name:b.name,owner:b.owner,location:b.location,phone:b.phone||'',whatsappOptIn:b.whatsappOptIn===true,image:b.image||''}});
      return {ok:true};
    }
    if(path==='login'){
      const result=await request('/auth/v1/token?grant_type=password',{email:body.email.trim(),password:body.password});remember(result);
      try{return await rpc('session')}catch(e){await api('logout');throw e}
    }
    if(path==='logout'){
      try{const token=await access();if(token)await request('/auth/v1/logout',undefined,token)}finally{remember(null)}
      return {ok:true};
    }
    if(path==='session'&&!tokens)return null;
    return rpc(path,body||{});
  }
  return Object.freeze({api});
})();

