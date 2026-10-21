/* Shared navigation and task-first composition for both account roles. */
function organizeEnjoyNavigation(){
 const nav=$('#nav'),buttons=new Map([...nav.querySelectorAll('button[data-view]')].map(b=>[b.dataset.view,b]));
 const groups=session.role==='admin'?[['SUPERVISIÓN',['monitor','orders']],['RED DE SOCIOS',['admin','users']],['COMUNIDAD Y CATÁLOGO',['products','chat']],['CONFIGURACIÓN',['reminders','security']]]:[['TRABAJO DIARIO',['overview','calendar','orders']],['CONTACTOS',['clients','vehicles']],['SERVICIOS Y REPUESTOS',['services','products','requests','maintenance']],['COMUNICACIÓN',['chat','alerts','reminders']],['CONFIGURACIÓN',['indicators','security']]];
 nav.replaceChildren();for(const [title,views]of groups){const group=document.createElement('div');group.className='enjoy-nav-group';const label=document.createElement('span');label.className='enjoy-nav-label';label.textContent=title;group.append(label);for(const v of views)if(buttons.has(v))group.append(buttons.get(v));nav.append(group);}
}
setNavigation=function(open,returnFocus=true){
 if(!session)return;const small=matchMedia('(max-width:1099px)').matches,expanded=small&&!!open,was=document.body.classList.contains('menu-open');
 document.body.classList.toggle('menu-open',expanded);$('#menu').setAttribute('aria-expanded',String(expanded));$('#sidebar').inert=small&&!expanded;$('.shell').inert=expanded;$('#menu').setAttribute('aria-label',expanded?'Cerrar navegación':'Abrir navegación');
 if(expanded)$('#drawer-close').focus();else if(was&&returnFocus&&small)$('#menu').focus();
};
function polishPending(){
 const box=$('#order-pending');if(!box||!session||!['monitor','overview'].includes(view))return;
 const admin=session.role==='admin',rows=admin?orderRows.filter(o=>(monitorWorkshop==='all'||o.workshop===monitorWorkshop)&&(monitorScope==='all'||(monitorScope==='demo'?o.is_demo:!o.is_demo))):orderRows,p=orderPending(rows);
 box.classList.add('enjoy-taskboard');box.innerHTML='<div class="enjoy-task-heading"><div><span class="enjoy-eyebrow">PRIORIDADES</span><h2>'+ (admin?'Seguimiento de la red':'Trabajo pendiente')+'</h2></div><button class="text-button" data-view="orders" data-order-pending-link>Ver todas las órdenes →</button></div>'+(orderError?'<p role="alert">No se pudieron consultar las órdenes. Abra Órdenes de trabajo y pulse Actualizar.</p>':!orderLoaded?'<p role="status">Consultando pendientes…</p>':'<div class="enjoy-task-grid">'+[['authorization','Por autorizar',p.authorization,'Presupuesto por confirmar'],['delivery','Listas para entregar',p.delivery,'Coordinar retiro del vehículo'],['overdue','Fuera de plazo',p.overdue,'Revisar fecha comprometida'],['open','En proceso',p.open,'Órdenes activas del taller']].map(([k,t,n,d])=>'<button data-enjoy-task="'+k+'"><span>'+t+'</span><strong>'+n+'</strong><small>'+d+'</small><span class="enjoy-task-arrow">↗</span></button>').join('')+'</div>');
 const main=$('#contenido'),heading=main.querySelector(admin?'.live-title':'.operation-heading');heading?.insertAdjacentElement('afterend',box);
}
const previousPendingRender=renderOrderPending;renderOrderPending=function(){previousPendingRender();polishPending();};
function arrangeEnjoyWorkspace(){
 if(!session)return;document.body.classList.add('enjoy-refined');organizeEnjoyNavigation();setNavigation(false,false);
 const main=$('#contenido'),strip=main.querySelector('.workbench-strip');if(strip){const table=main.querySelector('.workbench-table');if(table)table.insertAdjacentElement('beforebegin',strip);else main.append(strip);strip.querySelector('.workbench-strip-copy h2').textContent=session.role==='admin'?'Una red conectada, un mejor servicio':'Su taller, conectado con la red';}
 polishPending();
 // A placeholder is preferable to a car photograph unrelated to a trial spare part.
 if(view==='products'){main.querySelectorAll('.classified-product').forEach(card=>{if(/Producto de prueba de carga/.test(card.querySelector('h2')?.textContent||'')){const image=card.querySelector('.classified-product-image');image.innerHTML=liveIcon('products')+'<span>Imagen de producto pendiente</span>';card.classList.add('enjoy-incomplete-product');}});}
}
const renderBeforePolish=render;render=function(){renderBeforePolish();arrangeEnjoyWorkspace();};
document.addEventListener('click',e=>{const b=e.target.closest('[data-enjoy-task]');if(!b||!session)return;const kind=b.dataset.enjoyTask;orderStage=['authorization','delivery'].includes(kind)?kind:'';orderSpecialFilter=kind==='open'||kind==='overdue'?kind:'';orderQuery='';orderPage=1;if(session.role==='admin'){orderWorkshop=monitorWorkshop==='all'?'':monitorWorkshop;orderScope=monitorScope==='all'?'all':monitorScope==='demo'?'demo':'real';}go('orders');});
let orderSpecialFilter='';
const ordersBeforeTaskFilter=selectedOrders;selectedOrders=function(){const rows=ordersBeforeTaskFilter();return orderSpecialFilter==='open'?rows.filter(o=>!['delivered','cancelled'].includes(o.stage)):orderSpecialFilter==='overdue'?rows.filter(o=>o.due&&o.due<isoToday()&&!['delivered','cancelled'].includes(o.stage)):rows;};
const wireOrdersBeforePolish=wireOrders;wireOrders=function(){wireOrdersBeforePolish();if(orderSpecialFilter){$('#order-results')?.insertAdjacentHTML('beforebegin','<div id="order-special-filter" class="enjoy-filter-note">'+(orderSpecialFilter==='overdue'?'Órdenes fuera de plazo':'Órdenes en proceso')+'<button class="text-button" data-enjoy-clear-task>Quitar filtro ×</button></div>');}$('#order-stage')?.addEventListener('change',()=>{orderSpecialFilter='';$('#order-special-filter')?.remove();$('#order-results').innerHTML=ordersBody();labelTables();});};
document.addEventListener('click',e=>{if(e.target.closest('[data-enjoy-clear-task]')){orderSpecialFilter='';render();}});
matchMedia('(max-width:1099px)').addEventListener('change',()=>{if(session)setNavigation(false,false);});
newOrder=async function(appointmentId=''){
 if(session?.role!=='owner')return;
 if(!orderLoaded)await loadOrders();
 if(!data.clients.length||!data.vehicles.length)return toast('Registre primero el cliente y su vehículo.');
 const eligible=data.appointments.filter(a=>['scheduled','arrived'].includes(a.status)&&!orderRows.some(o=>o.appointment_id===a.id));
 const appointments='<label>Cita de origen (opcional)<select name="appointment_id" class="form-select"><option value="">Recepción sin cita previa</option>'+eligible.map(a=>'<option value="'+esc(a.id)+'" '+(a.id===appointmentId?'selected':'')+'>'+esc(a.date+' · '+a.time+' · '+(vehicle(a.vehicleId)?.plate||''))+'</option>').join('')+'</select></label>';
 modal('Recepción del vehículo',appointments+select('Cliente','client_id',data.clients)+select('Vehículo','vehicle_id',data.vehicles)+select('Tipo de servicio','service_type',serviceTypes.map(s=>({id:s,name:s})))+field('Trabajo solicitado','description')+field('Fecha comprometida (opcional)','due','','date',false),async b=>{
 const a=eligible.find(a=>a.id===b.appointment_id);await api('order-create',{...b,client_id:a?.clientId||b.client_id,vehicle_id:a?.vehicleId||b.vehicle_id});await loadOrders();data=await api('data');render();toast('Vehículo recibido. Orden creada y cita actualizada.');
 },'Recibir y crear orden');
 const form=$('#form'),source=form.querySelector('[name="appointment_id"]'),c=form.querySelector('[name="client_id"]'),v=form.querySelector('[name="vehicle_id"]');
 const vehicles=selected=>{v.innerHTML='<option value="">Seleccione un vehículo</option>'+data.vehicles.filter(x=>x.clientId===c.value).map(x=>'<option value="'+esc(x.id)+'" '+(selected===x.id?'selected':'')+'>'+esc(x.plate)+'</option>').join('');};
 const fill=()=>{const a=eligible.find(a=>a.id===source.value);c.disabled=!!a;v.disabled=!!a;if(a){c.value=a.clientId;vehicles(a.vehicleId);form.querySelector('[name="service_type"]').value=serviceTypes.includes(a.serviceType)?a.serviceType:'';form.querySelector('[name="description"]').value=a.reason||'';}else vehicles();};
 c.addEventListener('change',()=>vehicles());source.addEventListener('change',fill);fill();
};
const arrangeBeforeReception=arrangeEnjoyWorkspace;arrangeEnjoyWorkspace=function(){
 arrangeBeforeReception();if(session?.role!=='owner')return;
 if(['overview','calendar'].includes(view)){const heading=$('#contenido').querySelector('.operation-heading,.page-head,.agenda-top,.live-title');if(heading&&!heading.querySelector('[data-enjoy-receive]')){const button=document.createElement('button');button.type='button';button.className='btn secondary';button.dataset.enjoyReceive='';button.textContent='Recibir vehículo';heading.append(button);}}
 $('#contenido').querySelectorAll('[data-action="appointment"][data-id]').forEach(b=>{const a=data.appointments.find(a=>a.id===b.dataset.id);if(!a||!['scheduled','arrived'].includes(a.status)||b.parentElement.querySelector('[data-enjoy-receive]'))return;const linked=orderRows.find(o=>o.appointment_id===a.id);const button=document.createElement('button');button.className='text-button';button.type='button';button.dataset.enjoyReceive=a.id;button.textContent=linked?'Ver orden →':'Recibir vehículo →';b.insertAdjacentElement('afterend',button);});
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-enjoy-receive]');if(!b)return;const linked=orderRows.find(o=>o.appointment_id===b.dataset.enjoyReceive);if(linked){go('orders');openOrder(linked.id);}else newOrder(b.dataset.enjoyReceive||'');});
const stageApiBeforeSync=api;api=async function(path,body){const result=await stageApiBeforeSync(path,body);if(path==='order-stage'&&session?.role==='owner')data=await stageApiBeforeSync('data');return result;};
const goBeforePolish=go;go=function(next){const before=view;goBeforePolish(next);if(view!==before)window.scrollTo({top:0,behavior:'instant'});};
if(session&&data)render();
