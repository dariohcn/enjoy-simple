/* Operational views over existing data; no parallel demo statistics. */
let workbenchQuery='',workbenchSort='activity',workbenchStatus='',workbenchIdentity='',workbenchPage=1;
function paginateWorkbenchRows(rows,page,size=10){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(Math.max(1,page),pages);return {rows:rows.slice((current-1)*size,current*size),current,pages,start:rows.length?(current-1)*size+1:0,end:Math.min(current*size,rows.length)};}
function workbenchStrip(){
 const admin=session.role==='admin';
 return `<section class="workbench-strip" aria-label="Accesos operativos"><div class="workbench-strip-copy"><span class="workbench-kicker">${admin?'ADMINISTRACIÓN DE LA RED':'OPERACIÓN DEL TALLER'}</span><h2>${admin?'Supervisión y decisiones, en un mismo lugar':'Organice las visitas y el trabajo pendiente'}</h2><p>${admin?'Compare talleres, revise solicitudes y consulte su actividad.':'Consulte el servicio solicitado y abra cada cita para revisar sus datos.'}</p><div class="actions">${admin?'<button class="btn" data-view="admin">Gestionar talleres</button><button class="btn secondary" data-view="products">Catálogo de productos</button>':'<button class="btn" data-view="requests">Solicitudes de servicio</button><button class="btn secondary" data-view="services">Catálogo de servicios</button>'}</div></div><div class="workbench-media"><video data-manual-play id="workbench-video" muted loop playsinline preload="none" poster="assets/driving-poster.jpg" aria-label="Video ilustrativo automotriz"><source src="assets/enjoy-driving-28.mp4" type="video/mp4"></video><button type="button" id="workbench-play" aria-label="Reproducir video ilustrativo">▶ Ver video</button><span>Imagen ilustrativa</span></div></section>`;
}
function workbenchRows(){
 if(session.role==='admin'){
  const s=summarizeNetwork(data.workshops,data.monitor,{workshop:monitorWorkshop,scope:monitorScope,days:monitorDays});
  return s.partners.map(w=>{const rows=s.appointments.filter(a=>a.workshop===w.id),count=status=>rows.filter(a=>a.status===status).reduce((n,a)=>n+Number(a.n),0),all=rows.reduce((n,a)=>n+Number(a.n),0);return {id:w.id,name:w.name,city:w.location||'Sin ciudad',example:w.is_demo,image:w.image,clients:Number(w.counts.clients||0),vehicles:Number(w.counts.vehicles||0),appointments:all,done:count('done'),record:w};});
 }
 return data.appointments.map(a=>({id:a.id,name:client(a.clientId)?.name||'Cliente no disponible',plate:vehicle(a.vehicleId)?.plate||'Sin placa',date:a.date,time:a.time,service:a.serviceType||'Sin clasificar',reason:a.reason||'Sin detalle',status:a.status||'scheduled',record:a}));
}
function normalizeWorkbenchText(value){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');}
function selectedWorkbenchRows(){
 const admin=session.role==='admin',query=normalizeWorkbenchText(workbenchQuery.trim());
 const rows=workbenchRows().filter(r=>(!query||normalizeWorkbenchText([r.name,r.city,r.plate,r.service,r.reason].filter(Boolean).join(' ')).includes(query))&&(admin||!workbenchStatus||r.status===workbenchStatus));
 return rows.sort((a,b)=>admin?(workbenchSort==='name'?a.name.localeCompare(b.name,'es'):workbenchSort==='clients'?b.clients-a.clients||a.name.localeCompare(b.name,'es'):b.appointments-a.appointments||a.name.localeCompare(b.name,'es')):(b.date+b.time).localeCompare(a.date+a.time));
}
function workbenchTable(){
 const admin=session.role==='admin',rows=selectedWorkbenchRows(),labels={scheduled:'Programada',arrived:'En taller',done:'Completada',cancelled:'Cancelada'};
 const columns=admin?['Taller / ciudad','Clientes','Vehículos','Citas del período','Completadas','Acceso']:['Fecha / hora','Cliente / vehículo','Servicio a contratar','Estado','Acción'];
 const paging=paginateWorkbenchRows(rows,workbenchPage);workbenchPage=paging.current;
 const html=paging.rows.map(r=>admin?`<tr><td><button class="workbench-identity text-button" data-action="workshop-detail" data-id="${esc(r.id)}"><span class="workbench-thumb">${safeImage(r.image)?`<img src="${safeImage(r.image)}" alt="Imagen del taller" loading="lazy">`:liveIcon('admin')}</span><span><strong>${esc(r.name.replace(/^Ejemplo · /,''))}</strong><small>${esc(r.city)}${r.example?' · Ejemplo':''}</small></span></button></td><td>${r.clients}</td><td>${r.vehicles}</td><td>${r.appointments}</td><td><span class="workbench-progress"><span style="width:${r.appointments?r.done/r.appointments*100:0}%"></span></span><small>${r.done} de ${r.appointments}</small></td><td>${workshopActions(r.record)}</td></tr>`:`<tr><td><strong>${date(r.date)}</strong><small>${esc(r.time)}</small></td><td><strong>${esc(r.name)}</strong><small>${esc(r.plate)}</small></td><td>${esc(r.service)}<small>${esc(r.reason)}</small></td><td><span class="badge ${r.status==='done'?'green':r.status==='arrived'?'amber':''}">${labels[r.status]||esc(r.status)}</span>${r.date<isoToday()&&['scheduled','arrived'].includes(r.status)?'<small class="workbench-followup">Fecha pasada · revisar estado</small>':''}</td><td><button class="text-button" data-action="appointment" data-id="${esc(r.id)}">Abrir cita ↗</button></td></tr>`);
 if(!rows.length)return '<div class="workbench-empty"><h3>Sin coincidencias</h3><p>No hay registros para esta búsqueda y selección. Puede limpiar los filtros de esta tabla.</p><button class="btn secondary" type="button" data-workbench-clear>Limpiar filtros</button></div>';
 return `<div class="workbench-table-count">${rows.length} ${admin?(rows.length===1?'taller':'talleres'):(rows.length===1?'cita':'citas')} en esta tabla${admin?' · Respeta los filtros de red y período':''}</div>`+table(columns,html)+(paging.pages>1?`<div class="workbench-pagination"><span>${paging.start}–${paging.end} de ${rows.length}</span><div><button type="button" class="btn secondary" data-workbench-page="${paging.current-1}" ${paging.current===1?'disabled':''}>← Anterior</button><span>${paging.current} / ${paging.pages}</span><button type="button" class="btn secondary" data-workbench-page="${paging.current+1}" ${paging.current===paging.pages?'disabled':''}>Siguiente →</button></div></div>`:'');
}
function wireWorkbench(){
 const input=document.querySelector('#workbench-search'),area=document.querySelector('#workbench-results');
 if(!input||!area)return;
 const update=()=>{area.innerHTML=workbenchTable();labelTables();};
 area.addEventListener('click',e=>{const page=e.target.closest('[data-workbench-page]');if(page){workbenchPage=Number(page.dataset.workbenchPage);update();area.querySelector('[data-workbench-page]')?.focus({preventScroll:true});}if(e.target.closest('[data-workbench-clear]')){workbenchQuery='';workbenchStatus='';workbenchPage=1;input.value='';const state=document.querySelector('#workbench-state');if(state)state.value='';update();input.focus({preventScroll:true});}});
 input.addEventListener('input',()=>{workbenchQuery=input.value;workbenchPage=1;update();});
 document.querySelector('#workbench-order')?.addEventListener('change',e=>{workbenchSort=e.target.value;workbenchPage=1;update();});
 document.querySelector('#workbench-state')?.addEventListener('change',e=>{workbenchStatus=e.target.value;workbenchPage=1;update();});
 document.querySelector('#workbench-export').addEventListener('click',()=>{
  const admin=session.role==='admin',rows=selectedWorkbenchRows(),fields=admin?['Taller','Ciudad','Clientes','Vehículos','Citas del período','Completadas']:['Fecha','Hora','Cliente','Placa','Tipo de servicio','Detalle','Estado'];
  const cell=value=>'"'+String(value??'').replace(/^(\s*[=+@\-])/,"'$1").replace(/"/g,'""')+'"';
  const contents=[fields,...rows.map(r=>admin?[r.name,r.city,r.clients,r.vehicles,r.appointments,r.done]:[r.date,r.time,r.name,r.plate,r.service,r.reason,r.status])].map(r=>r.map(cell).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+contents],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download=admin?'enjoy-red-talleres.csv':'enjoy-citas-taller.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
}
let workbenchMediaObserver;
const renderBeforeWorkbench=render;
render=function(){
 workbenchMediaObserver?.disconnect();renderBeforeWorkbench();if(!session||!data||!['monitor','overview'].includes(view)||session.role==='admin'&&!data.monitor)return;
 workbenchPage=1;if(workbenchIdentity!==session.email){workbenchQuery='';workbenchStatus='';workbenchIdentity=session.email;}
 const admin=session.role==='admin',main=document.querySelector('#contenido'),heading=main.querySelector(admin?'.live-title':'.operation-heading');
 heading?.insertAdjacentHTML('afterend',workbenchStrip());
 const section=admin?[...main.querySelectorAll('.live-card')].find(e=>e.querySelector('h2')?.textContent==='Control y operación de los talleres'):null;
 const content=`<div class="workbench-table-heading"><div><h2>${admin?'Comparativo de talleres':'Historial de citas'}</h2><p>${admin?'Actividad y acceso de los talleres autorizados seleccionados.':'Servicios, vehículos y estado de las visitas registradas en su taller.'}</p></div><button class="btn secondary" id="workbench-export">Exportar filtrados CSV ↓</button></div><div class="workbench-toolbar"><label>Buscar<input class="form-control" id="workbench-search" value="${esc(workbenchQuery)}" placeholder="${admin?'Taller o ciudad':'Cliente, placa o servicio'}"></label>${admin?`<label>Ordenar<select id="workbench-order" class="form-select"><option value="activity" ${workbenchSort==='activity'?'selected':''}>Más citas</option><option value="clients" ${workbenchSort==='clients'?'selected':''}>Más clientes</option><option value="name" ${workbenchSort==='name'?'selected':''}>Nombre</option></select></label>`:`<label>Estado<select id="workbench-state" class="form-select"><option value="">Todos</option>${Object.entries({scheduled:'Programadas',arrived:'En taller',done:'Completadas',cancelled:'Canceladas'}).map(([v,n])=>`<option value="${v}" ${workbenchStatus===v?'selected':''}>${n}</option>`).join('')}</select></label>`}</div><div id="workbench-results">${workbenchTable()}</div>`;
 if(section){section.classList.add('workbench-table');section.innerHTML=content;}else main.insertAdjacentHTML('beforeend',`<section class="live-card workbench-table">${content}</section>`);
 wireWorkbench();labelTables();
 const video=document.querySelector('#workbench-video'),play=document.querySelector('#workbench-play');
 play.addEventListener('click',async()=>{if(play.disabled)return;if(video.paused){play.disabled=true;try{await video.play();play.textContent='Ⅱ Pausar';play.setAttribute('aria-label','Pausar video ilustrativo');}catch{toast('No se pudo reproducir el video.');}finally{play.disabled=false;}}else{video.pause();play.textContent='▶ Ver video';play.setAttribute('aria-label','Reproducir video ilustrativo');}});
 workbenchMediaObserver=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting){video.pause();play.textContent='▶ Ver video';play.setAttribute('aria-label','Reproducir video ilustrativo');}},{threshold:.1});workbenchMediaObserver.observe(video);
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){document.querySelector('#workbench-video')?.pause();const play=document.querySelector('#workbench-play');if(play)play.textContent='▶ Ver video';}});
if(session&&data)render();
