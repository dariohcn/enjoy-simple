/* Authenticated role-specific workspace; uses existing server API and real records. */
(() => {
'use strict';
const baseRender=render,baseGo=go,baseModal=modal;
let identity='',vehicleId='',quoteId='',quoteLines=[],quotePhotos=[],quoteNo='',conditions='',saved=false;
const roleViews={admin:['adminHome','maintenanceReport','monitor','admin','catalogImport','orders','reminders','security','blog'],owner:['overview','dashboard','maintenanceReport','proforma','registration','calendar','orders','clients','vehicles','maintenance','requests','alerts','reminders','security','blog','indicators']};
permittedViews=function(){return roleViews[session?.role]||[];};
const lineCents=row=>Math.round(Number(row.price)*row.qty*100),sum=rows=>rows.reduce((n,row)=>n+lineCents(row),0)/100;
const catalog=()=>[...(data?.services||[]).filter(x=>x.active!==false).map(x=>({key:'s:'+x.id,id:x.id,kind:'service',name:x.name,serviceType:x.serviceType||'Diagnóstico',price:Math.round(total(x)*100)/100,unit:'Servicio'})),...(data?.products||[]).filter(x=>x.active).map(x=>({key:'p:'+x.id,id:x.id,kind:'product',name:x.name,price:Number(x.price),unit:x.attributes?.unit||'Unidad'}))];
const permitted=v=>!!session&&(roleViews[session.role]||[]).includes(v);
icons.blog='<path d="M5 4h11a3 3 0 0 1 3 3v13H7a2 2 0 0 1-2-2V4zm0 13h14M9 8h6m-6 4h6"/>';
const blogTime=new Intl.DateTimeFormat('es-EC',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Guayaquil'});
function blogByline(post){
 return '<p class="blog-meta">'+esc(post.name)+' · <time datetime="'+esc(post.created)+'">'+esc(blogTime.format(new Date(post.created)))+'</time></p>';
}

function wireBlog(){
 const root=$('#enjoy-blog');
 const account=session;
 const feed=root.querySelector('[data-blog-feed]');
 const topicForm=root.querySelector('[data-blog-new]');
 const replyForm=root.querySelector('[data-blog-reply]');
 const status=root.querySelector('[data-blog-status]');
 const pending=new WeakMap();
 let topicId='',rows=[],before='',hasMore=false,sequence=0;
 const active=()=>root.isConnected&&session===account;

 async function loadBlog({more=false,focus=false}={}){
  const request=++sequence;
  const currentTopic=topicId;
  status.textContent='Cargando…';
  const moreButton=feed.querySelector('[data-blog-more]');
  if(moreButton)moreButton.disabled=true;
  try{
   const result=await api(currentTopic?'blog-topic':'blog-list',{topic:currentTopic,before:more?before:''});
   if(!active()||request!==sequence)return;
   const page=result.items.slice(0,15);
   rows=more?rows.concat(page):page;
   hasMore=result.items.length>15;
   before=page.at(-1)?.cursor||'';
   const topic=result.topic;
   replyForm.hidden=!topic;
   const entries=rows.map(post=>'<article class="card blog-entry">'+blogByline(post)+
    (topic?'':'<h3><button type="button" class="blog-title" data-blog-topic="'+esc(post.id)+'">'+esc(post.title)+'</button></h3>')+
    '<p class="blog-entry-body">'+esc(post.body)+'</p></article>').join('');
   feed.innerHTML=(topic?'<button type="button" class="btn secondary" data-blog-back>← Todos los temas</button>'+
    '<article class="card blog-entry blog-topic"><h2 tabindex="-1">'+esc(topic.title)+'</h2>'+blogByline(topic)+
    '<p class="blog-entry-body">'+esc(topic.body)+'</p></article><h3>Respuestas</h3>':
    '<h2 tabindex="-1">Temas de la comunidad</h2>')+
    (entries||'<p class="blog-empty">'+(topic?'Sé la primera persona en responder.':'Todavía no hay temas. Comparte la primera consulta.')+'</p>')+
    (hasMore?'<button type="button" class="btn secondary" data-blog-more>Ver más</button>':'');
   if(focus)feed.querySelector('h2')?.focus();
   status.textContent='';
  }catch{
   if(!active()||request!==sequence)return;
   status.textContent='No se pudo cargar la conversación.';
   if(moreButton)moreButton.disabled=false;
   feed.querySelector('[data-blog-retry]')?.remove();
   feed.insertAdjacentHTML('afterbegin','<button type="button" class="btn secondary" data-blog-retry>Reintentar</button>');
  }
 }

 function openTopic(id){
  topicId=id;
  rows=[];
  before='';
  topicForm.hidden=!!id;
  replyForm.hidden=true;
  feed.innerHTML=id?'<button type="button" class="btn secondary" data-blog-back>← Todos los temas</button>':'';
  if(replyForm.dataset.topic!==id)replyForm.reset();
  replyForm.dataset.topic=id;
  loadBlog({focus:true});
 }

 feed.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.blogTopic)openTopic(button.dataset.blogTopic);
  if(button.hasAttribute('data-blog-back'))openTopic('');
  if(button.hasAttribute('data-blog-more'))loadBlog({more:true});
  if(button.hasAttribute('data-blog-retry'))loadBlog();
 });

 async function publish(event){
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector('[type="submit"]');
  if(button.disabled)return;
  const message=form.elements.body.value.trim();
  const title=form.elements.title?.value.trim()||'';
  const target=form===replyForm?form.dataset.topic:'';
  if(!message||(!target&&!title)){
   status.textContent='Completa los campos para publicar.';
   return;
  }
  const key=JSON.stringify([target,title,message]);
  if(pending.get(form)?.key!==key)pending.set(form,{key,id:crypto.randomUUID()});
  const attempt=pending.get(form);
  button.disabled=true;
  try{
   const result=await api('blog-publish',{id:attempt.id,topic:target,title,body:message});
   if(!active())return;
   pending.delete(form);
   if((form===topicForm||form.dataset.topic===target)&&form.elements.body.value.trim()===message&&
      (form.elements.title?.value.trim()||'')===title)form.reset();
   if(form===topicForm&&topicId==='')openTopic(result.id);
   if(form===replyForm&&topicId===target)loadBlog();
  }catch(error){
   if(active()&&(form===topicForm?topicId==='':topicId===target))status.textContent=error.message||'No se pudo publicar. Intenta de nuevo.';
  }finally{
   button.disabled=false;
  }
 }
 topicForm.addEventListener('submit',publish);
 replyForm.addEventListener('submit',publish);
 loadBlog();
}

function blogChatMarkup(){
 return `<div class="blog-chat">
  <div class="blog-chat-panel" id="blog-chat-panel" role="region" aria-labelledby="blog-chat-title">
   <div class="blog-chat-heading"><div><h2 id="blog-chat-title">Chat general</h2><p>Preguntas e inquietudes de la comunidad</p></div>
   </div>
   <div class="blog-chat-messages" role="log" aria-label="Mensajes" tabindex="0"></div>
   <form class="blog-chat-compose">
    <label for="blog-chat-message">Mensaje</label>
    <div class="blog-chat-compose-row"><textarea id="blog-chat-message" class="form-control" name="message" rows="2" maxlength="2000" placeholder="Escribe tu consulta…" required></textarea>
     <button type="submit" class="btn btn-primary">Enviar</button></div>
    <p class="blog-chat-status" role="status"></p>
   </form>
  </div>
 </div>`;
}

function wireBlogChat(){
 const chat=$('#enjoy-blog .blog-chat');
 const account=session;
 const messages=chat.querySelector('[role="log"]');
 const status=chat.querySelector('[role="status"]');
 const form=chat.querySelector('form');
 const input=form.elements.message;
 const submit=form.querySelector('button');
 const timestamp=new Intl.DateTimeFormat('es-EC',{dateStyle:'short',timeStyle:'short',timeZone:'America/Guayaquil'});
 let timer,requestId=0,pendingDelivery,lastMarkup='';
 const active=()=>chat.isConnected&&session===account;
 function schedule(){
  clearTimeout(timer);
  if(active())timer=setTimeout(loadMessages,25000);
 }
 async function loadMessages(){
  clearTimeout(timer);
  if(!active())return;
  if(document.hidden){schedule();return;}
  const current=++requestId;
  try{
   const result=await api('chat-list',{recipient:''});
   if(!active()||current!==requestId)return;
   const markup=(result.messages||[]).map(message=>
    '<article class="blog-chat-message'+(message.mine?' mine':'')+'"><strong>'+esc(message.name)+'</strong>'+
    '<p>'+esc(message.body)+'</p><small>'+esc(timestamp.format(new Date(message.created)))+'</small></article>'
   ).join('')||'<p class="blog-chat-empty">Todavía no hay mensajes.</p>';
   if(markup!==lastMarkup){
    const atEnd=lastMarkup===''||messages.scrollHeight-messages.scrollTop-messages.clientHeight<65;
    messages.innerHTML=markup;
    lastMarkup=markup;
    if(atEnd)messages.scrollTop=messages.scrollHeight;
   }
  }catch{
   if(active()&&current===requestId&&lastMarkup==='')messages.textContent='No se pudieron cargar los mensajes. Se volverá a intentar.';
  }finally{
   if(current===requestId)schedule();
  }
 }
 loadMessages();
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const body=input.value.trim();
  if(!active()||!body||submit.disabled)return;
  if(pendingDelivery?.body!==body)
   pendingDelivery={body,recipient:'',nonce:crypto.randomUUID()};
  submit.disabled=true;
  status.textContent='Enviando…';
  try{
   await api('chat-send',pendingDelivery);
   pendingDelivery=null;
   if(input.value.trim()===body)input.value='';
   status.textContent='';
   if(active()){await loadMessages();messages.scrollTop=messages.scrollHeight;}
  }catch{
   status.textContent='No se pudo enviar el mensaje. Intenta de nuevo.';
  }finally{
   submit.disabled=false;
  }
 });
}

function blogPage(){
 return head('Blog','Comparte inquietudes y conversa con otros usuarios de enjoy.')+
  `<section id="enjoy-blog" class="blog-layout">
   <div class="blog-discussion">
    <form class="card integration-pad blog-compose" data-blog-new>
     <h2>Publicar un tema</h2>
     <label>Título<input class="form-control" name="title" maxlength="120" required></label>
     <label>¿Qué quieres compartir?<textarea class="form-control" name="body" rows="4" maxlength="3000" required></textarea></label>
     <button class="btn btn-primary" type="submit">Publicar tema</button>
    </form>
    <p class="blog-feedback" data-blog-status role="status"></p>
    <div class="blog-feed" data-blog-feed></div>
    <form class="card integration-pad blog-compose" data-blog-reply hidden>
     <label>Escribe una respuesta<textarea class="form-control" name="body" rows="3" maxlength="3000" required></textarea></label>
     <button class="btn btn-primary" type="submit">Publicar respuesta</button>
    </form>
   </div>
   ${blogChatMarkup()}
  </section>`;
}
const menuScenes={monitor:[0,0],users:[1,0],catalogImport:[0,1],blog:[1,1],security:[0,2],calendar:[1,2],dashboard:[0,0]};
function menuPhoto(view){
 const scene=menuScenes[view];
 if(scene){
  const [column,row]=scene;
  return '<svg class="integration-card-photo" viewBox="'+(column*724+3)+' '+(row*362+3)+' 718 356" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><image href="assets/enjoy-menu-photography.jpg" width="1448" height="1086"/></svg>';
 }
 const filename={maintenanceReport:'clipboard',admin:'team',orders:'tools'}[view]||'repair';
 return '<img class="integration-card-photo" src="assets/integration-'+filename+'.jpg" alt="" loading="lazy">';
}
const ownerCards=[
 ['Registro','registration','clients','Registra clientes y vehículos'],
 ['Plan de mantenimiento','maintenanceReport','maintenance','Consulte por año, marca, modelo, versión y kilometraje'],
 ['Agendamiento','calendar','calendar','Organice las próximas citas del taller'],
 ['Abrir Orden','orders','services','Recepción y seguimiento de órdenes'],
 ['Panel de control','dashboard','indicators','Citas, mantenimientos y alarmas'],
 ['Blog','blog','blog','Novedades y guías para talleres']
];
const adminCards=[['Plan de mantenimiento','maintenanceReport','maintenance','Consultar repuestos y mano de obra'],['Panel de control','monitor','monitor','Indicadores de todos los talleres socios'],['Talleres','admin','directory','Solicitudes, permisos e IP de acceso'],['Importar catálogo','catalogImport','products','Excel y CSV por marca, tipo y región'],['Órdenes de la red','orders','services','Supervisar la operación de los talleres'],['Blog','blog','blog','Novedades y guías para talleres'],['Configuración','security','security','Cuenta y respaldo de administración']];
function home(){const admin=session.role==='admin',logo=admin?'':safeImage(data.workshopImage);return head(admin?'Administración':'Inicio',admin?'Gestione la red, los accesos y la oferta de los talleres.':'Seleccione una tarea para continuar.',admin?'':'<button type="button" class="btn secondary" data-integrated-view="security">Configuración de usuario</button>')+'<section class="integration-hero'+(admin?'':' integration-hero-workshop')+'"><div class="integration-identity">'+(logo?'<img src="'+esc(logo)+'" alt="Logo del taller" width="56" height="56">':'')+'<span>'+esc(session.workshop||(admin?'Administración de enjoy':'Mi taller'))+'</span></div><h2>'+(admin?'Una red conectada. Una gestión central.':'Su taller, en marcha.')+'</h2><p>'+(admin?'Catálogo, talleres y supervisión de la operación.':'Cada vehículo, cada servicio y cada visita en un mismo espacio.')+'</p></section><div class="integration-grid">'+(admin?adminCards:ownerCards).map(([name,v,icon,desc])=>'<button type="button" class="integration-tile" data-integrated-view="'+v+'">'+menuPhoto(v)+'<span class="integration-icon">'+liveIcon(icon)+'</span><strong>'+name+'</strong><small>'+desc+'</small><span class="integration-arrow">↗</span></button>').join('')+(admin?'<button type="button" class="integration-tile" data-action="logout"><span class="integration-icon">'+liveIcon('security')+'</span><strong>Cerrar sesión</strong><small>Salir de su cuenta de forma segura</small></button>':'')+'</div>';}

function loadStorageUsage(){
 const panel=$('#enjoy-storage-usage');
 if(!panel)return;
 const size=bytes=>new Intl.NumberFormat('es-EC',{maximumFractionDigits:2}).format(bytes/1048576)+' MiB';
 api('storage-usage').then(result=>{
  if(!panel.isConnected)return;
  panel.querySelector('[data-database-size]').textContent=size(result.databaseBytes);
  panel.querySelector('[data-quote-storage]').textContent=result.quoteCount+' · '+size(result.quoteBytes);
 }).catch(()=>{
  panel.querySelector('[data-database-size]').textContent='No disponible';
  panel.querySelector('[data-quote-storage]').textContent='No disponible';
 });
 fetch('https://api.github.com/repos/dariohcn/enjoy-simple',{credentials:'omit'}).then(response=>{
  if(!response.ok)throw Error();
  return response.json();
 }).then(repo=>{
  if(!Number.isFinite(repo.size))throw Error();
  panel.querySelector('[data-code-size]').textContent=size(repo.size*1024);
 }).catch(()=>{panel.querySelector('[data-code-size]').textContent='No disponible';});
}
function activeQuotes(){
 const cutoff=Date.now()-14*86400000;
 return (data.requests||[]).filter(row=>row.kind==='proforma'&&(!row.quoteSavedAt||Date.parse(row.quoteSavedAt)>cutoff));
}
async function savePlanQuote({id,plate,customer,lines,subtotal,iva,total,prepared}){
 const normalize=value=>String(value||'').trim().toLocaleLowerCase('es');
 const normalizePlate=value=>normalize(value).replace(/[^a-z0-9]/g,'');
 const unit=normalizePlate(plate)&&data.vehicles.find(v=>normalizePlate(v.plate)===normalizePlate(plate)&&normalize(client(v.clientId)?.name)===normalize(customer));
 if(!unit)throw Error('Seleccione un cliente y un vehículo registrados para guardar la proforma.');
 const quoteNumber='PRO-'+id.slice(0,8).toUpperCase();
 const record={id,kind:'proforma',quoteSource:'maintenance-plan',status:'draft',serviceType:'Mantenimiento preventivo',
  clientId:unit.clientId,vehicleId:unit.id,services:[],quoteNumber,quoteLines:lines,quoteSubtotal:subtotal,
  quoteDate:isoToday(),quoteSavedAt:new Date().toISOString(),quoteIva:iva,quoteTotal:total,quotePrepared:prepared};
 const currentData=data;
 await api('save',{collection:'requests',record});
 if(data===currentData)data.requests=[...(data.requests||[]).filter(row=>row.id!==id),record];
 return quoteNumber;
}
function maintenanceOptions(){
 return {clients:data.clients,vehicles:data.vehicles,savePlanQuote:session.role==='owner'?savePlanQuote:null,workshopLogo:safeImage(data.workshopImage),workshopName:session.workshop||(session.role==='admin'?'Administración de enjoy':'Taller de mecánica')};
}
function maintenanceReport(){return head('Plan de mantenimiento','Elija el tipo de vehículo y el catálogo para generar la proforma.')+window.EnjoyVehicleCatalog.planView();}
function options(){return '<option value="">Seleccione un vehículo</option>'+data.vehicles.map(v=>'<option value="'+esc(v.id)+'" '+(v.id===vehicleId?'selected':'')+'>'+esc(v.plate+' · '+v.brand+' '+v.model)+'</option>').join('');}
function rememberQuote(){if($('#iq-vehicle'))vehicleId=$('#iq-vehicle').value;if($('#iq-number'))quoteNo=$('#iq-number').value.trim();conditions=$('#iq-conditions')?.value.trim()||'';}
function savedQuotes(){return '<section class="card integration-pad"><h2>Proformas guardadas</h2><p>Disponibles durante 14 días desde el último guardado.</p>'+table(['Número','Fecha','Vehículo','Subtotal','Acción'],activeQuotes().map(r=>'<tr><td>'+esc(r.quoteNumber||r.id.slice(0,8))+'</td><td>'+esc(r.quoteDate)+'</td><td>'+esc(vehicle(r.vehicleId)?.plate||'')+'</td><td>'+money(Number(r.quoteSubtotal||0))+'</td><td><button class="btn secondary" data-iq-open="'+esc(r.id)+'">Abrir</button></td></tr>'))+'</section>';}
function quote(){return head('Proforma','Seleccione partidas del catálogo disponible para su taller.')+'<section class="card integration-pad"><div class="fields"><label>Vehículo<select class="form-select" id="iq-vehicle">'+options()+'</select></label><label>Número de proforma<input class="form-control" id="iq-number" maxlength="60" value="'+esc(quoteNo)+'" placeholder="PRO-0001"></label></div><div class="integration-picker"><label>Servicio o producto<select class="form-select" id="iq-catalog"><option value="">Seleccione una partida</option>'+['service','product'].map(kind=>'<optgroup label="'+(kind==='service'?'Servicios':'Productos y repuestos')+'">'+catalog().filter(x=>x.kind===kind).map(x=>'<option value="'+esc(x.key)+'">'+esc(x.name)+' · '+money(x.price)+' / '+esc(x.unit)+'</option>').join('')+'</optgroup>').join('')+'</select></label><label>Cantidad<input class="form-control" id="iq-qty" type="number" min="1" max="999" value="1"></label><button type="button" class="btn" data-iq-add>Agregar</button></div>'+table(['Detalle','Tipo','Cantidad','Precio','Importe','Acción'],quoteLines.map((x,i)=>'<tr><td>'+esc(x.name)+'</td><td>'+(x.kind==='service'?'Servicio':'Producto')+'</td><td>'+x.qty+'</td><td>'+money(x.price)+'</td><td>'+money(lineCents(x)/100)+'</td><td><button type="button" class="btn secondary" data-iq-remove="'+i+'">Quitar</button></td></tr>'))+'<div class="integration-total"><span>Subtotal</span><strong>'+money(sum(quoteLines))+'</strong></div><label>Condiciones<textarea id="iq-conditions" class="form-control" maxlength="1500">'+esc(conditions)+'</textarea></label><p>Confirme disponibilidad, compatibilidad e impuestos aplicables. Proforma, no factura.</p><div class="actions"><button class="btn" type="button" data-iq-save>Guardar proforma</button><button class="btn secondary" type="button" data-iq-print>Imprimir / PDF</button></div><p id="iq-save-status" role="status">'+(saved?'Proforma guardada en el sistema.':'')+'</p></section><section class="card integration-pad"><h2>Fotografías para el PDF</h2><p>Se incluyen al imprimir; las fotos permanecen en esta página y no se guardan en la base de datos.</p><input id="iq-photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple aria-label="Fotografías para la proforma"><div class="integration-photos">'+quotePhotos.map((p,i)=>'<figure><img src="'+p.url+'" alt="Fotografía '+(i+1)+'"><button type="button" class="btn secondary" data-iq-photo="'+i+'">Quitar</button></figure>').join('')+'</div><p>Para WhatsApp: guarde el PDF y adjúntelo como documento. No se envía automáticamente.</p></section>'+savedQuotes();}
let registrationQuery='';
function registrationRows(query){
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const normalizePlate=value=>normalize(value).replace(/[^a-z0-9]/g,'');
 const term=normalize(query),plateTerm=normalizePlate(query);
 const vehiclesByClient=new Map(data.clients.map(record=>[record.id,[]]));
 const unassigned=[];
 for(const vehicle of data.vehicles)(vehiclesByClient.get(vehicle.clientId)||unassigned).push(vehicle);
 const matchesVehicle=vehicle=>!term||normalize([vehicle.brand,vehicle.model].join(' ')).includes(term)||
  (plateTerm&&normalizePlate(vehicle.plate).includes(plateTerm));
 const vehicleList=vehicles=>vehicles.length?'<ul class="registration-vehicles">'+vehicles.map(vehicle=>
  '<li><strong>'+esc(vehicle.plate||'Sin placa')+'</strong> · '+esc([vehicle.brand,vehicle.model,vehicle.year].filter(Boolean).join(' '))+
  '<div class="actions">'+button('Editar vehículo','vehicle',vehicle.id,true)+
  ' <button type="button" class="btn secondary" data-iq-select="'+esc(vehicle.id)+'">Preparar proforma</button></div></li>').join('')+
  '</ul>':'<span>Sin vehículos registrados</span>';
 const rows=data.clients.flatMap(record=>{
  const vehicles=vehiclesByClient.get(record.id);
  const matchesClient=!term||normalize(record.name).includes(term);
  const shown=matchesClient?vehicles:vehicles.filter(matchesVehicle);
  if(!matchesClient&&!shown.length)return [];
  return ['<tr><td><strong>'+esc(record.name)+'</strong><small>'+[record.phone,record.email].filter(Boolean).map(esc).join(' · ')+'</small></td>'+
   '<td>'+vehicleList(shown)+'</td><td><div class="actions">'+button('Ver historial','profile',record.id,true)+' '+
   button('Editar cliente','client',record.id,true)+' <button type="button" class="btn secondary" data-register-vehicle="'+esc(record.id)+'">Agregar vehículo</button></div></td></tr>'];
 });
 const otherVehicles=unassigned.filter(matchesVehicle);
 if(otherVehicles.length)rows.push('<tr><td>Vehículos sin cliente vinculado</td><td>'+vehicleList(otherVehicles)+'</td><td></td></tr>');
 return rows.length?table(['Cliente','Vehículos','Acciones del cliente'],rows):
  '<p role="status">'+(term?'No hay clientes ni vehículos que coincidan.':'Todavía no hay fichas registradas.')+'</p>';
}
function registration(){
 return head('Registro','Gestiona las fichas de clientes y sus vehículos.',button('Registrar cliente','client'))+
  '<section class="card integration-pad"><form id="integration-registration-search" class="registration-search">'+
  '<label>Buscar por cliente, placa o marca<input type="search" class="form-control" name="query" value="'+esc(registrationQuery)+'"></label>'+
  '<button class="btn" type="submit">Buscar</button></form>'+
  '<div id="integration-results">'+registrationRows(registrationQuery)+'</div></section>';
}
function importView(){return head('Importar catálogo','Administre las marcas y cargue tarifas diferenciadas por tipo y región.')+window.EnjoyVehicleCatalog.adminView();}
function parseCSV(input){let rows=[],row=[],cell='',quoted=false;const separator=input.split(/\r?\n/)[0].includes(';')?';':',';for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===separator&&!quoted){row.push(cell.trim());cell='';}else if(c==='\n'&&!quoted){row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw Error('Hay comillas sin cerrar.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);const headers=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').toLowerCase());const keys=['codigo','tipo','nombre','categoria','precio'];if(keys.some(k=>!headers.includes(k)))throw Error('Faltan columnas obligatorias.');if(!rows.length||rows.length>500)throw Error('Cargue de 1 a 500 filas.');const codes=new Set();return rows.map((r,i)=>{const get=k=>r[headers.indexOf(k)]||'',type={servicio:'service',producto:'product',repuesto:'product'}[get('tipo').toLowerCase()],price=get('precio'),code=get('codigo');if(!type||!code||!get('nombre')||!get('categoria')||!/^\d+(\.\d{1,2})?$/.test(price))throw Error('Revise la fila '+(i+2)+'.');const serviceType=get('tipo_servicio'),estimatedMinutes=get('duracion')||'60';if(type==='service'&&(!serviceTypes.includes(serviceType)||!/^\d+$/.test(estimatedMinutes)||Number(estimatedMinutes)<15||Number(estimatedMinutes)>480))throw Error('Revise tipo_servicio y duracion en la fila '+(i+2)+'.');const key=type+':'+code;if(codes.has(key))throw Error('Código repetido en la fila '+(i+2)+'.');codes.add(key);return {code,type,name:get('nombre'),category:get('categoria'),price,serviceType,estimatedMinutes};});}
function printQuote(){rememberQuote();const v=vehicle(vehicleId);if(!v||!quoteLines.length)return toast('Seleccione un vehículo y al menos una partida.');$('#integration-print')?.remove();const record=activeQuotes().find(r=>r.id===quoteId);const page=document.createElement('section');page.id='integration-print';page.innerHTML='<h1>'+esc(session.workshop)+'</h1><h2>Proforma '+esc(quoteNo)+'</h2><p>'+esc(record?.quoteDate||isoToday())+' · '+esc(client(v.clientId)?.name)+' · '+esc(v.plate+' · '+v.brand+' '+v.model)+'</p>'+table(['Detalle','Cantidad','Precio','Importe'],quoteLines.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.qty+'</td><td>'+money(x.price)+'</td><td>'+money(lineCents(x)/100)+'</td></tr>'))+'<h3>Subtotal: '+money(sum(quoteLines))+'</h3><p>'+esc(conditions)+'</p>'+(record?.quoteIva!=null?'<p>IVA ('+esc(record.quoteIva)+' %): '+money(Math.round(sum(quoteLines)*record.quoteIva)/100)+'</p><h3>Total: '+money(sum(quoteLines)+Math.round(sum(quoteLines)*record.quoteIva)/100)+'</h3><p>Elaborado por '+esc(record.quotePrepared||'—')+'</p>':'<p>Proforma, no factura. Impuestos por confirmar.</p>')+quotePhotos.map((p,i)=>'<figure><img src="'+p.url+'" alt="Foto '+(i+1)+'"><figcaption>Fotografía '+(i+1)+'</figcaption></figure>').join('');document.body.append(page);window.print();}
function appointmentFields(){
 const form=$('#form');
 if(!form?.querySelector('[name="time"]')||form.querySelector('[data-appointment-extras]'))return;
 const record=data.appointments.find(a=>a.id===editContext.id)||{};
 const extra=document.createElement('div');
 extra.className='full';
 extra.dataset.appointmentExtras='';
 extra.innerHTML=`<label class="integration-check"><input type="checkbox" name="followsProforma" value="true"> Mantenimiento según proforma</label>
  <label data-appointment-quote hidden>Proforma guardada (opcional)<select name="proformaId" class="form-select"></select><small data-appointment-quote-help hidden>Guarde la proforma desde Plan de mantenimiento para el cliente y vehículo de esta cita.</small></label>
  <label>Fotos del estado del vehículo (máximo 4)<input class="form-control" type="file" data-appointment-photos accept="image/jpeg,image/png,image/webp" multiple></label>
  <p data-photo-feedback role="status"></p><div class="integration-photos" data-photo-preview></div>`;
 const products=catalog().filter(x=>x.kind==='product');
 if(products.length)extra.insertAdjacentHTML('beforeend','<fieldset><legend>Productos asociados (opcional)</legend>'+products.map(p=>'<label class="integration-check"><input type="checkbox" data-iap="'+esc(p.id)+'"><span>'+esc(p.name)+'</span><input type="number" class="form-control" value="1" min="1" max="999" data-iap-qty="'+esc(p.id)+'" aria-label="Cantidad de '+esc(p.name)+'"></label>').join('')+'</fieldset>');
 form.querySelector('.fields').append(extra);
 const kind=form.elements.serviceType;
 const clientField=form.elements.clientId,vehicleField=form.elements.vehicleId;
 const follows=form.elements.followsProforma,quote=form.elements.proformaId;
 const file=extra.querySelector('[data-appointment-photos]'),preview=extra.querySelector('[data-photo-preview]'),feedback=extra.querySelector('[data-photo-feedback]');
 let photos=[],photosChanged=false,processing=false;
 const originalService=record.catalogueServiceId||record.serviceId||'';
 follows.checked=String(record.followsProforma)==='true';
 function syncQuotes(chosen=''){
  quote.closest('label').hidden=!follows.checked;
  quote.disabled=!follows.checked;
  const options=activeQuotes().filter(r=>r.clientId===clientField.value&&r.vehicleId===vehicleField.value);
  quote.replaceChildren(new Option(options.length?'Sin vincular una proforma guardada':'Sin proformas guardadas para este vehículo',''),...options.map(r=>new Option(r.quoteNumber||('Proforma '+r.id.slice(0,8)),r.id)));
  quote.value=options.some(r=>r.id===chosen)?chosen:'';
  extra.querySelector('[data-appointment-quote-help]').hidden=options.length>0;
 }
 queueMicrotask(()=>syncQuotes(record.proformaId));
 follows.addEventListener('change',()=>syncQuotes(quote.value));
 form.addEventListener('input',event=>{if(event.target.matches('[data-appointment-client], [name="vehicleId"]'))syncQuotes(quote.value);});
 form.addEventListener('click',event=>{if(event.target.closest('[data-appointment-client-option]'))syncQuotes(quote.value);});
 function paintPhotos(){
  preview.innerHTML=photos.map((photo,index)=>'<figure><img src="'+esc(photo)+'" alt="Foto del vehículo '+(index+1)+'"><button type="button" class="btn secondary" data-remove-photo="'+index+'">Quitar</button></figure>').join('');
 }
 if(record.id){
  file.disabled=true;
  api('appointment-details-read',{id:record.id}).then(result=>{
   if(!extra.isConnected)return;
   photos=(result.photos||[]).filter(photo=>safeImage(photo));
   paintPhotos();
   file.disabled=false;
  }).catch(()=>{if(extra.isConnected)feedback.textContent='No se pudieron cargar las fotos guardadas. Vuelva a abrir la cita para intentarlo de nuevo.';});
 }
 file.addEventListener('change',async()=>{
  const selected=[...file.files];
  file.value='';
  if(!selected.length||processing)return;
  if(photos.length+selected.length>4){feedback.textContent='Puede adjuntar hasta cuatro fotos. Quite una antes de agregar otra.';return;}
  processing=true;
  file.disabled=true;
  feedback.textContent='Preparando fotos…';
  try{
   const additions=[];
   for(const image of selected){
    const photo=await optimizedImage(image);
    if(photo.length>75000)throw Error('Seleccione una foto de menor tamaño.');
    additions.push(photo);
   }
   photos.push(...additions);
   photosChanged=true;
   paintPhotos();
   feedback.textContent='';
  }catch(error){feedback.textContent=error.message;}
  finally{processing=false;file.disabled=false;}
 });
 preview.addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-photo]');
  if(!button||processing)return;
  photos.splice(Number(button.dataset.removePhoto),1);
  photosChanged=true;
  feedback.textContent='';
  paintPhotos();
 });
 let oldProducts=record.associatedProducts||[];
 try{if(typeof oldProducts==='string')oldProducts=JSON.parse(oldProducts);}catch{oldProducts=[];}
 const productInputs=[...extra.querySelectorAll('[data-iap]')];
 const quantities=new Map([...extra.querySelectorAll('[data-iap-qty]')].map(input=>[input.dataset.iapQty,input]));
 for(const p of oldProducts){const input=productInputs.find(el=>el.dataset.iap===p.id);if(input){input.checked=true;quantities.get(p.id).value=p.qty;}}
 const previous=form.onsubmit;
 form.onsubmit=async event=>{
  event.preventDefault();
  if(processing){feedback.textContent='Espere a que se preparen las fotos.';return;}
  const associated=[];
  for(const input of productInputs.filter(el=>el.checked)){
   const product=products.find(p=>p.id===input.dataset.iap),qty=Number(quantities.get(input.dataset.iap).value);
   if(!product||!Number.isInteger(qty)||qty<1||qty>999)return toast('Revise las cantidades.');
   associated.push({...product,qty});
  }
  const hidden=(name,value)=>{
   let input=extra.querySelector('[name="'+name+'"]');
   if(value===undefined){input?.remove();return;}
   if(!input){input=document.createElement('input');input.type='hidden';input.name=name;extra.append(input);}
   input.value=value;
  };
  hidden('serviceId',record.serviceId||'');
  hidden('catalogueServiceId',record.catalogueServiceId);
  hidden('catalogueServiceName',record.catalogueServiceName);
  hidden('associatedProducts',JSON.stringify(associated));
  hidden('reason',(follows.checked?'Mantenimiento según proforma':record.serviceType===kind.value&&!originalService&&!record.followsProforma?record.reason||kind.value:kind.value));
  hidden('vehiclePhotos',photosChanged?JSON.stringify(photos):undefined);
  return previous.call(form,event);
 };
}
modal=function(...args){const result=baseModal(...args);if(session?.role==='owner'&&editContext.action==='appointment')appointmentFields();return result;};
const previousOrderPending=renderOrderPending;
renderOrderPending=function(){if(!session)return;const actual=view;if(actual==='dashboard')view='overview';try{if(['overview','monitor'].includes(view)&&!$('#contenido .workbench-strip')&&!$('#contenido .live-title'))return;return previousOrderPending();}finally{view=actual;}};
const baseAppointmentCard=appointmentCard;
appointmentCard=function(a){const html=baseAppointmentCard(a);let products=a.associatedProducts||[];try{if(typeof products==='string')products=JSON.parse(products);}catch{products=[];}const extra=(String(a.followsProforma)==='true'?'<p>Mantenimiento según proforma</p>':'')+(a.catalogueServiceName?'<p>Servicio: '+esc(a.catalogueServiceName)+'</p>':'')+(Array.isArray(products)&&products.length?'<p>Productos: '+products.map(p=>esc(p.name)+' × '+Number(p.qty)).join(' · ')+'</p>':'');return html.replace('</article>',()=>'<div class="integration-appointment-detail">'+extra+'</div></article>');};
go=function(next){if(!permitted(next))return toast('Esta sección no está disponible para su perfil.');return baseGo(next);};
Object.assign(names,{orders:['','Órdenes de trabajo'],blog:['','Blog'],monitor:['','Panel de control'],adminHome:['','Administración'],overview:['','Inicio'],dashboard:['','Panel de control'],proforma:['','Proforma'],registration:['','Registro'],catalogImport:['','Importar catálogo'],maintenanceReport:['','Plan de mantenimiento']});
render=function(){
 if(!session)return baseRender();
 if(identity!==session.email){identity=session.email;registrationQuery='';quotePhotos.forEach(p=>URL.revokeObjectURL(p.url));quotePhotos=[];quoteLines=[];vehicleId='';quoteId='';saved=false;quoteNo='';conditions='';if(session.role==='admin')view='adminHome';}
 if(!permitted(view))view=session.role==='admin'?'adminHome':'overview';
 const requested=view,custom=['adminHome','dashboard','maintenanceReport','proforma','registration','catalogImport','blog'].includes(requested);
 if(custom)view=requested==='dashboard'?'overview':'security';
 baseRender();view=requested;if(!data)return;
 if(requested==='adminHome'||(requested==='overview'&&session.role==='owner'))$('#contenido').innerHTML=home();
 if(requested==='adminHome'){
  $('#contenido').insertAdjacentHTML('beforeend','<section class="card integration-pad" id="enjoy-storage-usage"><h2>Almacenamiento</h2><dl><dt>Repositorio de código</dt><dd data-code-size>Cargando…</dd><dt>Base de datos</dt><dd data-database-size>Cargando…</dd><dt>Proformas guardadas</dt><dd data-quote-storage>Cargando…</dd></dl></section>');
  loadStorageUsage();
 }
 if(requested==='maintenanceReport'){$('#contenido').innerHTML=maintenanceReport();window.EnjoyVehicleCatalog.wirePlan(maintenanceOptions());}
 if(requested==='blog'){$('#contenido').innerHTML=blogPage();wireBlog();wireBlogChat();}
 if(requested==='proforma')$('#contenido').innerHTML=quote();
 if(requested==='dashboard'){$('#contenido').innerHTML=window.EnjoyVehicleCatalog.dashboard();window.EnjoyVehicleCatalog.wireDashboard();}
 if(requested==='calendar'&&session.role==='owner')$('#contenido').insertAdjacentHTML('afterbegin','<div data-vehicle-alarms>'+window.EnjoyVehicleCatalog.alarmBanner()+'</div>');
 if(session.role==='owner')window.EnjoyVehicleCatalog.checkAlarms();
 if(requested==='registration'){
  $('#contenido').innerHTML=registration();
  $('#integration-registration-search').addEventListener('submit',event=>{
   event.preventDefault();
   registrationQuery=event.currentTarget.elements.query.value;
   $('#integration-results').innerHTML=registrationRows(registrationQuery);
   labelTables();
  });
 }
 if(requested==='catalogImport'){$('#contenido').innerHTML=importView();window.EnjoyVehicleCatalog.wireAdmin();}
 if(session.role==='admin'&&requested==='services')$('#contenido').innerHTML=head('Servicios centrales','La oferta publicada se refleja en todos los talleres autorizados.','<button class="btn" data-central-service>Nuevo servicio central</button>')+table(['Código','Servicio','Tipo','Precio','Acción'],data.services.filter(s=>s.central).map(s=>'<tr><td>'+esc(s.code)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.serviceType)+'</td><td>'+money(total(s))+'</td><td><button class="btn secondary" data-central-service="'+esc(s.id)+'">Editar</button></td></tr>'));
 $('#crumb').textContent=requested==='security'&&session.role==='owner'?'Configuración de usuario':names[requested]?.[1]||names.security[1];
 const entries=session.role==='admin'?[['Administración','adminHome'],...adminCards.map(c=>[c[0],c[1]])]:[...ownerCards.map(c=>[c[0],c[1]]),['Configuración de usuario','security']];
 $('#nav').innerHTML=entries.map(([label,v])=>'<button data-integrated-view="'+v+'" class="'+(v===requested?'active':'')+'" '+(v===requested?'aria-current="page"':'')+'>'+label+'</button>').join('')+'<button data-action="logout">Cerrar sesión</button>';
 $('#mobile-nav').innerHTML=(session.role==='admin'?[['Inicio','adminHome'],['Plan de mantenimiento','maintenanceReport'],['Panel','monitor'],['Talleres','admin']]:ownerCards.filter(c=>!['registration','blog'].includes(c[1])).map(c=>[c[0],c[1]])).map(([label,v])=>'<button data-integrated-view="'+v+'" '+(v===requested?'class="active" aria-current="page"':'')+'>'+label+'</button>').join('');
 if(!['overview','adminHome'].includes(requested)){
  const startView=session.role==='admin'?'adminHome':'overview';
  $('#contenido').insertAdjacentHTML('afterbegin','<button type="button" class="btn secondary integration-back" data-integrated-view="'+startView+'">← Volver al inicio</button>');
 }

 if(requested==='monitor'&&session.role==='admin')window.EnjoyVehicleCatalog.arrangeNetworkSummary();
 labelTables();
};
document.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b||!session||!data)return;
 if(b.dataset.integratedView)return go(b.dataset.integratedView);
 try{
 if(b.hasAttribute('data-central-service')&&session.role==='admin'){const s=data.services.find(x=>x.id===b.dataset.centralService)||{};editContext={action:'central-service',id:s.id||''};modal('Servicio central',field('Código','code',s.code||'')+field('Nombre','name',s.name||'')+field('Categoría','category',s.category||'')+field('Precio USD','price',s.id?total(s):0,'number')+select('Tipo de servicio','serviceType',serviceTypes.map(x=>({id:x,name:x})),s.serviceType||'Diagnóstico')+field('Duración en minutos','estimatedMinutes',s.estimatedMinutes||60,'number'),async values=>{if(s.code&&values.code!==s.code)throw Error('El código de un servicio existente no se puede cambiar.');await api('catalog-service-save',values);await refresh();toast('Servicio central publicado.');});return;}
 if(b.hasAttribute('data-import-catalog')&&session.role==='admin'){const file=$('#integration-csv').files[0];if(file&&file.size>1024*1024)throw Error('El archivo no debe superar 1 MB.');const items=parseCSV(file?await file.text():$('#integration-csv-text').value);b.disabled=true;const result=await api('catalog-import',{items});await refresh();toast(result.imported+' partidas cargadas.');return;}
 if(session.role!=='owner')return;
 if(b.hasAttribute('data-iq-open')){const r=activeQuotes().find(r=>r.id===b.dataset.iqOpen);if(!r||r.status!=='draft')throw Error('La proforma no está disponible para edición.');vehicleId=r.vehicleId;quoteId=r.id;quoteLines=(r.quoteLines||[]).map(x=>({...x}));quoteNo=r.quoteNumber||'';conditions=r.conditions||'';saved=true;quotePhotos.forEach(p=>URL.revokeObjectURL(p.url));quotePhotos=[];return go('proforma');}
 if(b.hasAttribute('data-iq-select')){vehicleId=b.dataset.iqSelect;quoteNo='';conditions='';quoteLines=[];quotePhotos.forEach(p=>URL.revokeObjectURL(p.url));quotePhotos=[];quoteId='';saved=false;return go('proforma');}
 if(b.hasAttribute('data-register-vehicle')&&data.clients.some(record=>record.id===b.dataset.registerVehicle))
  return openVehicleForm('',b.dataset.registerVehicle);
 if(b.hasAttribute('data-iq-add')){rememberQuote();const item=catalog().find(x=>x.key===$('#iq-catalog').value),qty=Number($('#iq-qty').value);if(!item||!Number.isInteger(qty)||qty<1||qty>999)throw Error('Seleccione una partida y una cantidad de 1 a 999.');if(quoteLines.length>=100)throw Error('Máximo 100 partidas.');quoteLines.push({...item,qty});saved=false;return render();}
 if(b.hasAttribute('data-iq-remove')){rememberQuote();quoteLines.splice(Number(b.dataset.iqRemove),1);saved=false;return render();}
 if(b.hasAttribute('data-iq-photo')){rememberQuote();URL.revokeObjectURL(quotePhotos.splice(Number(b.dataset.iqPhoto),1)[0].url);return render();}
 if(b.hasAttribute('data-iq-print'))return printQuote();
 if(b.hasAttribute('data-iq-save')){rememberQuote();const v=vehicle(vehicleId);if(!v||!quoteLines.length)throw Error('Seleccione un vehículo y agregue al menos una partida.');b.disabled=true;quoteId=quoteId||crypto.randomUUID();await api('save',{collection:'requests',record:{id:quoteId,kind:'proforma',clientId:v.clientId,vehicleId:v.id,status:'draft',serviceType:quoteLines.find(x=>x.kind==='service')?.serviceType||'Inspección',services:quoteLines.filter(x=>x.kind==='service').map(x=>x.id),quoteNumber:quoteNo,conditions,quoteLines,quoteSubtotal:sum(quoteLines),quoteDate:isoToday(),quoteSavedAt:new Date().toISOString(),quoteSource:activeQuotes().find(row=>row.id===quoteId)?.quoteSource,quoteIva:activeQuotes().find(row=>row.id===quoteId)?.quoteIva,quotePrepared:activeQuotes().find(row=>row.id===quoteId)?.quotePrepared}});saved=true;await refresh();toast('Proforma guardada en el sistema.');}
 }catch(error){toast(error.message);}finally{b.disabled=false;}
});
document.addEventListener('input',event=>{
 if(['iq-number','iq-conditions'].includes(event.target.id)){
  saved=false;
  const status=$('#iq-save-status');
  if(status)status.textContent='Cambios pendientes de guardar.';
 }
});
document.addEventListener('change',event=>{
 if(event.target.id==='iq-vehicle'){rememberQuote();quoteLines=[];quoteId='';saved=false;quotePhotos.forEach(p=>URL.revokeObjectURL(p.url));quotePhotos=[];render();}
 if(event.target.id==='iq-photos'){const files=[...event.target.files];if(files.length+quotePhotos.length>6||files.some(f=>f.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)))return toast('Máximo 6 fotos JPG, PNG o WebP de hasta 5 MB.');rememberQuote();quotePhotos.push(...files.map(f=>({url:URL.createObjectURL(f)})));render();}
});
document.addEventListener('click',event=>{if(event.target.closest('[data-action="logout"]')){quotePhotos.forEach(p=>URL.revokeObjectURL(p.url));quotePhotos=[];quoteLines=[];identity='';$('#integration-print')?.remove();}},true);
window.addEventListener('afterprint',()=>$('#integration-print')?.remove());
if(session&&data)render();
})();