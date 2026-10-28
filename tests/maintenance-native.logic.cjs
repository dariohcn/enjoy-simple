
const fs=require('fs'),vm=require('vm'),zlib=require('zlib'),assert=require('node:assert/strict');
const moduleCode=fs.readFileSync(process.argv[2],'utf8'),asset=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[3])));
const s={window:{},document:{addEventListener(){}},module:{exports:{}},console,Intl,setTimeout};
vm.runInNewContext(moduleCode,s);const t=s.module.exports;
assert.equal(asset.version,2);assert.equal(asset.totalRows,375763);assert.equal(asset.plans.length,24551);
let count=0,sum=0,labor=0,parts=0;
for(const p of asset.plans)for(const index of p[6]){const row=asset.items[index];count++;sum+=Number(row[7]);if(row[3]===1)labor+=Number(row[7]);else parts+=Number(row[7]);}
assert.equal(count,asset.totalRows);assert(Math.abs(sum-asset.sourceTotals.subtotal)<.001);assert(Math.abs(labor-asset.sourceTotals.labor)<.001);assert(Math.abs(parts-asset.sourceTotals.parts)<.001);assert(Math.abs(sum*1.15-asset.sourceTotals.total)<.001);
asset.rows=asset.plans.map((p,i)=>[p[0],p[1],p[2],p[3],p[4],null,null,null,null,null,null,null,null,p[5],i,null]);
t.setSource(asset);let selected=t.selection();assert(selected.rows.length);assert.equal(new Set(selected.rows.map(r=>r[2])).size,1);assert.equal(new Set(selected.rows.map(r=>r[13])).size,1);
const all=t.totals(selected.rows);assert.equal(all.subtotal,Math.round(selected.rows.reduce((n,r)=>n+Number(r[12]),0)*100)/100);assert.equal(all.total,Math.round(all.subtotal*115)/100);
t.setFilters({type:'labor'});assert(t.visibleRows(selected.rows).every(r=>r[8]===1));
t.setFilters({type:'',search:'NO_SUCH_PART_123'});assert.equal(t.visibleRows(selected.rows).length,0);assert.equal(t.totals([]).total,0);
const brands=selected.choices.brand;t.setFilters({brand:brands.at(-1),model:'invalid',code:'invalid',km:'invalid',plan:'invalid',search:''});selected=t.selection();assert(selected.rows.length);assert(selected.rows.every(r=>r[0]===brands.at(-1)));assert.equal(new Set(selected.rows.map(r=>r[13])).size,1);
assert(!moduleCode.includes('iframe'));assert(!moduleCode.includes('app.powerbi.com'));
console.log('PASS: complete source totals, all 375763 rows, cascading single-plan filters, search, categories, totals and no external viewer.');
