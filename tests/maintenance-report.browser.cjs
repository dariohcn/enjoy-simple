
const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/ZENBOOK/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const sha=process.argv[2];const raw='https://raw.githubusercontent.com/dariohcn/enjoy-simple/'+sha+'/';const js=await (await fetch(raw+'integration.js')).text(),css=await (await fetch(raw+'integration.css')).text();
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
const base={workshopId:'w1',workshopImage:'',productPermission:'read',catalogAllowed:false,clients:[{id:'c1',name:'QA Cliente'}],vehicles:[{id:'v1',clientId:'c1',plate:'QA-1234',brand:'Chevrolet',model:'Tracker',year:2021,km:50000}],services:[{id:'central-s1',central:true,code:'S1',name:'Diagnóstico QA',serviceType:'Diagnóstico',category:'Motor',labor:28,supplies:0,discount:0,estimatedMinutes:60}],products:[{id:'p1',name:'Pastillas QA',sku:'P1',category:'Frenos',price:45,active:true,stock:10,workshop:null,attributes:{unit:'Juego'}}],appointments:[],plans:[],requests:[],activity:[],reminders:[],users:[],workshops:[],whatsappConnected:false,workshopContact:{phone:'',whatsapp_optin:false}};
for(const role of ['owner','admin']){
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(()=>sessionStorage.setItem('enjoy.access.v1',JSON.stringify({access_token:'isolated-test',refresh_token:'test',expires_at:4102444800})));
 const data=structuredClone(base);data.catalogAllowed=role==='admin';
 const page=await context.newPage();page.on('pageerror',e=>errors.push(role+': '+e.message));
 await page.route('**/*.supabase.co/**',async route=>{
 const req=route.request(),body=req.postDataJSON()||{},a=body.action;
 let result={ok:true};
 if(a==='session')result=role==='admin'?null:{email:role+'@qa.invalid',role,workshop:'QA Taller'};
 if(a==='data')result=data;
 if(a==='order-list')result=[];
 if(a==='save'){const {collection,record}=body.payload;data[collection]=data[collection].filter(x=>x.id!==record.id).concat(record);}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('**/integration.js?*',r=>r.fulfill({contentType:'application/javascript',body:js}));
 await page.route('**/integration.css?*',r=>r.fulfill({contentType:'text/css',body:css}));
 await page.goto('https://dariohcn.github.io/enjoy-simple/acceso.html',{waitUntil:'domcontentloaded',timeout:60000});
 try{await page.waitForSelector(role==='admin'?'#login-form':'#nav button[data-view], #nav button[data-integrated-view]',{timeout:10000});}catch(e){console.log(JSON.stringify({role,errors,main:await page.locator('#contenido').innerText()}));throw e;}
 const alreadyIntegrated=await page.evaluate(()=>typeof names.proforma!=='undefined');if(!alreadyIntegrated){await page.addStyleTag({content:css});await page.addScriptTag({content:js});}if(role==='admin')await page.evaluate(f=>{session=f.session;data=f.data;view='monitor';render();},{session:{email:'admin@qa.invalid',role:'admin',workshop:''},data});
 await page.waitForSelector('[data-integrated-view]');
 const homeText=await page.locator('#contenido').innerText();
 assert(!homeText.includes('Chat con cliente'));
 if(role==='owner'){
  assert.equal(await page.locator('#nav [data-integrated-view="products"]').count(),0);
  assert.equal(await page.locator('#nav [data-integrated-view="catalogImport"]').count(),0);
  await page.locator('#nav [data-integrated-view="proforma"]').click();
  await page.waitForSelector('#iq-vehicle',{timeout:5000});await page.locator('#iq-vehicle').selectOption('v1');
  await page.locator('#iq-catalog').selectOption('s:central-s1');await page.locator('[data-iq-add]').click();
  await page.locator('#iq-catalog').selectOption('p:p1');await page.locator('#iq-qty').fill('2');await page.locator('[data-iq-add]').click();
  assert((await page.locator('.integration-total').innerText()).includes('118'));
  await page.locator('[data-iq-save]').click();await page.waitForFunction(()=>document.querySelector('#contenido')?.textContent.includes('Proforma guardada'));
  assert.equal(data.requests.length,1);assert.equal(data.requests[0].quoteSubtotal,118);
  await page.locator('#nav [data-integrated-view="calendar"]').click();
  const add=page.locator('[data-action="appointment"]').filter({hasText:/cita/i}).first();
  await add.click();await page.waitForSelector('#integration-service');
  await page.locator('#integration-service').selectOption('central-s1');
  assert.equal(await page.locator('#form [name="reason"]').inputValue(),'Diagnóstico QA');
  await page.locator('#nav [data-integrated-view="overview"]').click({force:true}).catch(()=>{});
  await page.evaluate(()=>document.querySelector('#dialog')?.close());
  await page.locator('#nav [data-integrated-view="overview"]').click();
 }
 else {assert(await page.locator('#nav [data-integrated-view="catalogImport"]').count());assert(await page.locator('#nav [data-integrated-view="services"]').count());assert.equal(await page.locator('#nav [data-integrated-view="proforma"]').count(),0);}
 await page.locator('#nav [data-integrated-view="maintenanceReport"]').click();
 assert.equal(await page.locator('.maintenance-report-frame iframe').count(),1);
 assert((await page.locator('.maintenance-report-frame iframe').getAttribute('src')).includes('app.powerbi.com/view?r='));
 assert((await page.locator('.maintenance-report-source').innerText()).includes('no son indicadores'));
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),role+' overflow '+width);}
 results.push(role+': navigation, catalogue and responsive width checks passed');
 await context.close();
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e.stack);process.exit(1)});
