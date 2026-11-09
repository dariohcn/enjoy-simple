
/* Native maintenance planner. Reference data is served by this GitHub Pages site. */
(() => {
'use strict';
let workshopName='', workshopLogo='', registeredClients=[], registeredVehicles=[];
let source=null,referenceSource=null,importedCatalog=false,catalogLabel='',pending=null,failure='',filters={year:'',brand:'',model:'',code:'',km:'',plan:'',type:'',search:''};
const text=x=>String(x??''),safe=x=>text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(n||0);
const num=x=>Number(text(x).replace(',','.'))||0,round=x=>Math.round((x+Number.EPSILON)*100)/100;
const unique=(rows,i)=>[...new Set(rows.map(x=>text(x[i])))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
const currencySum=rows=>round(rows.reduce((sum,r)=>sum+num(r[12]),0));
function modelYear(code){
 const years=[...new Set(text(code).match(/\b(?:19|20)\d{2}\b/g)||[])];
 return years.length===1?years[0]:'Sin año indicado';
}
function narrow(rows,key,index){return rows.filter(r=>text(r[index])===filters[key]);}
function pick(rows,key,index){const vals=unique(rows,index);if(!vals.includes(filters[key]))filters[key]=vals[0]||'';return narrow(rows,key,index);}
function selection(){let rows=source?.rows||[],choices={};choices.year=[...new Set(rows.map(r=>text(r[16]||modelYear(r[2]))))].sort((a,b)=>b.localeCompare(a,'es',{numeric:true}));if(!choices.year.includes(filters.year))filters.year=choices.year.find(y=>y!=='Sin año indicado')||choices.year[0]||'';rows=rows.filter(r=>text(r[16]||modelYear(r[2]))===filters.year);for(const [key,i] of [['brand',0],['model',1],['code',2],['km',4],['plan',13]]){choices[key]=unique(rows,i);rows=pick(rows,key,i);}if(source?.plans)rows=rows.flatMap(h=>source.plans[h[14]][6].map(index=>{const l=source.items[index];return [h[0],h[1],h[2],h[3],h[4],l[0],l[1],l[2],l[3],l[4],l[5],l[6],l[7],h[13],null,l[8]];}));return {rows,choices};}
function visibleRows(rows){const q=filters.search.toLocaleLowerCase('es');return rows.filter(r=>(!filters.type||(filters.type==='labor'?num(r[8])===1:num(r[8])!==1))&&(!q||[r[5],r[6]].join(' ').toLocaleLowerCase('es').includes(q)));}
function totals(rows,iva=15){const labor=currencySum(rows.filter(r=>num(r[8])===1)),subtotal=currencySum(rows),parts=round(subtotal-labor);const extra=round(subtotal*iva/100);return {labor,parts,subtotal,total:round(subtotal+extra),extra,rate:Math.max(0,...rows.filter(r=>num(r[8])===1).map(r=>num(r[10])))};}
function option(key,values,label,format=x=>x){return '<label>'+label+'<select class="form-select" data-nm-filter="'+key+'" '+(!values.length?'disabled':'')+'>'+values.map(v=>'<option value="'+safe(v)+'" '+(v===filters[key]?'selected':'')+'>'+safe(format(v))+'</option>').join('')+'</select></label>';}
function stat(label,value,tone,detail){return '<article class="nm-stat '+tone+'"><span>'+label+'</span><strong>'+usd(value)+'</strong><small>'+detail+'</small></article>';}
function body(){
 if(!source)return '<div class="nm-state" role="status">'+(failure?'<strong>No se pudo cargar el tarifario.</strong><p>'+safe(failure)+'</p><button class="btn secondary" data-nm-retry>Reintentar</button>':'<span class="nm-loading"></span><strong>Cargando planes de mantenimiento…</strong>')+'</div>';
 const {rows:planRows,choices}=selection(),rows=planRows,t=totals(rows),part=planRows[0];
 const plans=choices.plan.map(id=>[id,source.rows.find(r=>text(r[13])===id&&text(r[2])===filters.code)?.[3]||id]);
 return '<div class="nm-filterbar">'+option('year',choices.year,'Año')+option('brand',choices.brand,'Marca')+option('model',choices.model,'Modelo')+option('code',choices.code,'Versión')+option('km',choices.km,'Kilometraje',v=>v?Number(v).toLocaleString('es-EC')+' km':'Sin intervalo')+'<button class="btn secondary" data-nm-reset>Restablecer</button></div>'+
 '<div class="nm-context"><div><span class="nm-eyebrow">PLAN SELECCIONADO</span><h2>'+safe(part?.[3]||'Sin partidas')+'</h2><p>'+safe(filters.brand)+' · '+safe(filters.model)+' · '+safe(filters.code)+'</p></div>'+(plans.length>1?option('plan',plans.map(x=>x[0]),'Variante de plan',id=>plans.find(x=>x[0]===id)[1]):'<span class="nm-tag">'+planRows.length+' partidas en el plan</span>')+'</div>'+
 '<section id="nm-proforma-editor" aria-label="Rubros editables de la proforma"></section><div class="nm-layout"><div class="nm-drawer"><button class="btn secondary nm-drawer-tab" type="button" data-nm-totals aria-controls="nm-totals">Totales</button><aside id="nm-totals" class="nm-stats" aria-label="Totales de la proforma">'+stat('Valor hora máximo',t.rate,'nm-slate','Tarifa de mano de obra')+stat('Mano de obra',t.labor,'nm-blue','Operaciones de la proforma')+stat('Repuestos e insumos',t.parts,'nm-teal','Partidas de la proforma')+stat('Subtotal',t.subtotal,'nm-slate','Suma de las partidas de la proforma')+stat('Total de referencia',t.total,'nm-total','Incluye el IVA seleccionado en la proforma')+'</aside></div>'+
 '</div>'+
 (catalogLabel?'<p class="nm-footnote">Catálogo importado · '+safe(catalogLabel)+'</p>':'<p class="nm-footnote">Tarifario de referencia del informe proporcionado · última actualización de origen: 26/11/2025. Se consulta una sola versión y un solo plan para evitar sumar vehículos distintos. El IVA se puede ajustar en cada proforma.</p>');
}


function connectVehicleLookup(form){
 const fields=Object.fromEntries(['customer','plate','chassis'].map(name=>[name,form.elements.namedItem(name)]));
 const matches=form.querySelector('[data-vehicle-matches]');
 const chooser=form.querySelector('[data-vehicle-choice]');
 const status=form.querySelector('[data-vehicle-status]');
 const customers=new Map(registeredClients.map(client=>[client.id,client.name||'']));
 const records=registeredVehicles.map(vehicle=>({
  customer:customers.get(vehicle.clientId)||'', plate:vehicle.plate||'',
  chassis:vehicle.chassis||vehicle.vin||'', model:[vehicle.brand,vehicle.model,vehicle.year].filter(Boolean).join(' ')
 }));
 const normalize=(value,name)=>{
  const normalized=text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  return name==='customer'?normalized.replace(/\s+/g,' '):normalized.replace(/[^a-z0-9]/g,'');
 };
 let options=[];
 function apply(record){
  for(const name of Object.keys(fields))fields[name].value=record[name];
  matches.hidden=true;
  status.textContent='Vehículo seleccionado: '+[record.model,record.plate||record.chassis].filter(Boolean).join(' · ')+'. Podés editar los campos.';
  status.hidden=false;
 }
 function lookup(name,exactOnly){
  const query=normalize(fields[name].value,name);
  options=query.length>=2?records.filter(record=>normalize(record[name],name).includes(query)):[];
  const exact=options.filter(record=>normalize(record[name],name)===query);
  if(exactOnly&&exact.length===1){apply(exact[0]);return;}
  status.hidden=true;
  matches.hidden=!options.length;
  chooser.replaceChildren(new Option('Seleccioná el vehículo', ''));
  options.forEach((record,index)=>{
   chooser.add(new Option([record.customer,record.plate||record.chassis||'Sin placa',record.model].filter(Boolean).join(' · '),String(index)));
  });
 }
 for(const [name,input] of Object.entries(fields)){
  input.addEventListener('input',()=>lookup(name,false));
  input.addEventListener('change',()=>lookup(name,true));
 }
 chooser.addEventListener('change',()=>{if(chooser.value!=='')apply(options[Number(chooser.value)]);});
}

function proformaBrandHeader(){
 const name=workshopName||'Taller de mecánica';
 const logo=/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(workshopLogo)&&workshopLogo.length<=75000
  ?`<img src="${safe(workshopLogo)}" alt="Logo de ${safe(name)}">`
  :'';
 return `<div class="nm-proforma-brand"><strong class="nm-enjoy-mark">enjoy</strong><span>${safe(name)}</span><div class="nm-company-logo">${logo}</div></div>`;
}

function mountProforma(){
 const host=document.querySelector('#nm-proforma-editor');
 if(!host||host.firstElementChild||!source)return;
 host.dataset.planKey=planKey();
 const rows=selection().rows;
 if(!rows.length)return;
 const initialRows=rows;
 const dialog=document.createElement('div');
 dialog.className='nm-inline-proforma';
 dialog.dataset.editing='false';
 dialog.setAttribute('aria-label','Datos de la proforma');
 const vehicleLabel=[filters.year==='Sin año indicado'?'':filters.year,filters.brand,filters.model,filters.code,filters.km?filters.km+' km':''].filter(Boolean).join(' · ');
 dialog.innerHTML=`<form>
  <div class="nm-plan-toolbar">
   <div><h2>Plan de mantenimiento generado</h2><p data-plan-mode>Plan estándar cargado para el vehículo y kilometraje seleccionados.</p></div>
   <div class="nm-actions"><button type="button" class="btn" data-edit-plan aria-pressed="false">Modificar plan</button><button type="button" class="btn secondary" data-nm-export>Descargar estándar (CSV)</button></div>
  </div>
  <table class="nm-form-header"><tbody>
   <tr><th colspan="4">${proformaBrandHeader()}</th></tr>
   <tr><th colspan="4">PROFORMA DE REPUESTOS Y MANO DE OBRA PARA MANTENIMIENTO</th></tr>
   <tr><th scope="row">Vehículo</th><td colspan="3">${safe(vehicleLabel)}</td></tr>
   <tr><th scope="row"><label for="nm-customer">Cliente</label></th><td colspan="3"><input id="nm-customer" class="form-control" name="customer" required maxlength="120"></td></tr>
   <tr><th scope="row"><label for="nm-chassis">Chasis</label></th><td><input id="nm-chassis" class="form-control" name="chassis" maxlength="40"></td><th scope="row"><label for="nm-plate">Placa</label></th><td><input id="nm-plate" class="form-control" name="plate" maxlength="20"></td></tr>
  </tbody></table>
  <div data-vehicle-matches hidden><label>Elegir vehículo registrado <select class="form-select" data-vehicle-choice></select></label></div>
  <p data-vehicle-status role="status" hidden></p>
  <div class="nm-quote-lines"></div>
  <div class="nm-quote-summary">
   <table class="nm-form-totals"><tbody>
    <tr><th scope="row">Total repuestos (sin IVA)</th><td data-total="parts"></td></tr>
    <tr><th scope="row">Total mano de obra (sin IVA)</th><td data-total="labor"></td></tr>
    <tr><th scope="row">Subtotal (REP + MO)</th><td data-total="subtotal"></td></tr>
    <tr><th scope="row"><label for="nm-iva">IVA (%)</label><input id="nm-iva" class="form-control" type="number" name="iva" min="0" max="100" step="0.01" required value="15"></th><td data-total="extra"></td></tr>
    <tr><th scope="row">Total con IVA</th><td data-total="total"></td></tr>
   </tbody></table>
  </div>
  <p><strong>NOTA</strong><br>Las piezas y trabajos adicionales que se identifiquen durante el mantenimiento se cotizarán por separado.</p>
  <label for="nm-prepared">Elaborado por<input id="nm-prepared" class="form-control" name="prepared" maxlength="100"></label>
  <output class="nm-quote-status" aria-live="polite"></output>
  <div class="nm-actions"><button class="btn">Imprimir / guardar PDF</button></div>
 </form>`;
 const editor=dialog.querySelector('.nm-quote-lines');
 const ivaInput=dialog.querySelector('#nm-iva');
 function readRows(){
  return [...editor.querySelectorAll('.nm-quote-row')].map(row=>{
   const description=row.querySelector('[data-description]').value.trim();
   const quantity=row.querySelector('[data-quantity]').valueAsNumber;
   const price=row.querySelector('[data-price]').valueAsNumber;
   const result=[];
   result[6]=description;
   result[7]=quantity;
   result[8]=Number(row.closest('fieldset').dataset.kind);
   result[9]=price;
   result[10]=result[8]===1?price:0;
   result[12]=round(quantity*price);
   return result;
  });
 }
 function refreshTotal(){
  const rows=readRows();
  const validIva=ivaInput.validity.valid;
  const summary=totals(rows.filter(r=>Number.isFinite(r[12])),validIva?ivaInput.valueAsNumber:0);
  const panel=document.querySelector('#nm-totals');
  for(const [i,key] of ['rate','labor','parts','subtotal','total'].entries()){
   const value=panel?.querySelectorAll('.nm-stat strong')[i];
   if(value)value.textContent=key==='total'&&!validIva?'—':usd(summary[key]);
  }
  for(const cell of dialog.querySelectorAll('[data-total]'))cell.textContent=!validIva&&['extra','total'].includes(cell.dataset.total)?'—':usd(summary[cell.dataset.total]);
  editor.querySelectorAll('tbody').forEach(group=>{
   [...group.rows].forEach((row,index)=>{row.querySelector('[data-index]').textContent=index+1;});
  });
  editor.querySelectorAll('[data-line-total]').forEach((cell,index)=>{
   cell.textContent=Number.isFinite(rows[index][12])?usd(rows[index][12]):'—';
  });
 }
 function addLine(fieldset,description='',quantity=1,price=0){
  const parts=fieldset.dataset.kind==='0';
  const row=document.createElement('tr');
  row.className='nm-quote-row';
  row.innerHTML=`<td data-index></td>
   <td><input class="form-control" aria-label="Descripción" data-description required maxlength="2500" value="${safe(description)}"></td>
   <td><input class="form-control" aria-label="${parts?'Cantidad':'Horas'}" type="number" min="0.000001" step="any" data-quantity required value="${safe(quantity)}"></td>
   <td><input class="form-control" aria-label="Valor unitario USD" type="number" min="0" step="any" data-price required value="${safe(price)}"></td>
   <td data-line-total></td>
   <td><button type="button" class="btn secondary" data-remove>Quitar rubro</button></td>`;
  row.querySelector('[data-remove]').onclick=()=>{row.remove();refreshTotal();};
  for(const input of row.querySelectorAll('input'))input.readOnly=dialog.dataset.editing!=='true';
  fieldset.querySelector('tbody').append(row);
  return row;
 }
 for(const [kind,label] of [[0,'REPUESTOS'],[1,'MANO DE OBRA']]){
  const fieldset=document.createElement('fieldset');
  fieldset.dataset.kind=kind;
  fieldset.innerHTML=`<legend>${label}</legend>
   <div class="nm-form-scroll" role="region" aria-label="${label}" tabindex="0"><table class="nm-form-items">
   <thead><tr><th scope="col">Ítem</th><th scope="col">Descripción</th><th scope="col">${kind?'Horas':'Cantidad'}</th><th scope="col">Valor unitario</th><th scope="col">Valor total</th><th scope="col">Acción</th></tr></thead>
   <tbody></tbody></table></div>
   <button type="button" class="btn secondary" data-add>Agregar rubro</button>`;
  editor.append(fieldset);
  for(const item of initialRows.filter(r=>num(r[8])===kind)){
   const quantity=num(item[7]??item[15])||1;
   addLine(fieldset,item[6],quantity,Number((num(item[12])/quantity).toFixed(8)));
  }
  fieldset.querySelector('[data-add]').onclick=()=>{addLine(fieldset).querySelector('[data-description]').focus();refreshTotal();};
 }
 const editButton=dialog.querySelector('[data-edit-plan]');
 editButton.onclick=()=>{
  const editing=dialog.dataset.editing!=='true';
  dialog.dataset.editing=String(editing);
  editButton.setAttribute('aria-pressed',String(editing));
  editButton.textContent=editing?'Terminar edición':'Modificar plan';
  dialog.querySelector('[data-plan-mode]').textContent=editing?'Agregá, quitá o ajustá las partidas de esta proforma.':'Revisá el plan generado antes de imprimir.';
  for(const input of editor.querySelectorAll('input'))input.readOnly=!editing;
 };
 host.addEventListener('nm-refresh-totals',refreshTotal);
 editor.addEventListener('input',refreshTotal);
 ivaInput.addEventListener('input',refreshTotal);
 refreshTotal();
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();
  const rows=readRows();
  if(!rows.length||rows.some(r=>!r[6]||!Number.isFinite(r[12]))){
   dialog.querySelector('output').textContent='Agregá al menos una partida y completá su descripción, cantidad y valor.';
   return;
  }
  const iva=ivaInput.valueAsNumber;
  const summary=totals(rows,iva);
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  const vehicle=[filters.year==='Sin año indicado'?'':filters.year,filters.brand,filters.model,filters.code,filters.km?filters.km+' km':''].filter(Boolean).join(' · ');
  const lines=(items)=>items.map((r,index)=>{
   const quantity=r[7]??r[15], amount=num(r[12]);
   return `<tr><td>${index+1}</td><td>${safe(r[6])}</td><td>${safe(quantity)}</td><td>${num(quantity)?usd(r[9]):'—'}</td><td>${usd(amount)}</td></tr>`;
  }).join('');
  const section=(title,items,parts=false)=>`<table><thead><tr><th colspan="5">${title}</th></tr><tr><th>Ítem</th><th>Descripción</th><th>${parts?'Cantidad':'Horas'}</th><th>Valor unitario</th><th>Valor total</th></tr></thead><tbody>${lines(items)||`<tr><td colspan="5">Sin partidas</td></tr>`}</tbody></table>`;
  const page=document.createElement('section');
  page.id='integration-print';
  page.className='nm-printed';
  page.innerHTML=`<table class="nm-print-header"><tbody>
   <tr><th colspan="4">${proformaBrandHeader()}</th></tr>
   <tr><th colspan="4">PROFORMA DE REPUESTOS Y MANO DE OBRA PARA MANTENIMIENTO</th></tr>
   <tr><th>Vehículo</th><td colspan="3">${safe(vehicle)}</td></tr>
   <tr><th>Cliente</th><td colspan="3">${safe(fields.customer)}</td></tr>
   <tr><th>Chasis</th><td>${safe(fields.chassis||'—')}</td><th>Placa</th><td>${safe(fields.plate||'—')}</td></tr>
  </tbody></table>
  ${section('REPUESTOS',rows.filter(r=>num(r[8])!==1),true)}
  ${section('MANO DE OBRA',rows.filter(r=>num(r[8])===1))}
  <table class="nm-print-totals"><tbody>
   <tr><th>Total repuestos (sin IVA)</th><td>${usd(summary.parts)}</td></tr>
   <tr><th>Total mano de obra (sin IVA)</th><td>${usd(summary.labor)}</td></tr>
   <tr><th>Subtotal (REP + MO)</th><td>${usd(summary.subtotal)}</td></tr>
   <tr><th>IVA (${safe(iva)}%)</th><td>${usd(summary.extra)}</td></tr>
   <tr><th>Total con IVA</th><td>${usd(summary.total)}</td></tr>
  </tbody></table>
  <p><strong>NOTA</strong><br>Las piezas y trabajos adicionales que se identifiquen durante el mantenimiento se cotizarán por separado. Valores de referencia sujetos a confirmación.</p>
  <p class="nm-print-prepared"><strong>ELABORADO POR</strong><br>${safe(fields.prepared||'________________________')}</p>`;
  document.getElementById(page.id)?.remove();
  document.body.append(page);
  await Promise.all([...page.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
  if(page.isConnected)window.print();
 };
 host.append(dialog);
 connectVehicleLookup(dialog.querySelector('form'));
}

function planKey(){return JSON.stringify(['year','brand','model','code','km','plan'].map(key=>filters[key]));}
function paint(){
 const el=document.querySelector('#native-maintenance');
 if(!el)return;
 const previous=el.querySelector('#nm-proforma-editor');
 el.innerHTML=body();
 const next=el.querySelector('#nm-proforma-editor');
 if(next&&previous?.firstElementChild&&previous.dataset.planKey===planKey()){
  next.replaceWith(previous);
  previous.dispatchEvent(new Event('nm-refresh-totals'));
 }
 mountProforma();
}
async function load(){
 if(importedCatalog||source||pending)return pending;failure='';
 pending=(async()=>{const response=await fetch('assets/maintenance-reference.json.gz?v=1');if(!response.ok)throw Error('Respuesta '+response.status);if(!window.DecompressionStream)throw Error('Actualice su navegador para consultar el tarifario.');const stream=response.body.pipeThrough(new DecompressionStream('gzip'));const json=await new Response(stream).json();if(json.version!==2||!Array.isArray(json.plans)||!json.plans.length||!Array.isArray(json.items)||json.columns?.length!==16)throw Error('El archivo de planes no es válido.');referenceSource=json;referenceSource.rows=json.plans.map((p,i)=>[p[0],p[1],p[2],p[3],p[4],null,null,null,null,null,null,null,null,p[5],i,null]);if(!importedCatalog)source=referenceSource;})().catch(e=>{failure=e.message;}).finally(()=>{pending=null;paint();});
 return pending;
}
function render(options={}){importedCatalog=Array.isArray(options.catalogRows);catalogLabel=options.catalogLabel||'';source=importedCatalog?{rows:options.catalogRows}:referenceSource;workshopName=options.workshopName||'';workshopLogo=options.workshopLogo||'';registeredClients=options.clients||[];registeredVehicles=options.vehicles||[];setTimeout(()=>{load();mountProforma();},0);return '<section id="native-maintenance" class="native-maintenance">'+body()+'</section>';}
document.addEventListener('change',e=>{const key=e.target.dataset.nmFilter;if(!key||!source)return;filters[key]=e.target.value;const order=['year','brand','model','code','km','plan'],index=order.indexOf(key);if(index>=0)for(const next of order.slice(index+1))filters[next]='';paint();});

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-nm-totals')&&matchMedia('(hover: none)').matches){const drawer=b.closest('.nm-drawer');b.setAttribute('aria-expanded',String(drawer.classList.toggle('nm-open')));return;}if(b.hasAttribute('data-nm-retry')){load();paint();}if(b.hasAttribute('data-nm-reset')){filters={year:'',brand:'',model:'',code:'',km:'',plan:'',type:'',search:''};paint();}if(b.hasAttribute('data-nm-export')&&source){const rows=selection().rows,t=totals(rows);const cell=v=>'"'+text(v).replace(/^[=+@\t\r-]/,"'"+text(v)[0]).replace(/"/g,'""')+'"';const output=[['Marca','Modelo','Código modelo','Plan','KM','Ítem','Descripción','Cantidad / horas','Tipo','Subtotal USD'],...rows.map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],num(r[8])===1?'Mano de obra':'Repuesto / insumo',num(r[12]).toFixed(2)]),['Subtotal','','','','','','','','',t.subtotal.toFixed(2)],['Adicional referencia 15%','','','','','','','','',t.extra.toFixed(2)],['Total referencia','','','','','','','','',t.total.toFixed(2)]].map(r=>r.map(cell).join(';')).join('\r\n');const blob=new Blob(['\ufeff'+output],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='plan-mantenimiento-'+filters.code.replace(/[^a-z0-9]/gi,'-')+'-'+filters.km+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
window.EnjoyMaintenance={render};
// Exported pure calculations allow data integrity tests without a browser.
if(typeof module!=='undefined')module.exports={totals,visibleRows,selection,setSource:s=>{source=s;referenceSource=s;},setFilters:f=>{filters={...filters,...f};}};
})();
