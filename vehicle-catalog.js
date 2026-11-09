
(() => {
'use strict';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const columns=['anio','modelo','version','km','codigo','tipo','descripcion','cantidad','precio'];
const logoUrl=value=>/^https:\/\/upload\.wikimedia\.org\/[^"\s<>]+$/.test(value||'')?value:'';
const zoneLabel={general:'General',sierra:'Sierra',costa:'Costa'};
const typeLabel={liviano:'Liviano',pesado:'Pesado'};
let excelScript;
function excelReader(){
 if(window.XLSX)return Promise.resolve(window.XLSX);
 if(!excelScript)excelScript=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const failed=()=>{clearTimeout(timeout);excelScript=null;script.remove();reject(Error('No se pudo cargar el lector de Excel. Reintentá o usá CSV.'));};
  const timeout=setTimeout(failed,15000);
  script.onload=()=>{clearTimeout(timeout);resolve(window.XLSX);};
  script.onerror=failed;
  document.head.append(script);
 });
 return excelScript;
}
function csvRows(text){
 text=text.replace(/^\uFEFF/,'');
 const separator=text.split(/\r?\n/,1)[0].includes(';')?';':',';
 const rows=[];let cells=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(char==='"'){
   if(quoted&&text[i+1]==='"'){value+='"';i++;}
   else quoted=!quoted;
  }else if(!quoted&&char===separator){cells.push(value);value='';}
  else if(!quoted&&(char==='\r'||char==='\n')){
   if(char==='\r'&&text[i+1]==='\n')i++;
   cells.push(value);rows.push(cells);cells=[];value='';
  }else value+=char;
 }
 if(quoted)throw Error('El CSV contiene comillas sin cerrar.');
 cells.push(value);rows.push(cells);
 return rows;
}
function parseRows(rows){
 const nonempty=rows.filter(row=>row.some(cell=>String(cell??'').trim()));
 const headers=(nonempty.shift()||[]).map(cell=>String(cell??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/^ano$/,'anio'));
 if(columns.some(name=>!headers.includes(name)))throw Error('Encabezados requeridos: '+columns.join(', ')+'.');
 if(!nonempty.length||nonempty.length>2000)throw Error('El archivo debe contener entre 1 y 2.000 partidas.');
 const number=value=>/^\d+(?:[.,]\d+)?$/.test(value)?Number(value.replace(',','.')):NaN;
 const seen=new Set();
 return nonempty.map((row,i)=>{
  const item=Object.fromEntries(columns.map(name=>[name,String(row[headers.indexOf(name)]??'').trim()]));
  for(const name of ['anio','km','cantidad','precio'])item[name]=number(item[name]);
  item.tipo=item.tipo.toUpperCase();
  if(!Number.isInteger(item.anio)||item.anio<1900||item.anio>2100||!Number.isInteger(item.km)||item.km<0||item.km>2000000||
   !(item.cantidad>0&&item.cantidad<=100000)||!(item.precio>=0&&item.precio<=1000000)||!['MO','R'].includes(item.tipo)||
   !item.modelo||item.modelo.length>120||!item.version||item.version.length>120||!item.codigo||item.codigo.length>80||
   !item.descripcion||item.descripcion.length>240)throw Error('Revisá los datos de la fila '+(i+2)+'.');
  const key=JSON.stringify([item.anio,item.modelo,item.version,item.km,item.tipo,item.codigo]);
  if(seen.has(key))throw Error('Código repetido dentro del plan en la fila '+(i+2)+'.');
  seen.add(key);
  return item;
 });
}
function parseMatrix(rows){
 const clean=value=>String(value??'').trim();
 const headers=(rows[0]||[]).map(value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());
 const column=name=>headers.findIndex(header=>header===name||header.startsWith(name+' ('));
 const indexes=['MODELO','KILOMETRAJE','TIPO','NP','DESCRIPCION','CANTIDAD','VUNIT'].map(column);
 if(indexes.some(index=>index<0))throw Error('La hoja MATRIZ no tiene los encabezados de mantenimiento esperados.');
 if(rows.length>20001)throw Error('La hoja supera el máximo de 20.000 partidas.');
 const items=[],omissions=[];
 const number=value=>clean(value)===''?NaN:Number(clean(value).replace(',','.'));
 for(let i=1;i<rows.length;i++){
  const row=rows[i]||[];
  if(!row.some(value=>clean(value)))continue;
  const [model,kmText,type,code,description,quantity,price]=indexes.map(index=>row[index]);
  const km=number(kmText)*(headers[indexes[1]].includes('1000')?1000:1);
  const item={anio:null,modelo:clean(model),version:'Sin versión indicada',km,codigo:clean(code),
   tipo:clean(type).toUpperCase()==='REP'?'R':clean(type).toUpperCase(),descripcion:clean(description),cantidad:number(quantity),precio:number(price)};
  const issue=!Number.isFinite(item.precio)||item.precio<0||item.precio>1000000?'precio inválido':
   !(item.cantidad>0&&item.cantidad<=100000)?'cantidad inválida':
   !item.modelo||item.modelo.length>120||!item.codigo||item.codigo.length>80||!item.descripcion||item.descripcion.length>2500||
   !Number.isInteger(km)||km<0||km>2000000||!['MO','R'].includes(item.tipo)?'datos incompletos o fuera de rango':'';
  if(issue)omissions.push('Fila '+(i+1)+': '+issue);
  else items.push(item);
 }
 if(!items.length)throw Error('La hoja MATRIZ no contiene partidas válidas.');
 return {items,omissions,sheet:'MATRIZ'};
}
async function readFile(file,stage,workbook,sheetName){
 if(!file||file.size>5*1024*1024)throw Error('Elegí un archivo de hasta 5 MB.');
 if(/\.csv$/i.test(file.name)){
  const rows=csvRows(await file.text());
  stage(2,'Validando filas del CSV…');
  return {items:parseRows(rows),omissions:[],sheet:'CSV'};
 }
 if(!/\.xlsx?$/i.test(file.name))throw Error('Usá un archivo Excel (.xlsx o .xls) o CSV.');
 if(!workbook||!sheetName)throw Error('Elegí la hoja de Excel que querés importar.');
 const sheet=workbook.book.Sheets[sheetName];
 if(!sheet)throw Error('La hoja seleccionada no está disponible.');
 const matrix=sheetName.trim().toUpperCase()==='MATRIZ';
 stage(2,'Validando hoja '+sheetName+'…');
 await new Promise(resolve=>setTimeout(resolve,0));
 const rows=workbook.xlsx.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:matrix});
 return matrix?parseMatrix(rows):{items:parseRows(rows),omissions:[],sheet:sheetName};
}
async function wikiJson(base,params,signal){
 const query=new URLSearchParams({...params,format:'json',origin:'*'});
 const response=await fetch(base+'?'+query,{signal});
 if(!response.ok)throw Error('No se pudo consultar Wikimedia.');
 return response.json();
}
async function findLogo(name,signal){
 const base='https://www.wikidata.org/w/api.php';
 const search=await wikiJson(base,{action:'wbsearchentities',search:name,language:'es',limit:'5',type:'item'},signal);
 const results=search.search||[];
 if(!results.length)return '';
 const entities=await wikiJson(base,{action:'wbgetentities',ids:results.map(x=>x.id).join('|'),props:'claims'},signal);
 const match=results.find(x=>x.label.toLowerCase()===name.toLowerCase()&&entities.entities[x.id]?.claims?.P154?.length)
  ||results.find(x=>/veh[ií]cul|autom[oó]vil|fabricant|vehicle|automotive|car manufactur/i.test(x.description||'')&&entities.entities[x.id]?.claims?.P154?.length);
 const image=entities.entities[match?.id]?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
 if(!image)return '';
 const file=await wikiJson('https://commons.wikimedia.org/w/api.php',{action:'query',titles:'File:'+image,prop:'imageinfo',iiprop:'url',iiurlwidth:'160'},signal);
 const info=Object.values(file.query?.pages||{})[0]?.imageinfo?.[0];
 return logoUrl(info?.thumburl||info?.url);
}
const scopeFields='<label>Tipo de vehículo<select name="vehicle_type" class="form-select" required><option value="">Seleccioná</option><option value="liviano">Liviano</option><option value="pesado">Pesado</option></select></label><label data-region hidden>Región<select name="region" class="form-select"><option value="">Seleccioná</option><option value="sierra">Sierra</option><option value="costa">Costa</option></select></label>';
function currentScope(form){
 const type=form.elements.vehicle_type.value;
 const region=form.elements.region;
 region.closest('label').hidden=type!=='pesado';
 region.required=type==='pesado';
 return {vehicle_type:type,region:type==='pesado'?region.value:'general'};
}
function adminView(){
 return '<section id="vehicle-import" class="card integration-pad"><div class="fields">'+
 '<form data-brand-form><h2>Crear marca de vehículo</h2><label>Marca<input class="form-control" name="brand" maxlength="80" required placeholder="Ej. CHERY"></label>'+
 '<div data-logo-preview></div><label>URL del logo de Wikimedia (opcional)<input class="form-control" name="logo" type="url" maxlength="1000"></label>'+
 '<p data-brand-status role="status"></p><button class="btn">Guardar marca</button></form>'+
 '<form data-catalog-form><h2>Cargar catálogo por marca</h2><label>Marca<select name="brand" class="form-select" required></select></label>'+scopeFields+
 '<label>Archivo Excel o CSV<input class="form-control" name="file" type="file" accept=".xlsx,.xls,.csv" required></label>'+
 '<label data-sheet-picker hidden>Hoja de Excel<select name="sheet" class="form-select"></select></label><p>Seleccioná la hoja que contiene las partidas. Cada carga actualiza el catálogo activo de la marca, el tipo y la región seleccionados.</p>'+
 '<a download="plantilla-catalogo.csv" href="data:text/csv;charset=utf-8,'+encodeURIComponent(columns.join(';')+'\r\n')+'">Descargar plantilla CSV</a>'+
 '<progress data-import-progress max="4" value="0" aria-label="Avance de la importación" hidden></progress><p data-catalog-status role="status" aria-live="polite"></p><button class="btn">Validar e importar</button><button type="button" class="btn secondary" data-import-confirm hidden>Importar partidas válidas</button></form></div>'+
 '<h2>Catálogos activos por marca</h2><div data-catalog-index role="status">Cargando…</div></section>';
}
function wireAdmin(){
 const host=document.querySelector('#vehicle-import');
 if(!host||host.dataset.wired)return;
 host.dataset.wired='true';
 const brandForm=host.querySelector('[data-brand-form]'),importForm=host.querySelector('[data-catalog-form]');
 const brandStatus=host.querySelector('[data-brand-status]'),importStatus=host.querySelector('[data-catalog-status]');
 const preview=host.querySelector('[data-logo-preview]');
 let logoTimer,logoRequest;
 function showLogo(){
  const url=logoUrl(brandForm.elements.logo.value);
  preview.innerHTML=url?'<img src="'+escapeHtml(url)+'" alt="Vista previa del logo" width="80" height="55" style="object-fit:contain">':'';
 }
 async function refreshIndex(){
  const index=await api('vehicle-catalog-index');
  if(!host.isConnected)return;
  const select=importForm.elements.brand;
  const current=select.value;
  select.replaceChildren(new Option('Seleccioná una marca',''),...index.brands.map(b=>new Option(b.name,b.name)));
  select.value=index.brands.some(b=>b.name===current)?current:'';
  host.querySelector('[data-catalog-index]').innerHTML=index.imports.length?table(['Marca','Tipo','Región','Archivo','Partidas','Fecha'],index.imports.map(row=>'<tr><td>'+escapeHtml(row.brand)+'</td><td>'+typeLabel[row.vehicle_type]+'</td><td>'+zoneLabel[row.region]+'</td><td>'+escapeHtml(row.filename)+'</td><td>'+Number(row.count)+'</td><td>'+escapeHtml(new Date(row.created_at).toLocaleDateString('es-EC',{timeZone:'America/Guayaquil'}))+'</td></tr>')):'<p>Todavía no hay catálogos importados.</p>';
  labelTables();
 }
 brandForm.elements.logo.addEventListener('input',()=>{logoRequest?.abort();clearTimeout(logoTimer);showLogo();});
 brandForm.elements.brand.addEventListener('input',()=>{
  clearTimeout(logoTimer);logoRequest?.abort();
  brandForm.elements.logo.value='';showLogo();
  const name=brandForm.elements.brand.value.trim();
  brandStatus.textContent='';
  if(name.length<2)return;
  logoTimer=setTimeout(async()=>{
   logoRequest=new AbortController();
   const signal=logoRequest.signal;
   brandStatus.textContent='Buscando logo en Wikimedia…';
   try{
    const logo=await findLogo(name,signal);
    if(signal.aborted||!host.isConnected)return;
    brandForm.elements.logo.value=logo;showLogo();
    brandStatus.textContent=logo?'Revisá el logo antes de guardar la marca.':'No se encontró un logo. Podés ingresar su URL o guardar la marca.';
   }catch(e){if(!signal.aborted)brandStatus.textContent='La búsqueda de logo no está disponible. Podés guardar la marca.';}
  },550);
 });
 brandForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=brandForm.querySelector('button');
  button.disabled=true;
  try{
   const entered=brandForm.elements.logo.value.trim();
   if(entered&&!logoUrl(entered))throw Error('Ingresá una URL de imagen de upload.wikimedia.org.');
   const brand=await api('vehicle-brand-save',{brand:brandForm.elements.brand.value,logo_url:entered});
   clearTimeout(logoTimer);logoRequest?.abort();await refreshIndex();importForm.elements.brand.value=brand.name;
   brandStatus.textContent='Marca guardada.';
  }catch(e){brandStatus.textContent=e.message;}finally{button.disabled=false;}
 });
 importForm.elements.vehicle_type.addEventListener('change',()=>currentScope(importForm));

 const progress=importForm.querySelector('[data-import-progress]');
 const confirm=importForm.querySelector('[data-import-confirm]');
 const submit=importForm.querySelector('button[type="submit"],button:not([type])');
 const sheetField=importForm.elements.sheet, sheetPicker=sheetField.closest('label');
 let pendingImport=null,workbook=null,fileVersion=0;
 function stage(step,message){
  progress.hidden=false;progress.value=step;importStatus.textContent=message;
 }
 async function publish(payload,omissions){
  submit.disabled=true;confirm.disabled=true;
  stage(3,'Guardando '+payload.items.length.toLocaleString('es-EC')+' partidas en Supabase…');
  try{
   const result=await api('vehicle-catalog-import',payload);
   stage(4,'Importación completada: '+result.imported.toLocaleString('es-EC')+' partidas publicadas en '+payload.brand+' · '+typeLabel[payload.vehicle_type]+' · '+zoneLabel[payload.region]+'.'+(omissions.length?' Omitidas: '+omissions.length+'.':''));
   pendingImport=null;confirm.hidden=true;importForm.elements.file.value='';workbook=null;sheetPicker.hidden=true;sheetField.required=false;sheetField.replaceChildren();
   await refreshIndex().catch(()=>{importStatus.textContent+=' No se pudo actualizar la tabla de catálogos.';});
  }catch(e){stage(3,'No se pudo confirmar la importación: '+e.message);}
  finally{submit.disabled=false;confirm.disabled=false;}
 }
 importForm.elements.file.addEventListener('change',async()=>{
  const token=++fileVersion;
  const file=importForm.elements.file.files[0];
  workbook=null;sheetPicker.hidden=true;sheetField.required=false;sheetField.replaceChildren();submit.disabled=false;
  if(!file||!/\.xlsx?$/i.test(file.name))return;
  submit.disabled=true;
  stage(1,'Leyendo las hojas del Excel…');
  try{
   if(file.size>5*1024*1024)throw Error('Elegí un archivo de hasta 5 MB.');
   const xlsx=await excelReader();
   const book=xlsx.read(await file.arrayBuffer(),{type:'array',sheetRows:20002});
   if(token!==fileVersion||!host.isConnected)return;
   if(!book.SheetNames.length)throw Error('El archivo no contiene hojas.');
   workbook={xlsx,book};
   sheetField.replaceChildren(...book.SheetNames.map(name=>new Option(name,name)));
   sheetField.value=book.SheetNames.find(name=>name.trim().toUpperCase()==='MATRIZ')||book.SheetNames[0];
   sheetPicker.hidden=false;sheetField.required=true;
   stage(1,'Hojas detectadas: '+book.SheetNames.length+'. Seleccioná una hoja y pulsá Validar e importar.');
  }catch(e){if(token===fileVersion)stage(1,'No se pudo leer el Excel: '+e.message);}
  finally{if(token===fileVersion)submit.disabled=false;}
 });
 importForm.addEventListener('change',event=>{
  pendingImport=null;confirm.hidden=true;
  if(submit.disabled)return;
  progress.hidden=true;
  importStatus.textContent=importForm.elements.file.files[0]?(workbook?'Hoja seleccionada: '+sheetField.value+'. ':'Archivo seleccionado. ')+'Pulsá Validar e importar.':'';
 });
 confirm.addEventListener('click',()=>{if(pendingImport)publish(pendingImport.payload,pendingImport.omissions);});
 importForm.addEventListener('submit',async event=>{
  event.preventDefault();submit.disabled=true;confirm.hidden=true;pendingImport=null;
  stage(1,'Leyendo el archivo…');
  try{
   const file=importForm.elements.file.files[0],scope=currentScope(importForm),brand=importForm.elements.brand.value;
   await new Promise(resolve=>setTimeout(resolve,0));
   const {items,omissions,sheet}=await readFile(file,stage,workbook,sheetField.value);
   const payload={...scope,brand,filename:file.name,items};
   if(omissions.length){
    pendingImport={payload,omissions};
    stage(2,brand+' · '+sheet+': '+items.length.toLocaleString('es-EC')+' partidas válidas y '+omissions.length+' con errores. '+omissions.slice(0,8).join(' · ')+'. Todavía no se ha publicado el catálogo.');
    confirm.textContent='Importar '+items.length.toLocaleString('es-EC')+' partidas válidas';
    confirm.hidden=false;
   }else await publish(payload,omissions);
  }catch(e){stage(progress.value,'Importación detenida: '+e.message);}
  finally{submit.disabled=false;}
 });
 refreshIndex().catch(e=>{host.querySelector('[data-catalog-index]').textContent=e.message;});
}
function planView(){
 return '<section id="vehicle-plan-scope" class="card integration-pad"><form class="fields">'+scopeFields+
 '<label>Marca del catálogo<select name="brand" class="form-select" disabled><option value="">Seleccioná el tipo</option></select></label></form>'+
 '<p data-scope-status role="status">Elegí Liviano o Pesado para consultar un catálogo.</p>'+
 '<button class="btn secondary" data-reference type="button">Consultar referencia original</button></section><div id="vehicle-plan-content"></div>';
}
function rowsForPlan(items,brand){
 return items.map(item=>{
  const kind=item.tipo==='MO'?1:0;
  const total=Math.round(item.cantidad*item.precio*100)/100;
  return [brand,item.modelo,item.version,'Mantenimiento '+item.km.toLocaleString('es-EC')+' km',item.km,item.codigo,item.descripcion,item.cantidad,kind,item.precio,kind?item.precio:0,0,total,JSON.stringify([item.anio,item.modelo,item.version,item.km]),null,item.cantidad,item.anio??'Sin año indicado'];
 });
}
function wirePlan(options){
 const host=document.querySelector('#vehicle-plan-scope'),output=document.querySelector('#vehicle-plan-content');
 if(!host||host.dataset.wired)return;
 host.dataset.wired='true';
 const form=host.querySelector('form'),status=host.querySelector('[data-scope-status]'),brand=form.elements.brand;
 let index,sequence=0;
 function scopes(){
  const scope=currentScope(form);
  return (index?.imports||[]).filter(row=>row.vehicle_type===scope.vehicle_type&&row.region===scope.region);
 }
 function updateScope(){
  sequence++;output.replaceChildren();
  const scope=currentScope(form),available=scopes();
  brand.replaceChildren(new Option('Seleccioná una marca',''),...available.map(item=>new Option(item.brand,item.brand)));
  brand.disabled=!available.length;
  status.textContent=!scope.vehicle_type?'Elegí Liviano o Pesado.':!scope.region?'Elegí Sierra o Costa.':!index?'Consultando catálogos…':available.length?'Seleccioná la marca del catálogo.':'Todavía no hay un catálogo cargado para esta selección.';
 }
 form.elements.vehicle_type.addEventListener('change',updateScope);
 form.elements.region.addEventListener('change',updateScope);
 brand.addEventListener('change',async()=>{
  const token=++sequence;
  output.replaceChildren();
  const name=brand.value;
  if(!name)return;
  const scope=currentScope(form);
  status.textContent='Cargando catálogo…';
  try{
   const items=await api('vehicle-catalog-read',{...scope,brand:name});
   if(token!==sequence||!host.isConnected)return;
   if(!items.length){status.textContent='No se encontraron partidas.';return;}
   const logo=logoUrl(index.brands.find(b=>b.name===name)?.logo_url);
   const label=name+' · '+typeLabel[scope.vehicle_type]+' · '+zoneLabel[scope.region];
   status.textContent=label;
   if(logo){const image=document.createElement('img');image.src=logo;image.alt='Logo de '+name;image.width=68;image.height=40;image.style.objectFit='contain';status.prepend(image,document.createTextNode(' '));}
   output.innerHTML=window.EnjoyMaintenance.render({...options,catalogRows:rowsForPlan(items,name),catalogLabel:label});
  }catch(e){if(token===sequence&&host.isConnected)status.textContent=e.message;}
 });
 host.querySelector('[data-reference]').addEventListener('click',()=>{
  form.elements.vehicle_type.value='';form.elements.region.value='';updateScope();status.textContent='Referencia original, sin clasificación por tipo ni región.';
  output.innerHTML=window.EnjoyMaintenance.render(options);
 });
 api('vehicle-catalog-index').then(result=>{index=result;if(host.isConnected)updateScope();}).catch(e=>{if(host.isConnected)status.textContent=e.message;});
}

let dashboardDays=7,dashboardState='',alarmed=new Map(),alarmIdentity='';
function upcomingAlarms(appointments,now=Date.now()){
 return appointments.filter(a=>!a.status||a.status==='scheduled').map(a=>({a,minutes:Math.ceil((Date.parse(a.date+'T'+a.time+'-05:00')-now)/60000)}))
  .filter(row=>row.minutes>=0&&row.minutes<=60).sort((a,b)=>a.minutes-b.minutes);
}
function alarmBanner(){
 const rows=upcomingAlarms(data?.appointments||[]);
 if(!rows.length)return '';
 return '<div class="notice" role="status"><strong>Alarmas de agendamiento</strong><ul>'+rows.map(({a,minutes})=>'<li>'+escapeHtml(a.time)+' · '+escapeHtml(vehicle(a.vehicleId)?.plate||'Vehículo')+' · '+escapeHtml(a.catalogueServiceName||a.reason||'Servicio')+' · '+(minutes?'en '+minutes+' min':'ahora')+'</li>').join('')+'</ul></div>';
}
function checkAlarms(){
 if(typeof session==='undefined'||session?.role!=='owner'||typeof data==='undefined'||!data)return;
 if(alarmIdentity!==session.email){alarmIdentity=session.email;alarmed.clear();}
 const rows=upcomingAlarms(data.appointments||[]);
 for(const {a,minutes} of rows){
  const key=a.id+'|'+a.date+'|'+a.time;
  if(alarmed.has(key))continue;
  alarmed.set(key,true);
  toast('Alarma de cita: '+(vehicle(a.vehicleId)?.plate||'Vehículo')+' a las '+a.time+(minutes?' · en '+minutes+' min':' · ahora'));
  break;
 }
 const banner=document.querySelector('[data-vehicle-alarms]');
 if(banner)banner.innerHTML=alarmBanner();
}
function dashboard(){
 const today=isoToday();
 const appointments=data.appointments||[];
 const end=new Date(today+'T12:00:00');end.setDate(end.getDate()+dashboardDays-1);
 const cutoff=iso(end);
 const rows=appointments.filter(a=>a.date>=today&&a.date<=cutoff).sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time));
 const statusLabels={scheduled:'Programada',arrived:'En taller',done:'Completada',cancelled:'Cancelada'};
 const shown=rows.filter(a=>!dashboardState||(a.status||'scheduled')===dashboardState);
 const metrics=[['Citas del período',rows.length],['Citas de hoy',appointments.filter(a=>a.date===today&&a.status!=='cancelled').length],['En taller',appointments.filter(a=>a.status==='arrived').length],['Mantenimientos completados',appointments.filter(a=>a.status==='done').length],['Alarmas en 1 hora',upcomingAlarms(appointments).length]];
 return head('Panel de control','Resumen operativo del taller y detalle de las citas.')+
 '<div class="network-filters"><label>Período<select class="form-select" id="vehicle-dashboard-days">'+[7,30].map(n=>'<option value="'+n+'" '+(dashboardDays===n?'selected':'')+'>Próximos '+n+' días</option>').join('')+'</select></label><label>Estado<select class="form-select" id="vehicle-dashboard-state"><option value="">Todos</option>'+Object.entries(statusLabels).map(([key,label])=>'<option value="'+key+'" '+(dashboardState===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div>'+
 '<div data-vehicle-alarms>'+alarmBanner()+'</div><div class="vehicle-summary-layout"><aside class="vehicle-summary-kpis">'+metrics.map(([label,value])=>'<article class="card integration-pad"><span>'+label+'</span><h2>'+value+'</h2></article>').join('')+'</aside>'+
 '<section class="card integration-pad"><h2>Detalle de citas y servicios</h2>'+(shown.length?table(['Día / hora','Cliente / placa','Servicio','Estado'],shown.map(a=>'<tr><td>'+escapeHtml(date(a.date)+' · '+a.time)+'</td><td>'+escapeHtml(client(a.clientId)?.name||'')+'<small>'+escapeHtml(vehicle(a.vehicleId)?.plate||'')+'</small></td><td>'+escapeHtml(a.catalogueServiceName||a.reason||'')+'</td><td>'+escapeHtml(statusLabels[a.status||'scheduled']||a.status)+'</td></tr>')):'<p>No hay citas en esta selección.</p>')+'</section></div>';
}
function wireDashboard(){
 document.querySelector('#vehicle-dashboard-days')?.addEventListener('change',event=>{dashboardDays=Number(event.target.value);render();});
 document.querySelector('#vehicle-dashboard-state')?.addEventListener('change',event=>{dashboardState=event.target.value;render();});
}

const reportStates={scheduled:'Programadas',arrived:'En taller',done:'Completadas',cancelled:'Canceladas'};
let networkReportState='';
function arrangeNetworkSummary(){
 const root=document.querySelector('#contenido');
 const metrics=root?.querySelector('.live-stats,.network-metrics');
 const charts=root?.querySelector('.live-chart-grid,.network-charts');
 if(!metrics||!charts||!data.monitor||root.querySelector('.vehicle-network-layout'))return;
 const heading=root.querySelector('.live-title h1,.network-heading h1');
 if(heading)heading.textContent='Panel de control de la red';
 const layout=document.createElement('div'),detail=document.createElement('div');
 layout.className='vehicle-summary-layout vehicle-network-layout';
 detail.className='vehicle-network-detail';
 metrics.before(layout);
 layout.append(metrics,detail);
 detail.append(charts);
 const summary=summarizeNetwork(data.workshops,data.monitor,{workshop:monitorWorkshop,scope:monitorScope,days:monitorDays,today:data.monitor.today||isoToday()});
 const names=new Map(summary.partners.map(w=>[w.id,w.name]));
 const report=document.createElement('section');
 report.className='live-card vehicle-network-report';
 report.innerHTML='<div class="live-card-title"><h2>Detalle operativo</h2><label>Estado <select class="form-select" data-network-detail-state><option value="">Todos</option>'+Object.entries(reportStates).map(([key,label])=>'<option value="'+key+'" '+(networkReportState===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div><div data-network-detail-results></div>';
 detail.append(report);
 function update(){
  const rows=summary.appointments.filter(row=>!networkReportState||row.status===networkReportState)
   .sort((a,b)=>b.date.localeCompare(a.date)||String(names.get(a.workshop)).localeCompare(String(names.get(b.workshop)),'es'));
  const count=rows.reduce((sum,row)=>sum+Number(row.n||0),0);
  report.querySelector('[data-network-detail-results]').innerHTML='<p role="status">'+count+' citas en la selección</p>'+(rows.length?table(['Día','Taller','Estado','Citas'],rows.map(row=>'<tr><td>'+escapeHtml(date(row.date))+'</td><td>'+escapeHtml(names.get(row.workshop)||'Taller')+'</td><td>'+escapeHtml(reportStates[row.status]||row.status)+'</td><td>'+Number(row.n||0)+'</td></tr>')):'<p>No hay citas para estos filtros.</p>');
  labelTables();
 }
 report.querySelector('[data-network-detail-state]').addEventListener('change',event=>{networkReportState=event.target.value;update();});
 update();
}
if(typeof document!=='undefined')setInterval(checkAlarms,30000);
window.EnjoyVehicleCatalog={adminView,wireAdmin,planView,wirePlan,dashboard,wireDashboard,arrangeNetworkSummary,alarmBanner,checkAlarms};
if(typeof module!=='undefined')module.exports={csvRows,parseRows,parseMatrix,rowsForPlan,upcomingAlarms};
})();
