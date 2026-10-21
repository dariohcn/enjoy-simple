const serviceTypes=['Mantenimiento preventivo','Mantenimiento correctivo','Diagnóstico','Inspección','Instalación y cambio'];
const vehicleSystems=['Motor','Lubricación','Filtros','Frenos','Suspensión','Dirección','Transmisión','Sistema eléctrico','Refrigeración','Aire acondicionado','Neumáticos','Carrocería','Accesorios','Otros'];
const partTypes=['Repuesto','Lubricante','Insumo','Accesorio','Herramienta'],partUnits=['Unidad','Juego','Kit','Litro','Galón','Par','Metro'];
let editContext={},catalogSystem='',catalogType='',serviceQuery='',serviceTypeFilter='',serviceSystemFilter='';
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)editContext={action:b.dataset.action,id:b.dataset.id||''};},true);
function categorySelect(label,name,items,value='',required=true){const options=[...items];if(value&&!options.includes(value))options.push(value);return `<label>${label}<select name="${name}" class="form-select" ${required?'required':''}><option value="">${required?'Seleccione una opción':'Sin vincular'}</option>${options.map(x=>`<option value="${esc(x)}" ${x===value?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`;}
const modalBeforeClassifications=modal;
modal=function(title,fields,onSave,submit='Guardar'){
 const context={...editContext},kind=context.action;
 modalBeforeClassifications(title,fields,async values=>{
  if(['service','appointment','plan','request'].includes(kind)&&!serviceTypes.includes(values.serviceType))throw Error('Seleccione un tipo de servicio.');
  if(kind==='service'&&(Number(values.estimatedMinutes)<15||Number(values.estimatedMinutes)>480))throw Error('Indique una duración entre 15 y 480 minutos.');
  return onSave(values);
 },submit);
 const form=$('#form'),fieldGrid=$('#dialog-content .fields');
 if(kind==='request'){
  const record=data.requests.find(r=>r.id===context.id)||{};
  fieldGrid.insertAdjacentHTML('afterbegin',categorySelect('Tipo de servicio a contratar','serviceType',serviceTypes,record.serviceType||''));
  for(const service of data.services){
   const input=form.elements.namedItem('service-'+service.id);if(!input)continue;
   const detail=document.createElement('small');detail.className='request-service-kind';detail.textContent=[service.serviceType||'Tipo pendiente de clasificar',service.category].filter(Boolean).join(' · ');input.closest('label').append(detail);
  }
  if(record.status)form.elements.namedItem('status').value=record.status;
 }
 if(kind==='product-edit'){
  const p=(data.products||[]).find(p=>p.id===context.id)||{},a=p.attributes||{},category=form.querySelector('[name="category"]');
  category.closest('label').outerHTML=categorySelect('Sistema / categoría','category',vehicleSystems,p.category||'');
  fieldGrid.insertAdjacentHTML('afterbegin','<div class="catalog-form-note full">Clasificación del producto</div>'+categorySelect('Tipo de producto','partType',partTypes,a.partType||'Repuesto')+field('Tipo de repuesto / pieza','partFamily',a.partFamily||'','text',false));
  form.querySelector('[name="partFamily"]').placeholder='Filtro, bujía, pastilla, disco, sensor…';form.querySelector('[name="partFamily"]').maxLength=120;
  fieldGrid.insertAdjacentHTML('beforeend',field('Marca del fabricante','brand',a.brand||'','text',false)+field('Referencia / número de parte','reference',a.reference||'','text',false)+field('Compatibilidad (marca, modelo, año, motor)','compatibility',a.compatibility||'','text',false)+categorySelect('Unidad de venta','unit',partUnits,a.unit||'Unidad'));
  const priceLabel=form.querySelector('[name=price]').closest('label');['brand','reference','compatibility','unit'].forEach(n=>priceLabel.before(form.querySelector('[name='+n+']').closest('label')));form.querySelector('[name=stock]').step='1';form.querySelector('[name=price]').step='0.01';
  ['brand','reference'].forEach(n=>form.querySelector('[name="'+n+'"]').maxLength=120);form.querySelector('[name="compatibility"]').maxLength=500;
 }
 if(kind==='service'){
  const s=data.services.find(s=>s.id===context.id)||{},category=form.querySelector('[name="category"]');
  category.closest('label').outerHTML=categorySelect('Sistema del vehículo','category',vehicleSystems,s.category||'');
  fieldGrid.insertAdjacentHTML('afterbegin',categorySelect('Tipo de servicio','serviceType',serviceTypes,s.serviceType||''));
  fieldGrid.insertAdjacentHTML('beforeend',field('Duración estimada (minutos)','estimatedMinutes',s.estimatedMinutes||60,'number'));
  const duration=form.querySelector('[name="estimatedMinutes"]');duration.min=15;duration.max=480;duration.step=15; ['supplies','labor','discount'].forEach(n=>{const input=form.querySelector('[name='+n+']');if(input){input.step='0.01';input.min='0';if(n==='discount')input.max='100';}});
 }
 if(kind==='appointment'||kind==='plan'){
  const record=kind==='appointment'?data.appointments.find(a=>a.id===context.id)||{}:{};
  fieldGrid.insertAdjacentHTML('afterbegin',categorySelect('Tipo de servicio a contratar','serviceType',serviceTypes,record.serviceType||''));
  if(kind==='appointment'){
   fieldGrid.insertAdjacentHTML('afterbegin',`<label>Servicio del catálogo (opcional)<select name="serviceId" class="form-select"><option value="">Servicio no vinculado</option>${data.services.map(s=>`<option value="${esc(s.id)}" ${record.serviceId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`);
   form.querySelector('[name="serviceId"]').onchange=e=>{const s=data.services.find(s=>s.id===e.target.value);if(!s)return;form.querySelector('[name="reason"]').value=s.name;form.querySelector('[name="serviceType"]').value=s.serviceType||'';form.querySelector('[name="duration"]').value=s.estimatedMinutes||60;};
   const duration=form.querySelector('[name="duration"]');duration.min=15;duration.max=480;duration.step=15; ['supplies','labor','discount'].forEach(n=>{const input=form.querySelector('[name='+n+']');if(input){input.step='0.01';input.min='0';if(n==='discount')input.max='100';}});
  }
 }
};
function filterSelect(id,label,items,value){return `<label>${label}<select class="form-select" id="${id}"><option value="">Todos</option>${items.map(x=>`<option value="${esc(x)}" ${x===value?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`;}
productsView=function(){
 const admin=session.role==='admin',permission=admin?'manage':data.productPermission||'read',canPublish=permission!=='read';
 const source=data.products||[],systems=[...new Set([...vehicleSystems,...source.map(p=>p.category)])].filter(Boolean);
 const items=source.filter(p=>{const a=p.attributes||{},text=[p.name,p.sku,p.category,a.partType,a.partFamily,a.brand,a.reference,a.compatibility].join(' ').toLocaleLowerCase('es');return text.includes(productQuery)&&(!catalogSystem||p.category===catalogSystem)&&(!catalogType||(a.partType||'Repuesto')===catalogType)&&(productScope==='all'||(productScope==='active'?p.active:!p.active));});
 return head('Productos','Repuestos, insumos y accesorios clasificados para su taller.',canPublish?button('Subir producto','product-edit'):'')+`<div class="classified-toolbar"><label>Buscar<input class="form-control" id="product-search" value="${esc(productQuery)}" placeholder="Nombre, marca, referencia o compatibilidad" aria-label="Buscar productos"></label>${filterSelect('catalog-type','Tipo',partTypes,catalogType)}${filterSelect('catalog-system','Sistema',systems,catalogSystem)}<label>Estado<select id="product-scope" class="form-select"><option value="all" ${productScope==='all'?'selected':''}>Todos</option><option value="active" ${productScope==='active'?'selected':''}>Activos</option><option value="inactive" ${productScope==='inactive'?'selected':''}>Retirados</option></select></label><span>${items.length} productos</span></div>${!canPublish?'<div class="notice">La publicación y edición requieren autorización del administrador.</div>':''}<div class="classified-products">${items.map(p=>{const a=p.attributes||{},edit=admin||p.workshop===data.workshopId&&canPublish;return `<article class="classified-product"><div class="classified-product-image">${safeImage(p.image)?`<img loading="lazy" src="${safeImage(p.image)}" alt="${esc(p.name)}">`:liveIcon('products')}</div><div><div class="classification-tags"><span>${esc(a.partType||'Repuesto')}</span><span>${esc(p.category)}</span>${a.partFamily?"<span>"+esc(a.partFamily)+"</span>":""}</div><h2>${esc(p.name)}</h2><p>${esc(a.brand||'Marca no indicada')}${a.reference?' · Ref. '+esc(a.reference):''}</p><small>${esc(a.compatibility||'Compatibilidad por confirmar')}</small><div class="classified-price"><strong>${money(Number(p.price))}</strong><span>${p.stock} · ${esc(a.unit||'Unidad')}</span><span class="badge ${p.active?'green':''}">${p.active?'Activo':'Retirado'}</span></div>${p.description?`<p>${esc(p.description)}</p>`:''}${edit?`<div class="actions">${button('Editar','product-edit',p.id,true)}${(admin||permission==='manage')&&p.active?button('Retirar','product-remove',p.id,true):''}</div>`:''}</div></article>`;}).join('')||'<p class="classified-empty">No hay productos para los filtros seleccionados.</p>'}</div>`;
};
function classifiedServices(){
 const systems=[...new Set([...vehicleSystems,...data.services.map(s=>s.category)])].filter(Boolean),rows=data.services.filter(s=>(!serviceTypeFilter||s.serviceType===serviceTypeFilter)&&(!serviceSystemFilter||s.category===serviceSystemFilter)&&[s.name,s.category,s.serviceType,s.supplyDetail].join(' ').toLocaleLowerCase('es').includes(serviceQuery));
 return head('Servicios del taller','Clasificación, insumos, mano de obra y tiempo estimado.',data.catalogAllowed?button('Nuevo servicio','service'):'')+`<div class="classified-toolbar"><label>Buscar<input id="service-query" class="form-control" value="${esc(serviceQuery)}" placeholder="Servicio, sistema o insumo" aria-label="Buscar servicios"></label>${filterSelect('service-type','Tipo de servicio',serviceTypes,serviceTypeFilter)}${filterSelect('service-system','Sistema',systems,serviceSystemFilter)}<span>${rows.length} servicios</span></div>`+(!data.catalogAllowed?'<div class="notice">El administrador debe autorizar la edición de servicios.</div>':'')+table(['Servicio','Tipo / sistema','Insumos / mano de obra','Duración','Total','Acción'],rows.map(s=>`<tr><td><strong>${esc(s.name)}</strong><small>${esc(s.supplyDetail||'Sin insumos detallados')}</small></td><td>${esc(s.serviceType||'Sin clasificar')}<small>${esc(s.category)}</small></td><td>${money(Number(s.supplies))}<small>Mano de obra: ${money(Number(s.labor))}</small></td><td>${s.estimatedMinutes?esc(s.estimatedMinutes)+' min':'No indicado'}</td><td>${money(total(s))}<small>Descuento: ${Number(s.discount)}%</small></td><td>${data.catalogAllowed?button('Editar','service',s.id,true):'Consulta'}</td></tr>`));
}
const renderBeforeCatalog=render;render=function(){renderBeforeCatalog();if(session&&view==='services'){$('#contenido').innerHTML=classifiedServices();labelTables();}};
document.addEventListener('change',e=>{const id=e.target.id;if(id==='catalog-type')catalogType=e.target.value;else if(id==='catalog-system')catalogSystem=e.target.value;else if(id==='service-type')serviceTypeFilter=e.target.value;else if(id==='service-system')serviceSystemFilter=e.target.value;else return;render();});
document.addEventListener('input',e=>{if(e.target.id!=='service-query')return;serviceQuery=e.target.value.toLocaleLowerCase('es');const pos=e.target.selectionStart;render();$('#service-query').focus();$('#service-query').setSelectionRange(pos,pos);});


