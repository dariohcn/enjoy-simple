/* Scoped work orders. Counts always use the same filtered rows as the table. */
const orderStages={reception:'Recepción',diagnosis:'Diagnóstico',authorization:'Por autorizar',repair:'Reparación',delivery:'Lista para entrega',delivered:'Entregada',cancelled:'Cancelada'};
let orderRows=[],orderLoaded=false,orderBusy=false,orderError='',orderIdentity='',orderClientId='',orderStage='',orderQuery='',orderWorkshop='',orderPage=1;
function workOrderDate(value){
 if(!value)return '—';
 const day=String(value);
 const time=new Date(/^\d{4}-\d{2}-\d{2}$/.test(day)?day+'T12:00:00-05:00':day);
 return Number.isNaN(time.getTime())?'—':time.toLocaleDateString('es-EC',{timeZone:'America/Guayaquil'});
}
function newestWorkOrderFirst(a,b){
 const received=order=>Date.parse(order.created)||0;
 return received(b)-received(a)||String(b.id).localeCompare(String(a.id));
}
function workPerformed(order){
 return (order.history||[]).filter(entry=>entry.stage==='delivery'&&entry.note).at(-1)?.note||'';
}
function selectedOrders(){return orderRows.filter(o=>(!orderStage||o.stage===orderStage)&&(!orderWorkshop||o.workshop===orderWorkshop)&&(!orderClientId||o.client_id===orderClientId||(!o.client_id&&o.client_name===client(orderClientId)?.name))&&normalizeWorkbenchText([o.client_name,o.plate,o.service_type,o.description,o.workshop_name].join(' ')).includes(normalizeWorkbenchText(orderQuery))).sort(newestWorkOrderFirst);}
function orderPending(rows){return {open:rows.filter(o=>!['delivered','cancelled'].includes(o.stage)).length,authorization:rows.filter(o=>o.stage==='authorization').length,delivery:rows.filter(o=>o.stage==='delivery').length,overdue:rows.filter(o=>o.due&&o.due<isoToday()&&!['delivered','cancelled'].includes(o.stage)).length};}
function ordersSummary(rows){const p=orderPending(rows);return '<div class="order-kpis">'+[['En proceso',p.open],['Por autorizar',p.authorization],['Listas para entrega',p.delivery],['Fecha comprometida vencida',p.overdue]].map(([label,n])=>'<div><span>'+label+'</span><strong>'+n+'</strong></div>').join('')+'</div>';}
function orderTable(){const rows=selectedOrders(),p=paginateWorkbenchRows(rows,orderPage);orderPage=p.current;return rows.length?table(session.role==='admin'?['Orden / taller','Cliente / vehículo','Servicio','Etapa / compromiso','Acción']:['Orden','Cliente / vehículo','Servicio','Etapa / compromiso','Acción'],p.rows.map(o=>'<tr><td><strong>OT-'+esc(o.id.slice(0,8).toUpperCase())+'</strong><small>'+esc(session.role==='admin'?o.workshop_name:workOrderDate(o.created))+(o.is_demo?' · Ejemplo':'')+'</small></td><td>'+esc(o.client_name)+'<small>'+esc(o.plate)+'</small></td><td>'+esc(o.service_type)+'<small>'+esc(o.description)+'</small></td><td><span class="badge">'+orderStages[o.stage]+'</span><small>'+ (o.due?date(o.due):'Sin fecha comprometida')+'</small></td><td><button class="text-button" data-order-open="'+o.id+'">Revisar →</button> <button type="button" class="text-button" data-order-print="'+esc(o.id)+'">Imprimir orden</button></td></tr>')).replace('class="card table-wrap"','class="card table-wrap order-matrix" role="region" aria-label="Órdenes de trabajo" tabindex="0"')+'<div class="workbench-pagination"><span>'+p.start+'–'+p.end+' de '+rows.length+'</span><div><button class="btn secondary" data-order-page="'+(p.current-1)+'" '+(p.current===1?'disabled':'')+'>Anterior</button><button class="btn secondary" data-order-page="'+(p.current+1)+'" '+(p.current===p.pages?'disabled':'')+'>Siguiente</button></div></div>':'<div class="workbench-empty"><h3>Sin órdenes en esta selección</h3><p>Las citas anteriores se conservan. Cree una orden cuando reciba un vehículo.</p></div>';}
function ordersPage(){return '<div class="live-title"><div><h1>Órdenes de trabajo</h1><p>Recepción → diagnóstico → autorización → reparación → entrega. Las órdenes cerradas se consultan en Entregadas.</p></div><div class="actions"><button class="btn secondary" data-order-delivered>Entregadas</button><button class="btn secondary" data-order-refresh>Actualizar</button>'+(session.role==='owner'?'<button class="btn" data-order-new>+ Nueva orden</button>':'')+'</div></div><div class="order-filters"><label>Buscar<input type="search" autocomplete="off" id="order-search" value="'+esc(client(orderClientId)?.name||orderQuery)+'" placeholder="Cliente, placa o servicio"><div class="nm-client-matches" id="order-client-matches" hidden><ul aria-label="Clientes que coinciden"></ul></div></label><label>Etapa<select id="order-stage"><option value="">Todas</option>'+Object.entries(orderStages).map(([k,v])=>'<option value="'+k+'" '+(orderStage===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+(session.role==='admin'?'<label>Taller<select id="order-workshop"><option value="">Toda la red</option>'+data.workshops.filter(w=>w.status==='approved'&&!w.deleted_at).map(w=>'<option value="'+w.id+'" '+(orderWorkshop===w.id?'selected':'')+'>'+esc(w.name)+'</option>').join('')+'</select></label>':'')+'</div><div id="order-results">'+ordersBody()+'</div>';}
function ordersBody(){return orderError?'<p role="alert">'+esc(orderError)+' · Pulse Actualizar para reintentar.</p>':!orderLoaded?'<p role="status">Cargando órdenes…</p>':ordersSummary(selectedOrders())+orderTable();}
let orderLoading;
function loadOrders(){
 if(!orderLoading)orderLoading=fetchWorkOrders().finally(()=>{orderLoading=null;});
 return orderLoading;
}
async function fetchWorkOrders(){if(orderBusy||!session)return;orderBusy=true;const identity=session.email;try{const rows=await api('order-list');if(session?.email!==identity)return;orderRows=rows;orderLoaded=true;orderError='';}catch(e){if(session?.email===identity)orderError=e.message;}finally{orderBusy=false;if(session?.email===identity){if(view==='orders'){const box=$('#order-results');if(box){box.innerHTML=ordersBody();labelTables();}}else renderOrderPending();}}}
function renderOrderPending(){document.querySelector('#order-pending')?.remove();if(!session||!['monitor','overview'].includes(view))return;const rows=session.role==='admin'?orderRows.filter(o=>(!monitorRegion&&!monitorProvince||data.workshops.some(w=>w.id===o.workshop&&coincideGeografiaRed(w,monitorRegion,monitorProvince)))&&(monitorWorkshop==='all'||o.workshop===monitorWorkshop)&&(monitorScope==='all'||(monitorScope==='demo'?o.is_demo:!o.is_demo))):orderRows,p=orderPending(rows);($('#contenido .workbench-strip')||$('#contenido .live-title')).insertAdjacentHTML('afterend','<section id="order-pending" class="order-pending"><div><h2>Pendientes de órdenes</h2><p>'+(orderError?'No se pudieron consultar las órdenes.':!orderLoaded?'Consultando órdenes…':p.open+' en proceso · '+p.authorization+' por autorizar · '+p.delivery+' listas para entrega · '+p.overdue+' vencidas')+'</p></div><button class="btn secondary" data-view="orders" data-order-pending-link>Revisar órdenes →</button></section>');}
function newOrder(){if(session.role!=='owner')return;if(!data.clients.length||!data.vehicles.length)return toast('Registre primero un cliente y su vehículo.');modal('Nueva orden de trabajo',select('Cliente','client_id',data.clients)+select('Vehículo','vehicle_id',data.vehicles)+select('Tipo de servicio','service_type',serviceTypes.map(s=>({id:s,name:s})))+field('Trabajo solicitado','description'),async b=>{await api('order-create',b);await loadOrders();toast('Orden creada en recepción.');});const c=$('#form [name="client_id"]'),v=$('#form [name="vehicle_id"]');c.addEventListener('change',()=>{v.innerHTML='<option value="">Seleccione un vehículo</option>'+data.vehicles.filter(x=>x.clientId===c.value).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.plate)+'</option>').join('');});}
function openOrder(id){const o=orderRows.find(x=>x.id===id);if(!o)return;const sequence=['reception','diagnosis','authorization','repair','delivery','delivered'],next=sequence[sequence.indexOf(o.stage)+1],editable=session.role==='owner'&&!['delivered','cancelled'].includes(o.stage);let body='<div class="order-detail"><p><strong>'+esc(o.client_name)+' · '+esc(o.plate)+'</strong></p><p>'+esc(o.service_type)+' · '+esc(o.description)+'</p><p>Etapa actual: <strong>'+orderStages[o.stage]+'</strong></p><ol class="order-history">'+o.history.map(h=>'<li><strong>'+orderStages[h.stage]+'</strong><small>'+new Date(h.at).toLocaleString('es-EC',{timeZone:'America/Guayaquil'})+' · '+esc(h.actor)+'</small><p>'+esc(h.note)+'</p></li>').join('')+'</ol></div>';if(o.stage==='reception'&&editable)body+='<p>Reprograme la cita desde Agendamiento. Al finalizar el trabajo, avance la orden hasta Entregada para consultarla en el historial de órdenes.</p>';if(editable)body+=select('Siguiente etapa','stage',[{id:next,name:orderStages[next]},{id:'cancelled',name:'Cancelar orden'}])+field(o.stage==='authorization'?'Referencia de autorización del cliente / responsable':next==='delivery'?'Trabajo realizado u observaciones':'Nota del cambio','note');else body+='<p>Consulta del historial. Los cambios los registra el taller.</p>';modal('OT-'+o.id.slice(0,8).toUpperCase(),body,async b=>{if(!editable)return;await api('order-stage',{id:o.id,version:o.version,stage:b.stage,note:b.note});await loadOrders();toast('Etapa actualizada.');},editable?'Guardar etapa':'Cerrar');}
function openHistoryOrder(id,back){
 const order=orderRows.find(record=>record.id===id);
 if(!order)return;
 const reference='OT-'+id.slice(0,8).toUpperCase();
 const fields=[['Fecha de recepción',workOrderDate(order.created)],['Entrega prevista',workOrderDate(order.due)],
  ['Cliente',order.client_name],['Placa',order.plate],['Etapa',orderStages[order.stage]],['Servicio',order.service_type]];
 const stages=(order.history||[]).map(entry=>'<li><strong>'+esc(orderStages[entry.stage]||'—')+'</strong><small>'+
  esc(workOrderDate(entry.at))+'</small><p>'+esc(entry.note||'')+'</p></li>');
 modal(reference,'<section class="full order-detail"><dl>'+fields.map(([label,value])=>
  '<dt>'+label+'</dt><dd>'+esc(value||'—')+'</dd>').join('')+'</dl><h3>Trabajo solicitado</h3><p>'+esc(order.description||'—')+'</p>'+
  (stages.length?'<h3>Seguimiento</h3><ol class="order-history">'+stages.join('')+'</ol>':'')+'</section>',()=>{});
 const footer=$('#form .dialog-footer');
 footer.innerHTML='<button type="button" class="btn secondary" data-back-to-history>Volver al historial</button>'+
  '<button type="button" class="btn" data-order-print="'+esc(id)+'">Imprimir orden</button>';
 footer.querySelector('[data-back-to-history]').onclick=back;
 footer.querySelector('[data-back-to-history]').focus();
}
function printWorkOrder(id){
 const order=orderRows.find(record=>record.id===id);
 if(!order)return;
 const registered=(data.vehicles||[]).find(record=>record.id===order.vehicle_id);
 const description=[registered?.brand,registered?.model,registered?.year].filter(Boolean).join(' ');
 const completed=workPerformed(order);
 $('#integration-print')?.remove();
 const page=document.createElement('section');
 page.id='integration-print';
 page.innerHTML='<h1>Orden de trabajo OT-'+esc(order.id.slice(0,8).toUpperCase())+'</h1>'+
  '<p>'+esc(order.workshop_name||session.workshop||'Taller')+'</p>'+
  '<table><tbody>'+[['Cliente',order.client_name],['Vehículo',[order.plate,description].filter(Boolean).join(' · ')],['Recepción',workOrderDate(order.created)],['Entrega prevista',workOrderDate(order.due)],['Etapa',orderStages[order.stage]],['Tipo de servicio',order.service_type]].map(([label,value])=>'<tr><th>'+label+'</th><td>'+esc(value||'—')+'</td></tr>').join('')+'</tbody></table>'+
  '<h2>Trabajo solicitado</h2><p style="white-space:pre-wrap">'+esc(order.description||'—')+'</p>'+
  (completed?'<h2>Trabajo realizado</h2><p style="white-space:pre-wrap">'+esc(completed)+'</p>':'')+
  '<h2>Observaciones del técnico</h2><p style="min-height:52mm;border:1px solid #bbb"></p><p>Técnico responsable ____________________________________</p>';
 document.body.append(page);
 window.addEventListener('afterprint',()=>page.remove(),{once:true});
 window.print();
}
function wireOrders(){
 const search=$('#order-search'),matches=$('#order-client-matches'),list=matches.querySelector('ul');
 let candidates=[];
 const update=()=>{orderPage=1;$('#order-results').innerHTML=ordersBody();labelTables();};
 search.addEventListener('input',()=>{
  orderQuery=search.value;
  orderClientId='';
  candidates=session.role==='owner'?findClientsByName(data.clients,orderQuery):[];
  list.innerHTML=candidates.map((record,index)=>'<li><button type="button" data-order-client="'+index+'">'+esc(record.name)+'</button></li>').join('');
  matches.hidden=!candidates.length;
  update();
 });
 list.addEventListener('click',event=>{
  const button=event.target.closest('[data-order-client]');
  if(!button)return;
  const record=candidates[Number(button.dataset.orderClient)];
  orderClientId=record.id;
  search.value=record.name;
  orderQuery='';
  matches.hidden=true;
  update();
  search.focus();
 });
 for(const [id,set]of [['order-stage',value=>orderStage=value],['order-workshop',value=>orderWorkshop=value]])
  $('#'+id)?.addEventListener('change',event=>{set(event.target.value);update();});
}

const renderBeforeOrders=render;
render=function(){const orders=view==='orders';if(orders)view='security';renderBeforeOrders();if(!session)return;if(orderIdentity!==session.email){orderIdentity=session.email;orderRows=[];orderLoaded=false;orderError='';orderStage='';orderQuery='';orderClientId='';orderWorkshop='';}if(orders)view='orders';if(!$('#nav [data-view="orders"]'))$('#nav').insertAdjacentHTML('beforeend','<button data-view="orders"><span class="nav-icon">'+liveIcon('services')+'</span>Órdenes de trabajo</button>');if(orders){$('#crumb').textContent='Órdenes de trabajo';$('#contenido').dataset.page='orders';$('#contenido').innerHTML=ordersPage();document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='orders'));wireOrders();labelTables();}else renderOrderPending();if(!orderLoaded&&!orderBusy&&!orderError)loadOrders();};
document.addEventListener('click',e=>{if(e.target.closest('[data-order-new]'))newOrder('',orderClientId);const print=e.target.closest('[data-order-print]');if(print)printWorkOrder(print.dataset.orderPrint);const open=e.target.closest('[data-order-open]');if(open)openOrder(open.dataset.orderOpen);if(e.target.closest('[data-order-refresh]'))loadOrders();if(e.target.closest('[data-order-delivered]')){const stage=$('#order-stage');if(stage){stage.value='delivered';stage.dispatchEvent(new Event('change'));}}const page=e.target.closest('[data-order-page]');if(page){orderPage=Number(page.dataset.orderPage);$('#order-results').innerHTML=ordersBody();labelTables();}});

document.addEventListener('click',e=>{if(e.target.closest('[data-order-pending-link]')){orderStage='';orderQuery='';orderClientId='';orderPage=1;if(session.role==='admin'){orderWorkshop=monitorWorkshop==='all'?'':monitorWorkshop;}}},true);
