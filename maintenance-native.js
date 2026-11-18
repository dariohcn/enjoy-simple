
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
function pick(rows,key,index){const vals=unique(rows,index);if(!vals.includes(filters[key])||(key==='code'&&filters[key]==='Sin versión indicada'))filters[key]=key==='code'?(vals.find(value=>value!=='Sin versión indicada')||vals[0]||''):key==='plan'?(vals[0]||''):'';return narrow(rows,key,index);}
const otherYear='__otro__';
let enteredYear='',planCustomer='',planPlate='';
function selectedYear(){
 return filters.year===otherYear
  ? (/^\d{4}$/.test(enteredYear)&&Number(enteredYear)>=1900&&Number(enteredYear)<=2100?enteredYear:'')
  : filters.year;
}
function yearsForLabel(label){
 const range=label.trim().match(/^(\d{4})\s*(?:[-‐‑‒–—−]|a|al|hasta)\s*(\d{4})$/i);
 if(!range)return [label];
 const start=Number(range[1]),end=Number(range[2]);
 if(start<1900||end>2100||start>end)return [label];
 return Array.from({length:end-start+1},(_,i)=>String(start+i));
}
function selection(){let rows=source?.rows||[],choices={};
 const yearLabel=row=>text(row[16]||modelYear(row[2]));
 const byLabel=new Map([...new Set(rows.map(yearLabel))].map(label=>[label,yearsForLabel(label)]));
 const availableYears=[...new Set([...byLabel.values()].flat())].filter(year=>year&&year!=='Sin año indicado');
 const numericYears=availableYears.filter(year=>/^\d{4}$/.test(year)).sort((a,b)=>Number(b)-Number(a));
 const originalLabels=[...byLabel.keys()].filter(label=>label&&label!=='Sin año indicado'&&!/^\d{4}$/.test(label));
 originalLabels.sort((a,b)=>b.localeCompare(a,'es-EC',{numeric:true}));
 choices.year=[...originalLabels,...numericYears];
 if(rows.length)choices.year.push(otherYear);
 if(!choices.year.includes(filters.year))filters.year='';
 const year=selectedYear();
 rows=year?rows.filter(row=>{
  const label=yearLabel(row);
  return /^\d{4}$/.test(year)?label==='Sin año indicado'||byLabel.get(label).includes(year):label===year;
 }):rows;
 const brands=unique(rows,0);
 if(brands.length===1)filters.brand=brands[0];
 for(const [key,i] of [['brand',0],['model',1],['code',2],['km',4],['plan',13]]){choices[key]=unique(rows,i);rows=pick(rows,key,i);}if(!year)rows=[];if(source?.plans)rows=rows.flatMap(h=>source.plans[h[14]][6].map(index=>{const l=source.items[index];return [h[0],h[1],h[2],h[3],h[4],l[0],l[1],l[2],l[3],l[4],l[5],l[6],l[7],h[13],null,l[8]];}));return {rows,choices};}
function visibleRows(rows){const q=filters.search.toLocaleLowerCase('es');return rows.filter(r=>(!filters.type||(filters.type==='labor'?num(r[8])===1:num(r[8])!==1))&&(!q||[r[5],r[6]].join(' ').toLocaleLowerCase('es').includes(q)));}
function totals(rows,iva=15){const labor=currencySum(rows.filter(r=>num(r[8])===1)),subtotal=currencySum(rows),parts=round(subtotal-labor);const extra=round(subtotal*iva/100);return {labor,parts,subtotal,total:round(subtotal+extra),extra,rate:Math.max(0,...rows.filter(r=>num(r[8])===1).map(r=>num(r[10])))};}
function option(key,values,label,format=x=>x){
 const missing={year:'Sin año indicado',code:'Sin versión indicada'}[key];
 const dependency={model:'Seleccione la marca',km:'Seleccione el modelo'}[key];
 const choices=key==='code'?values.filter(value=>value!==missing):values;
 const placeholder='<option value="" '+(!filters[key]?'selected':'')+'>Seleccione</option>';
 const options=choices.length?placeholder+choices.map(value=>'<option value="'+safe(value)+'" '+(value===filters[key]?'selected':'')+'>'+safe(key==='year'&&value===otherYear?'Otros':format(value))+'</option>').join(''):
  '<option>'+safe(values.length&&missing?missing+' en el catálogo':key==='km'&&filters.model?'Sin intervalos disponibles':dependency||'Sin opciones')+'</option>';
 return '<label>'+label+'<select class="form-select" data-nm-filter="'+key+'" '+(!choices.length?'disabled':'')+'>'+options+'</select></label>';
}
const encabezadosMatriz=['AÑO','MODELO','KILOMETRAJE (x 1000)','TIPO','NP','DESCRIPCIÓN','NOMENCLATURA','CANTIDAD (Hrs/Unidad/Lts)','VUNIT','SUBTOTAL','CATEGORÍA','APLICA'];
function datosMatriz(row){
 const origen=row[17]||{};
 return [row[16]==='Sin año indicado'?'':row[16],row[1],num(row[4])/1000,origen.tipo||(num(row[8])===1?'MO':'REP'),row[5],row[6],origen.nomenclatura,row[7],row[9],origen.subtotal??row[12],origen.categoria,origen.aplica];
}
function body(){
 if(!source)return '<div class="nm-state" role="status">'+(failure?'<strong>No se pudo cargar el tarifario.</strong><p>'+safe(failure)+'</p><button class="btn secondary" data-nm-retry>Reintentar</button>':'<span class="nm-loading"></span><strong>Cargando planes de mantenimiento…</strong>')+'</div>';
 const {rows:planRows,choices}=selection(),part=planRows[0];
 const plans=choices.plan.map(id=>[id,source.rows.find(r=>text(r[13])===id&&text(r[2])===filters.code)?.[3]||id]);
 const filterBar='<div class="nm-filterbar">'+option('year',choices.year,'Año')+(filters.year===otherYear?'<label>Ingrese el año<input class="form-control" type="text" inputmode="numeric" maxlength="4" data-nm-entered-year value="'+safe(enteredYear)+'" placeholder="Ej. 2018"></label>':'')+option('brand',choices.brand,'Marca')+option('model',choices.model,'Modelo')+ (choices.code.some(code=>code!=='Sin versión indicada')?option('code',choices.code,'Versión'):'')+option('km',choices.km,'Intervalo de mantenimiento',v=>v?Number(v).toLocaleString('es-EC')+' km':'Sin intervalo')+'<button class="btn secondary" data-nm-reset>Restablecer</button></div>';
 if(!part)return filterBar+'<p class="nm-footnote" role="status">Seleccione el año, la marca, el modelo y el kilometraje para abrir la proforma.</p>';
 return filterBar+'<div class="nm-context"><div><span class="nm-eyebrow">PLAN SELECCIONADO</span><h2>'+safe(part?.[3]||'Sin partidas')+'</h2><p>'+safe(filters.brand)+' · '+safe(filters.model)+' · '+(filters.code&&filters.code!=='Sin versión indicada'?safe(filters.code):'')+'</p></div>'+(plans.length>1?option('plan',plans.map(x=>x[0]),'Variante de plan',id=>plans.find(x=>x[0]===id)[1]):'<span class="nm-tag">'+planRows.length+' partidas en el plan</span>')+'</div>'+
 '<section id="nm-proforma-editor" aria-label="Rubros editables de la proforma"></section>'+
 (catalogLabel?'<p class="nm-footnote">Catálogo importado · '+safe(catalogLabel)+'</p>':'<p class="nm-footnote">Tarifario de referencia del informe proporcionado · última actualización de origen: 26/11/2025. Se consulta una sola versión y un solo plan para evitar sumar vehículos distintos. El IVA se puede ajustar en cada proforma.</p>');
}


function connectVehicleLookup(form){
 const customer=form.elements.namedItem('customer');
 const plate=form.elements.namedItem('plate');
 const clientMatches=form.querySelector('[data-client-matches]');
 const clientChooser=form.querySelector('[data-client-choice]');
 const vehicleMatches=form.querySelector('[data-vehicle-matches]');
 const vehicleChooser=form.querySelector('[data-vehicle-choice]');
 const status=form.querySelector('[data-vehicle-status]');
 const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim().replace(/\s+/g,' ');
 const normalizePlate=value=>normalize(value).replace(/[^a-z0-9]/g,'');
 const customers=new Map(registeredClients.map(client=>[client.id,client.name||'']));
 const clients=[...customers].filter(([,name])=>name).map(([id,name])=>{
  const normalized=normalize(name);
  const words=normalized.split(' ');
  return {id,name,normalized,words,initials:words.map(word=>word[0]).join('')};
 });
 const vehicles=registeredVehicles.filter(vehicle=>vehicle.plate).map(vehicle=>({
  clientId:vehicle.clientId,customer:customers.get(vehicle.clientId)||'',plate:vehicle.plate,
  model:[vehicle.brand,vehicle.model,vehicle.year].filter(Boolean).join(' ')
 }));
 let selectedClient='',clientOptions=[],vehicleOptions=[];

 function showVehicles(options,chosenPlate=''){
  vehicleOptions=options;
  vehicleMatches.hidden=!options.length;
  vehicleChooser.replaceChildren(new Option('Seleccione el vehículo',''),...options.map((record,index)=>
   new Option([record.plate,record.model,record.customer].filter(Boolean).join(' · '),String(index))));
  const index=options.findIndex(record=>record.plate===chosenPlate);
  if(index>=0)vehicleChooser.value=String(index);
 }

 function applyVehicle(record){
  plate.value=record.plate;
  if(record.customer)customer.value=record.customer;
  selectedClient=record.clientId||'';
  clientMatches.hidden=true;
  showVehicles(vehicles.filter(vehicle=>vehicle.clientId===selectedClient),record.plate);
  status.textContent='Vehículo seleccionado: '+[record.model,record.plate].filter(Boolean).join(' · ')+'.';
  status.hidden=false;
 }

 customer.addEventListener('input',()=>{
  const term=normalize(customer.value);
  const initials=term.replace(/[^a-z]/g,'');
  const terms=term.split(' ');
  selectedClient='';
  status.hidden=true;
  showVehicles([]);
  clientOptions=term?clients.filter(client=>client.normalized.includes(term)||
   terms.every(part=>client.words.some(word=>word.startsWith(part)))||
   (initials&&client.initials.startsWith(initials))).slice(0,30):[];
  clientMatches.hidden=!clientOptions.length;
  clientChooser.innerHTML=clientOptions.map((client,index)=>
   '<li><button type="button" data-client-option="'+index+'">'+safe(client.name)+'</button></li>').join('');
 });

 clientChooser.addEventListener('click',event=>{
  const option=event.target.closest('[data-client-option]');
  if(!option)return;
  const client=clientOptions[Number(option.dataset.clientOption)];
  selectedClient=client.id;
  customer.value=client.name;
  clientMatches.hidden=true;
  status.hidden=true;
  const options=vehicles.filter(record=>record.clientId===selectedClient);
  if(options.length===1){applyVehicle(options[0]);plate.focus();return;}
  if(!options.some(record=>normalizePlate(record.plate)===normalizePlate(plate.value)))plate.value='';
  showVehicles(options);
  (options.length?vehicleChooser:plate).focus();
 });

 function lookupPlate(exactOnly){
  const query=normalizePlate(plate.value);
  const options=vehicles.filter(record=>(!selectedClient||record.clientId===selectedClient)&&
   normalizePlate(record.plate).includes(query));
  const exact=options.filter(record=>normalizePlate(record.plate)===query);
  if(exactOnly&&query&&exact.length===1){applyVehicle(exact[0]);return;}
  status.hidden=true;
  showVehicles(selectedClient?vehicles.filter(record=>record.clientId===selectedClient):query.length>=2?options:[]);
 }
 plate.addEventListener('input',()=>lookupPlate(false));
 plate.addEventListener('change',()=>lookupPlate(true));
 vehicleChooser.addEventListener('change',()=>{if(vehicleChooser.value!=='')applyVehicle(vehicleOptions[Number(vehicleChooser.value)]);});
}

let vehicleBrandLogo='';
function proformaBrandHeader(){
 const name=workshopName||'Taller de mecánica';
 const brand=filters.brand;
 const shopLabel=/^Administración de enjoy$/i.test(name)?'':name;
 const workshop=/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(workshopLogo)&&workshopLogo.length<=75000
  ?'<img data-nm-workshop-logo src="'+safe(workshopLogo)+'" alt="Logo de '+safe(name)+'">'
  :'';
 const logo=vehicleBrandLogo?'<img src="'+safe(vehicleBrandLogo)+'" alt="Logo de '+safe(brand)+'">':'';
 return '<div class="nm-proforma-brand"><div class="nm-company-logo">'+workshop+(shopLabel?'<span>'+safe(shopLabel)+'</span>':'')+'</div><strong class="nm-enjoy-mark">enjoy</strong><div class="nm-company-logo">'+logo+'<span>'+safe(brand)+'</span></div></div>';
}

async function removeWorkshopLogoBackground(container){
 const img=container.querySelector('[data-nm-workshop-logo]');
 if(!img)return;
 try{
  await img.decode();
  const canvas=document.createElement('canvas');
  const width=canvas.width=img.naturalWidth;
  const height=canvas.height=img.naturalHeight;
  if(!width||!height||width*height>160000)return;
  const context=canvas.getContext('2d');
  context.drawImage(img,0,0);
  const pixels=context.getImageData(0,0,width,height);
  const rgba=pixels.data;
  const queue=new Uint32Array(width*height);
  let end=0;
  function visit(index){
   const offset=index*4;
   const red=rgba[offset],green=rgba[offset+1],blue=rgba[offset+2];
   if(!rgba[offset+3]||Math.min(red,green,blue)<242||Math.max(red,green,blue)-Math.min(red,green,blue)>9)return;
   rgba[offset+3]=0;
   queue[end++]=index;
  }
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
  for(let start=0;start<end;start++){
   const index=queue[start],x=index%width;
   if(x>0)visit(index-1);
   if(x<width-1)visit(index+1);
   if(index>=width)visit(index-width);
   if(index<width*(height-1))visit(index+width);
  }
  if(!end)return;
  context.putImageData(pixels,0,0);
  img.src=canvas.toDataURL('image/png');
  await img.decode();
 }catch{
  // El logo registrado queda disponible si el navegador no puede procesarlo.
 }
}
function vehicleDescription(){
 const year=selectedYear();
 const version=filters.code==='Sin versión indicada'?'':filters.code;
 return [year,filters.brand,filters.model,version,filters.km?Number(filters.km).toLocaleString('es-EC')+' km':''].filter(Boolean).join(' · ');
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
 const vehicleLabel=vehicleDescription();
 const issueDate=new Date();
 const issueDay=[issueDate.getFullYear(),issueDate.getMonth()+1,issueDate.getDate()]
  .map((part,index)=>String(part).padStart(index===0?4:2,'0')).join('-');
 const issueLabel=new Intl.DateTimeFormat('es-EC',{dateStyle:'long'}).format(issueDate);
 dialog.innerHTML=`<form>
  <div class="nm-plan-toolbar">
   <div><h2>Proforma</h2><p data-plan-mode hidden></p></div>
   <div class="nm-actions"><button type="button" class="btn" data-edit-plan aria-pressed="false">Modificar plan</button><button type="button" class="btn secondary" data-nm-export>Descargar estándar (CSV)</button></div>
  </div>
  <table class="nm-form-header"><tbody>
   <tr><th colspan="4">${proformaBrandHeader()}</th></tr>
   <tr><th colspan="4">PROFORMA DE REPUESTOS Y MANO DE OBRA PARA MANTENIMIENTO</th></tr>
   <tr><th scope="row">Fecha de emisión</th><td colspan="3"><time class="nm-issue-date" data-nm-issued datetime="${safe(issueDay)}">${safe(issueLabel)}</time></td></tr>
   <tr><th scope="row">Vehículo</th><td colspan="3" data-nm-vehicle-label>${safe(vehicleLabel)}</td></tr>
   <tr class="nm-party-row"><th scope="row"><label for="nm-customer">Cliente</label></th><td><input id="nm-customer" class="form-control" name="customer" autocomplete="off" required maxlength="120" value="${safe(planCustomer)}"><div class="nm-client-matches" data-client-matches hidden><ul data-client-choice aria-label="Clientes que coinciden"></ul></div></td>
    <th scope="row"><label for="nm-plate">Placa</label></th><td class="nm-plate-cell"><input id="nm-plate" class="form-control" name="plate" maxlength="20" value="${safe(planPlate)}"><div class="nm-vehicle-matches" data-vehicle-matches hidden><label>Vehículo registrado<select class="form-select" data-vehicle-choice></select></label></div></td></tr>
  </tbody></table>
  <p data-vehicle-status role="status" hidden></p>
  <div class="nm-quote-lines"></div>
  <div class="nm-quote-summary">
   <table class="nm-form-totals"><tbody>
    <tr><th scope="row">Total repuestos (sin IVA)</th><td data-total="parts"></td></tr>
    <tr><th scope="row">Valor hora máximo</th><td data-total="rate"></td></tr>
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
  const instructions=dialog.querySelector('[data-plan-mode]');
  instructions.hidden=!editing;
  instructions.textContent=editing?'Agregue, quite o ajuste las partidas de esta proforma.':'';
  for(const input of editor.querySelectorAll('input'))input.readOnly=!editing;
 };
 editor.addEventListener('input',refreshTotal);
 ivaInput.addEventListener('input',refreshTotal);
 refreshTotal();
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();
  const rows=readRows();
  if(!rows.length||rows.some(r=>!r[6]||!Number.isFinite(r[12]))){
   dialog.querySelector('output').textContent='Agregue al menos una partida y complete su descripción, cantidad y valor.';
   return;
  }
  const iva=ivaInput.valueAsNumber;
  const summary=totals(rows,iva);
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  const vehicle=vehicleDescription();
  const lines=(items)=>items.map((r,index)=>{
   const quantity=r[7]??r[15], amount=num(r[12]);
   return `<tr><td>${index+1}</td><td>${safe(r[6])}</td><td>${safe(quantity)}</td><td>${num(quantity)?usd(r[9]):'—'}</td><td>${usd(amount)}</td></tr>`;
  }).join('');
  const section=(title,items,parts=false)=>`<table><thead><tr><th colspan="5">${title}</th></tr><tr><th>Ítem</th><th>Descripción</th><th>${parts?'Cantidad':'Horas'}</th><th>Valor unitario</th><th>Valor total</th></tr></thead><tbody>${lines(items)||`<tr><td colspan="5">Sin partidas</td></tr>`}</tbody></table>`;
  const page=document.createElement('section');
  page.id='integration-print';
  page.className='nm-printed';
  const issued=event.currentTarget.querySelector('[data-nm-issued]');
  page.innerHTML=`<table class="nm-print-header"><tbody>
   <tr><th colspan="4">${proformaBrandHeader()}</th></tr>
   <tr><th colspan="4">PROFORMA DE REPUESTOS Y MANO DE OBRA PARA MANTENIMIENTO</th></tr>
   <tr><th>Fecha de emisión</th><td colspan="3"><time datetime="${safe(issued.dateTime)}">${safe(issued.textContent)}</time></td></tr>
   <tr><th>Vehículo</th><td colspan="3">${safe(vehicle)}</td></tr>
   <tr class="nm-party-row"><th>Cliente</th><td>${safe(fields.customer)}</td><th>Placa</th><td class="nm-plate-cell">${safe(fields.plate||'—')}</td></tr>
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
  await removeWorkshopLogoBackground(page);
  await Promise.all([...page.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
  if(page.isConnected)window.print();
 };
 host.append(dialog);
 void removeWorkshopLogoBackground(dialog);
 connectVehicleLookup(dialog.querySelector('form'));
}

function planKey(){return JSON.stringify([selectedYear(),...['brand','model','code','km','plan'].map(key=>filters[key])]);}
function paint(){
 const el=document.querySelector('#native-maintenance');
 if(!el)return;
 const previous=el.querySelector('#nm-proforma-editor');
 el.innerHTML=body();
 const next=el.querySelector('#nm-proforma-editor');
 if(next&&previous?.firstElementChild&&previous.dataset.planKey===planKey()){
  next.replaceWith(previous);
 }
 mountProforma();
}
async function load(){
 if(importedCatalog||source||pending)return pending;failure='';
 pending=(async()=>{const response=await fetch('assets/maintenance-reference.json.gz?v=1');if(!response.ok)throw Error('Respuesta '+response.status);if(!window.DecompressionStream)throw Error('Actualice su navegador para consultar el tarifario.');const stream=response.body.pipeThrough(new DecompressionStream('gzip'));const json=await new Response(stream).json();if(json.version!==2||!Array.isArray(json.plans)||!json.plans.length||!Array.isArray(json.items)||json.columns?.length!==16)throw Error('El archivo de planes no es válido.');referenceSource=json;referenceSource.rows=json.plans.map((p,i)=>[p[0],p[1],p[2],p[3],p[4],null,null,null,null,null,null,null,null,p[5],i,null]);if(!importedCatalog)source=referenceSource;})().catch(e=>{failure=e.message;}).finally(()=>{pending=null;paint();});
 return pending;
}
function prefillPlanVehicle(vehicle){
 if(!vehicle||!source?.rows?.length)return;
 const key=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const brandKey=key(vehicle.brand),modelKey=key(vehicle.model),year=text(vehicle.year);
 if(!brandKey||!source.rows.some(row=>key(row[0])===brandKey))return;
 if(/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=2100){
  if(selection().choices.year.includes(year))filters.year=year;
  else{filters.year=otherYear;enteredYear=year;}
 }
 const brand=selection().choices.brand.find(value=>key(value)===brandKey);
 if(!brand)return;
 filters.brand=brand;
 const models=selection().choices.model;
 const exact=models.filter(value=>key(value)===modelKey);
 const alternatives=modelKey?models.filter(value=>key(value).startsWith(modelKey)):[];
 if(exact.length===1)filters.model=exact[0];
 else if(!exact.length&&alternatives.length===1)filters.model=alternatives[0];
}

function render(options={}){enteredYear='';filters={year:'',brand:'',model:'',code:'',km:'',plan:'',type:'',search:''};vehicleBrandLogo=options.vehicleBrandLogo||'';importedCatalog=Array.isArray(options.catalogRows);catalogLabel=options.catalogLabel||'';source=importedCatalog?{rows:options.catalogRows}:referenceSource;workshopName=options.workshopName||'';workshopLogo=options.workshopLogo||'';registeredClients=options.clients||[];registeredVehicles=options.vehicles||[];planCustomer=options.selectedClient?.name||'';planPlate=options.selectedVehicle?.plate||'';prefillPlanVehicle(options.selectedVehicle);setTimeout(()=>{load();mountProforma();},0);return '<section id="native-maintenance" class="native-maintenance">'+body()+'</section>';}
function resetLaterFilters(key){
 const order=['year','brand','model','code','km','plan'];
 const index=order.indexOf(key);
 if(index>=0)for(const next of order.slice(index+1))filters[next]='';
}
document.addEventListener('change',event=>{
 const key=event.target.dataset.nmFilter;
 if(!key||!source)return;
 filters[key]=event.target.value;
 if(key==='year'&&filters.year!==otherYear)enteredYear='';
 if(key!=='year')resetLaterFilters(key);
 paint();
 if(key==='year'&&filters.year===otherYear)document.querySelector('[data-nm-entered-year]')?.focus();
});
document.addEventListener('input',event=>{
 const input=event.target;
 if(!input.hasAttribute('data-nm-entered-year')||filters.year!==otherYear)return;
 const previousYear=selectedYear();
 enteredYear=input.value.replace(/[^0-9]/g,'').slice(0,4);
 input.value=enteredYear;
 if(previousYear===selectedYear())return;
 paint();
 document.querySelector('[data-nm-entered-year]')?.focus({preventScroll:true});
});

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-nm-retry')){load();paint();}if(b.hasAttribute('data-nm-reset')){enteredYear='';filters={year:'',brand:'',model:'',code:'',km:'',plan:'',type:'',search:''};paint();}if(b.hasAttribute('data-nm-export')&&source){const rows=selection().rows,t=totals(rows);const cell=v=>'"'+text(v).replace(/^[=+@\t\r-]/,"'"+text(v)[0]).replace(/"/g,'""')+'"';const output=(importedCatalog?[encabezadosMatriz,...rows.map(datosMatriz)]:[['Marca','Modelo','Código modelo','Plan','KM','Ítem','Descripción','Cantidad / horas','Tipo','Subtotal USD'],...rows.map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],num(r[8])===1?'Mano de obra':'Repuesto / insumo',num(r[12]).toFixed(2)]),['Subtotal','','','','','','','','',t.subtotal.toFixed(2)],['Adicional referencia 15%','','','','','','','','',t.extra.toFixed(2)],['Total referencia','','','','','','','','',t.total.toFixed(2)]]).map(r=>r.map(cell).join(';')).join('\r\n');const blob=new Blob(['\ufeff'+output],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='plan-mantenimiento-'+filters.code.replace(/[^a-z0-9]/gi,'-')+'-'+filters.km+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
window.EnjoyMaintenance={render,yearsForLabel};
// Exported pure calculations allow data integrity tests without a browser.
if(typeof module!=='undefined')module.exports={totals,visibleRows,selection,setSource:s=>{source=s;referenceSource=s;},setFilters:f=>{filters={...filters,...f};}};
})();
