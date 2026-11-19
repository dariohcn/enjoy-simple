const env=(key:string)=>Deno.env.get(key)||'';
async function rpc(name:string,body:unknown){
 const r=await fetch(env('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Database operation failed');return r.status===204?null:r.json();
}
async function authorized(value:string){
 if(value.length<32||value.length>256)return false;
 let expected=env('REMINDER_JOB_SECRET');
 if(!expected){try{expected=await rpc('enjoy_reminder_secret',{}) as string}catch{return false}}
 if(expected.length<32||expected.length!==value.length)return false;
 const e=new TextEncoder(),a=new Uint8Array(await crypto.subtle.digest('SHA-256',e.encode(value))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',e.encode(expected)));
 let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!await authorized(request.headers.get('x-job-secret')||''))return new Response('Unauthorized',{status:401});

 try{
  const jobs=await rpc('enjoy_claim_reminders',{live_mode:true}) as Array<{id:string;phone:string;phoneId:string;token:string;apiVersion:string;templateName:string;language:string;parameters:string[]}>;let accepted=0,review=0;
  await Promise.all(jobs.map(async(job)=>{
   let outcome='uncertain',provider_id:string|null=null,detail='No se confirmó la aceptación; requiere revisión manual.';
   try{
    const r=await fetch(`https://graph.facebook.com/${job.apiVersion}/${job.phoneId}/messages`,{method:'POST',headers:{Authorization:'Bearer '+job.token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:job.phone,type:'template',template:{name:job.templateName,language:{code:job.language},components:[{type:'body',parameters:job.parameters.map(text=>({type:'text',text:String(text||'')}))}]}}),signal:AbortSignal.timeout(15000)});
    const result=await r.json();
    if(r.ok&&typeof result.messages?.[0]?.id==='string'){outcome='accepted';provider_id=result.messages[0].id;detail='';accepted++}
    else if(r.status>=400&&r.status<500){outcome='failed';detail='El proveedor rechazó el mensaje. Revise la configuración y el destinatario.'}
   }catch{/* Los resultados inciertos no se repiten automáticamente. */}
   if(outcome!=='accepted')review++;
   await rpc('enjoy_finish_reminder',{job_id:job.id,outcome,provider_id,detail});
  }));
  return Response.json({mode:'workshop',accepted,review});
 }catch{return Response.json({error:'No se pudo completar el procesamiento.'},{status:500})}
});

