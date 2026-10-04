const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function setup(options={}) {
 const calls=[],cache=new Map();
 const db={from(table){calls.push({table});const q={
  select(columns){calls.push({columns});return q;},eq(column,value){calls.push({column,value});return q;},
  in(column,value){calls.push({column,value});return q;},lte(column,value){calls.push({cutoffColumn:column,value});return q;},
  order(column,config){calls.push({order:column,...config});return q;},
  async maybeSingle(){return {data:options.nonAdmin?null:{user_id:'admin'},error:options.membershipError?{}:null};},
  async range(start,end){calls.push({start,end});if(options.thrown)throw Error('private SQL');return {data:Array.from({length:options.count??1},(_,i)=>({event_id:`event-${i}`,transaction_id:'synthetic-transaction'})),error:options.dbError?{message:'private SQL'}:null};}
 };return q;}};
 function load(file){if(cache.has(file))return cache.get(file);const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
   exports:mod.exports,URL,Date,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'}},
   require(name){if(name==='server-only')return {};if(name==='next/server')return {NextResponse:{json:Response.json}};
    if(name==='@/lib/paymentReviewDatabase')return {paymentReviewDatabase:db};
    if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:db};
    if(name==='@/lib/requireAdmin')return load('src/lib/requireAdmin.ts');
    if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:'admin'}},error:options.invalidToken?{}:null})}})};
    throw Error('Unexpected import '+name);}
  });cache.set(file,mod.exports);return mod.exports;
 }
 return {calls,get(query=''){return load('src/app/api/admin/payment-review/route.ts').GET(new Request('http://localhost/api/admin/payment-review'+query,{headers:options.noToken?{}:{Authorization:'Bearer synthetic'}}));}};
}
for(const [option,status] of [['noToken',401],['invalidToken',401],['nonAdmin',403],['membershipError',500]])test('payment review: '+option+' prevents ledger reads',async()=>{
 const s=setup({[option]:true}),r=await s.get();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.ok(s.calls.filter(c=>c.table).every(c=>c.table==='admin_users'));
});
test('invalid review kind or page cannot access payment tables',async()=>{
 for(const query of ['?kind=all','?kind=events,checkouts','?page=0','?page=1.5','?page=10000']){
  const s=setup(),r=await s.get(query);assert.equal(r.status,400);assert.ok(s.calls.filter(c=>c.table).every(c=>c.table==='admin_users'));
 }
});
test('event review is filtered, bounded and excludes payload hashes and customer secrets',async()=>{
 const s=setup({count:51}),r=await s.get('?page=2'),body=await r.json();
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(body.kind,'events');
 assert.equal(body.records.length,50);assert.equal(body.hasMore,true);assert.equal(body.page,2);
 assert.ok(s.calls.some(c=>c.table==='sandbox_payment_events'));assert.ok(s.calls.some(c=>c.column==='outcome'&&c.value==='review'));
 assert.ok(s.calls.some(c=>c.start===50&&c.end===100));
 const columns=s.calls.find(c=>c.columns?.includes('event_id')).columns;
 assert.ok(!columns.includes('body_hash')&&!columns.includes('*')&&!columns.includes('email'));
 assert.deepEqual(s.calls.filter(c=>c.order).map(c=>c.order),['received_at','event_id']);
});
test('checkout review excludes normal ready/completed attempts and waits five minutes',async()=>{
 const s=setup({count:0}),before=Date.now(),r=await s.get('?kind=checkouts'),body=await r.json();
 assert.equal(body.records.length,0);assert.equal(body.hasMore,false);
 assert.ok(s.calls.some(c=>c.table==='sandbox_checkout_intents'));
 assert.deepEqual(Array.from(s.calls.find(c=>c.column==='status').value),['creating','unknown']);
 const cutoff=s.calls.find(c=>c.cutoffColumn);assert.equal(cutoff.cutoffColumn,'updated_at');
 assert.ok(Math.abs(Date.parse(cutoff.value)-(before-300000))<2000);
 assert.deepEqual(s.calls.filter(c=>c.order).map(c=>c.order),['updated_at','id']);
});
test('payment review errors never reveal SQL diagnostics or records',async()=>{
 for(const option of ['dbError','thrown']){const r=await setup({[option]:true}).get(),body=await r.json();
  assert.equal(r.status,503);assert.equal(body.records,undefined);assert.ok(!JSON.stringify(body).includes('private'));
 }
});
