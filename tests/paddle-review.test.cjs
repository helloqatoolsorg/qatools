const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const txn='txn_'+'a'.repeat(26),intent='00000000-0000-4000-8000-000000000001';
function fixture(){return {data:{id:txn,status:'completed',currency_code:'EUR',custom_data:{qatools_checkout_id:intent,qatools_environment:'sandbox',private:'secret'},details:{totals:{grand_total:'500',balance:'0',currency_code:'EUR'}},customer:{email:'secret@example.invalid'},checkout:{url:'secret-url'}}};}
function setup(options={}) {
 const calls=[],cache=new Map(),network=[];
 const db={from(table){calls.push({table});const q={
  select(columns){calls.push({columns});return q;},eq(column,value){calls.push({column,value});return q;},limit(value){calls.push({limit:value});return q;},
  async maybeSingle(){
   if(table==='admin_users')return {data:options.nonAdmin?null:{user_id:'admin'},error:options.membershipError?{}:null};
   if(options.dbError)return {data:null,error:{message:'private SQL'}};
   return {data:options.unknown?null:table==='orders'?{order_number:'sandbox-000001',status:'paid',currency:'EUR',total:5}:table==='sandbox_checkout_intents'?{id:intent,status:'completed'}:null,error:null};
  }
 };return q;}};
 function load(file){if(cache.has(file))return cache.get(file);const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
   exports:mod.exports,URL,Date,AbortSignal,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'}},
   fetch:async(url,config)=>{network.push({url,config});if(options.timeout)throw Error('private transport');return {ok:!options.httpError,json:async()=>options.payload??fixture()};},
   require(name){if(name==='server-only')return {};if(name==='next/server')return {NextResponse:{json:Response.json}};
    if(name==='@/lib/paymentReviewDatabase')return {paymentReviewDatabase:db};if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:db};
    if(name==='@/lib/requireAdmin')return load('src/lib/requireAdmin.ts');
    if(name==='@/lib/paddleTransactionReview')return load('src/lib/paddleTransactionReview.ts');
    if(name==='./paddleSandbox')return {paddleSandboxApiConfig(){if(options.noConfig)throw Error('private configuration');return {apiBase:'https://sandbox-api.paddle.com',apiKey:'synthetic-server-secret'};}};
    if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:'admin'}},error:options.invalidToken?{}:null})}})};
    throw Error('Unexpected import '+name);}
  });cache.set(file,mod.exports);return mod.exports;
 }
 return {calls,network,get(id=txn){return load('src/app/api/admin/payment-review/transaction/route.ts').GET(new Request('http://localhost/api/admin/payment-review/transaction?id='+encodeURIComponent(id),{headers:options.noToken?{}:{Authorization:'Bearer synthetic'}}));}};
}
for(const [option,status] of [['noToken',401],['invalidToken',401],['nonAdmin',403],['membershipError',500]])test('Paddle check: '+option+' blocks database/provider access',async()=>{
 const s=setup({[option]:true}),r=await s.get();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(s.network.length,0);
 assert.ok(s.calls.filter(c=>c.table).every(c=>c.table==='admin_users'));
});
test('invalid IDs and references absent from qatools cannot call Paddle',async()=>{
 for(const id of ['',txn+'/other','https://evil.invalid','txn_short']){const s=setup(),r=await s.get(id);assert.equal(r.status,400);assert.equal(s.network.length,0);}
 const s=setup({unknown:true});assert.equal((await s.get()).status,404);assert.equal(s.network.length,0);
});
test('sandbox transaction check returns only allowlisted fields and matching saved references',async()=>{
 const s=setup(),r=await s.get(),body=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(body.transaction.status,'completed');assert.equal(body.transaction.totalCents,'500');assert.equal(body.transaction.balanceCents,'0');assert.equal(body.transaction.checkoutId,intent);
 assert.equal(body.order.order_number,'sandbox-000001');assert.equal(body.checkout.status,'completed');
 assert.ok(!JSON.stringify(body).includes('secret'));assert.ok(!JSON.stringify(body).includes('customer'));
 assert.equal(s.network.length,1);const request=s.network[0];assert.equal(request.url,'https://sandbox-api.paddle.com/transactions/'+txn);
 assert.equal(request.config.method,'GET');assert.equal(request.config.cache,'no-store');assert.equal(request.config.redirect,'error');assert.ok(request.config.signal);
 assert.ok(s.calls.some(c=>c.column==='provider'&&c.value==='paddle_sandbox'));
});
test('provider and database failures are safe and never imply payment confirmation',async()=>{
 for(const option of ['dbError','httpError','timeout','noConfig']){const s=setup({[option]:true}),r=await s.get(),body=await r.json();assert.equal(r.status,503);assert.equal(body.transaction,undefined);assert.ok(!JSON.stringify(body).includes('private'));}
});
test('wrong transaction, invalid currency or unknown status rejects provider data',async()=>{
 for(const change of [p=>p.data.id='txn_'+'b'.repeat(26),p=>p.data.currency_code='bad',p=>p.data.status='invented']){
  const p=fixture();change(p);const r=await setup({payload:p}).get();assert.equal(r.status,503);
 }
});
test('missing or inconsistent totals are unavailable rather than fabricated zeroes',async()=>{
 for(const change of [p=>p.data.details=null,p=>p.data.details.totals.currency_code='USD',p=>{p.data.details.totals.grand_total='-1';p.data.details.totals.balance='500.0';}]){
  const p=fixture();change(p);const r=await setup({payload:p}).get(),body=await r.json();assert.equal(r.status,200);
  assert.equal(body.transaction.totalCents,null);assert.equal(body.transaction.balanceCents,null);
 }
});
