const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleExports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/paymentComparison.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:moduleExports,BigInt});
const compare=moduleExports.comparePayment;
const transaction=()=>({status:'completed',currency:'EUR',totalCents:'500',balanceCents:'0',checkoutId:'checkout',sandboxAttribution:true});
const order=()=>({currency:'EUR',total:'5.00'}),checkout=()=>({id:'checkout',currency:'EUR',amount_cents:500});
test('matching confirmed records produce only matches',()=>{assert.ok(compare(transaction(),order(),checkout()).every(c=>c.state==='match'));});
test('mismatched totals, currency, attribution, references and balance remain distinct',()=>{
 for(const [change,label] of [[t=>t.totalCents='499','Order total'],[t=>t.currency='USD','Order currency'],[t=>t.sandboxAttribution=false,'Sandbox attribution'],[t=>t.checkoutId='other','Checkout reference'],[t=>t.balanceCents='500','Paid transaction balance']]){
  const t=transaction();change(t);assert.equal(compare(t,order(),checkout()).find(c=>c.label===label).state,'mismatch');
 }
});
test('missing or malformed expected amounts never produce false matches',()=>{
 const missing=compare(transaction(),null,null);assert.ok(missing.filter(c=>c.label!=='Sandbox attribution'&&c.label!=='Paid transaction balance').every(c=>c.state==='unavailable'));
 for(const total of ['5.001','5e0','-5','bad'])assert.equal(compare(transaction(),{currency:'EUR',total},checkout()).find(c=>c.label==='Order total').state,'unavailable');
 const t=transaction();t.totalCents=null;assert.equal(compare(t,order(),checkout()).find(c=>c.label==='Order total').state,'unavailable');
});
test('unpaid transactions are not reported as having a paid balance mismatch',()=>{const t=transaction();t.status='ready';t.balanceCents='500';assert.ok(!compare(t,order(),checkout()).some(c=>c.label==='Paid transaction balance'));});
