const env=(key:string)=>Deno.env.get(key)||'';
const SITE='https://dariohcn.github.io';
const TEMPLATE='enjoy_recordatorio_cita_v1';
const BODY='{{1}} le recuerda su cita. Cliente: {{2}}. Vehículo: {{3}}. Fecha: {{4}}. Hora: {{5}}. Servicio: {{6}}.';
const headers={'Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
function reply(value:unknown,status=200){return Response.json(value,{status,headers});}
class SafeError extends Error{}
async function rpc(name:string,action:string,payload:unknown,authorization?:string){
 const credential=authorization||'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY');
 const response=await fetch(env('SUPABASE_URL')+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:credential,'Content-Type':'application/json'},
  body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(20000)
 });
 const value=await response.json().catch(()=>null);
 if(!response.ok)throw new SafeError(typeof value?.message==='string'&&/^(Debe|No |El |La |Este|Conecte|Permiso|Ingrese|Revise|Espere|Desconecte)/.test(value.message)?value.message:'No se pudo guardar la conexión.');
 return value;
}
async function graph(version:string,path:string,token:string,body?:unknown){
 if(!/^v\d{1,3}\.\d{1,2}$/.test(version))throw new SafeError('El administrador debe configurar la versión de la API.');
 const response=await fetch('https://graph.facebook.com/'+version+'/'+path,{
  method:body===undefined?'GET':'POST',
  headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)
 });
 const value=await response.json().catch(()=>null);
 if(!response.ok)throw new SafeError('WhatsApp no completó la conexión. Revise los permisos y la cuenta en Meta. Código '+String(value?.error?.code||response.status)+'.');
 return value;
}
async function ensureTemplate(version:string,account:string,token:string){
 const list=await graph(version,account+'/message_templates?name='+TEMPLATE+'&fields=name,status,language,components',token);
 const existing=list.data?.find((item:any)=>item.name===TEMPLATE&&item.language==='es');
 if(existing){
  const body=existing.components?.find((part:any)=>part.type==='BODY');
  if(body?.text!==BODY)throw new SafeError('La plantilla del recordatorio tiene otro contenido. Consulte al administrador.');
  return existing.status;
 }
 const created=await graph(version,account+'/message_templates',token,{
  name:TEMPLATE,language:'es',category:'UTILITY',parameter_format:'POSITIONAL',
  components:[{type:'BODY',text:BODY,example:{body_text:[['Taller Ejemplo','María López','ABC1234','25/12/2026','10:00','Mantenimiento preventivo']]}}]
 });
 return created.status||'PENDING';
}
async function prepareConnection(userId:string){
 const connection=await rpc('enjoy_whatsapp_server','credentials',{userId});
 await graph(connection.apiVersion,connection.accountId+'/subscribed_apps',connection.token,{});
 const templateStatus=await ensureTemplate(connection.apiVersion,connection.accountId,connection.token);
 for(const [kind,done] of [['smb_app_state_sync',connection.contactsSynced],['history',connection.historySynced]] as const){
  if(done)continue;
  await graph(connection.apiVersion,connection.phoneId+'/smb_app_data',connection.token,{messaging_product:'whatsapp',sync_type:kind});
  await rpc('enjoy_whatsapp_server','sync-complete',{workshop:connection.workshop,kind});
 }
 await rpc('enjoy_whatsapp_server','template-status',{workshop:connection.workshop,status:templateStatus});
 return templateStatus;
}
async function signed(raw:string,signature:string,secret:string){
 if(!/^sha256=[a-f0-9]{64}$/.test(signature)||!secret)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.slice(7).match(/../g)!,pair=>parseInt(pair,16));
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw));
}
Deno.serve(async(request:Request)=>{
 const url=new URL(request.url);
 if(request.method==='GET'){
  const verify=env('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  if(verify&&url.searchParams.get('hub.mode')==='subscribe'&&url.searchParams.get('hub.verify_token')===verify)
   return new Response(url.searchParams.get('hub.challenge')||'',{headers:{'Cache-Control':'no-store'}});
  return new Response('Forbidden',{status:403});
 }
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'Operación no disponible.'},405);
 if(request.headers.get('x-hub-signature-256')){
  try{
   if(Number(request.headers.get('content-length')||0)>2000000)return new Response('Payload too large',{status:413});
   const raw=await request.text();
   if(raw.length>2000000||!await signed(raw,request.headers.get('x-hub-signature-256')||'',env('META_APP_SECRET')))
    return new Response('Forbidden',{status:403});
   const event=JSON.parse(raw);
   if(event.object!=='whatsapp_business_account')return new Response('OK');
   for(const entry of event.entry||[]){
    for(const change of entry.changes||[]){
     const value=change.value||{};
     if(change.field==='messages'){
      for(const status of value.statuses||[]){
       await rpc('enjoy_whatsapp_server','webhook',{
        field:'messages',accountId:String(entry.id),phoneId:String(value.metadata?.phone_number_id||''),
        messageId:String(status.id||''),status:String(status.status||'')
       });
      }
     }else if(change.field==='message_template_status_update'){
      await rpc('enjoy_whatsapp_server','webhook',{field:change.field,accountId:String(entry.id),
       templateName:String(value.message_template_name||''),status:String(value.event||'')});
     }else if(change.field==='account_update'){
      await rpc('enjoy_whatsapp_server','webhook',{field:change.field,accountId:String(entry.id),event:String(value.event||'')});
     }
     // Contact/history synchronization events are acknowledged without persisting their content.
    }
   }
   return new Response('OK');
  }catch{return new Response('Processing failed',{status:500});}
 }
 if(request.headers.get('origin')!==SITE)return reply({error:'Origen no autorizado.'},403);
 const authorization=request.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'Debe iniciar sesión.'},401);
 let attemptId='';
 try{
  if(Number(request.headers.get('content-length')||0)>20000)return reply({error:'Solicitud demasiado grande.'},413);
  const raw=await request.text();
  if(raw.length>20000)return reply({error:'Solicitud demasiado grande.'},413);
  const input=JSON.parse(raw);
  const userResponse=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{
   headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:authorization},signal:AbortSignal.timeout(15000)
  });
  const user=await userResponse.json();
  if(!userResponse.ok||!user.id)return reply({error:'Debe iniciar sesión.'},401);
  const config=await rpc('enjoy_whatsapp_server','settings',{});
  const ready=!!(env('META_APP_SECRET')&&env('WHATSAPP_WEBHOOK_VERIFY_TOKEN')&&config.app_id&&config.config_id&&config.api_version);
  if(input.action==='readiness')return reply({ready});
  if(!ready)return reply({error:'El administrador debe completar la activación de WhatsApp.'},409);
  if(input.action==='refresh'){
   if(!/^[0-9a-f-]{36}$/i.test(input.attemptId||''))return reply({error:'La autorización venció. Vuelva a intentarlo.'},400);
   await rpc('enjoy_whatsapp_server','authorize',{attemptId:input.attemptId,userId:user.id});
   attemptId=input.attemptId;
   const templateStatus=await prepareConnection(user.id);
   await rpc('enjoy_whatsapp_server','finish-refresh',{attemptId,userId:user.id});
   attemptId='';
   return reply({ok:true,templateStatus});
  }
  if(input.action!=='complete')return reply({error:'Operación no disponible.'},400);
  if(!/^[0-9a-f-]{36}$/i.test(input.attemptId||'')||typeof input.code!=='string'||input.code.length<10||input.code.length>8000
    ||!/^\d{4,40}$/.test(input.accountId||''))return reply({error:'La autorización no se completó. Vuelva a conectar.'},400);
  const context=await rpc('enjoy_whatsapp_server','authorize',{attemptId:input.attemptId,userId:user.id});
  attemptId=input.attemptId;
  const exchange=await fetch('https://graph.facebook.com/'+context.api_version+'/oauth/access_token',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:context.app_id,client_secret:env('META_APP_SECRET'),code:input.code}),
   signal:AbortSignal.timeout(20000)
  });
  const credential=await exchange.json();
  if(!exchange.ok||!credential.access_token)throw new SafeError('La autorización de Meta venció. Vuelva a conectar WhatsApp.');
  const token=credential.access_token;
  const proof=await graph(context.api_version,'debug_token?input_token='+encodeURIComponent(token),context.app_id+'|'+env('META_APP_SECRET'));
  if(!proof.data?.is_valid||String(proof.data.app_id)!==context.app_id)throw new SafeError('La autorización no pertenece a la aplicación de enjoy.');
  const accounts=proof.data.granular_scopes?.find((scope:any)=>scope.scope==='whatsapp_business_management')?.target_ids||[];
  if(!accounts.map(String).includes(String(input.accountId)))throw new SafeError('La cuenta seleccionada no está incluida en la autorización.');
  const phones=await graph(context.api_version,input.accountId+'/phone_numbers?fields=id,display_phone_number,is_on_biz_app,platform_type',token);
  const phone=input.phoneId?phones.data?.find((p:any)=>String(p.id)===String(input.phoneId)):
   phones.data?.length===1?phones.data[0]:null;
  if(!phone||phone.is_on_biz_app!==true||phone.platform_type!=='CLOUD_API')
   throw new SafeError('Conecte el número mediante la opción de WhatsApp Business en el asistente.');
  const expirations=[proof.data.expires_at,proof.data.data_access_expires_at].filter(value=>Number.isFinite(value)&&value>0);
  const expiresAt=expirations.length?new Date(Math.min(...expirations)*1000).toISOString():null;
  await rpc('enjoy_whatsapp_server','complete',{attemptId,phoneId:String(phone.id),accountId:String(input.accountId),
   phone:phone.display_phone_number,token,expiresAt,templateStatus:'PENDING'});
  attemptId='';
  const templateStatus=await prepareConnection(user.id);
  return reply({ok:true,templateStatus});
 }catch(error){
  if(attemptId)await rpc('enjoy_whatsapp_server','fail',{attemptId}).catch(()=>{});
  return reply({error:error instanceof SafeError?error.message:'No se pudo completar la conexión. Vuelva a intentarlo.'},400);
 }
});