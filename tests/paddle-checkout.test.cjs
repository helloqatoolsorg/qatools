const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const intentId='00000000-0000-4000-8000-000000000001',txnId='txn_'+'a'.repeat(26),priceId='pri_01m41bkp4f0fxgb9cfm37n5p4b';
function setup(options={}) {
 const calls=[];
 const rpc=async(name,args)=>{calls.push({name,args});if(name==='reserve_sandbox_checkout')return {data:options.reservation??{ok:true,created:true,intent:{id:intentId,status:'creating',transaction_id:null}},error:null};return {data:!options.saveFailure,error:null};};
 function load(file){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:mod.exports,Buffer,AbortSignal,process:{env:{PADDLE_SANDBOX_CHECKOUT_ENABLED:options.disabled?'':'true',PADDLE_ENVIRONMENT:'sandbox',PADDLE_API_KEY:'pdl_sdbx_apikey_synthetic',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'}},
  fetch:options.fetch,
  require(name){if(name==='server-only')return {};if(name==='next/server')return {NextResponse:{json:Response.json}};
   if(name==='@/lib/activationHttp')return load('src/lib/activationHttp.ts');
   if(name==='@/lib/requireAccount')return load('src/lib/requireAccount.ts');
   if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:options.invalid?null:{id:'verified-user',email_confirmed_at:options.unconfirmed?null:'confirmed'}},error:null})}})};
   if(name==='@/lib/paddleSandbox')return {paddleSandboxConfig:()=>{if(options.configFailure)throw Error('private');return {clientToken:'test_synthetic'};}};
   if(name==='./paddleSandbox')return {paddleSandboxApiConfig:()=>({apiBase:'https://sandbox-api.paddle.com',apiKey:'synthetic'})};
   if(name==='@/lib/paddleCatalog')return {fetchValidatedSandboxPrice:async()=>{calls.push({name:'price'});if(options.priceFailure)throw Error('private');return {paddlePriceId:priceId};}};
   if(name==='@/lib/paddleTransaction')return {fetchPayableSandboxTransaction:async(id,intent,price)=>{calls.push({name:'revalidate',id,intent,price});if(options.revalidateFailure)throw Error('secret');return id;},createSandboxTransaction:async(id,price)=>{calls.push({name:'create',id,price});if(options.createFailure)throw Error('secret');return txnId;}};
   if(name==='@/lib/paddleCheckoutDatabase')return {paddleCheckoutDatabase:{rpc}};
   if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:1,slug:'qafit01',price_eur:5,published:true},error:null})})})})}};
   throw Error(name);
  }
 });return mod.exports;}
 return {calls,load,post(body={productId:1}){return load('src/app/api/account/checkout/route.ts').POST(new Request('http://localhost/api/account/checkout',{method:'POST',headers:options.noToken?{}:{Authorization:'Bearer synthetic'},body:typeof body==='string'?body:JSON.stringify(body)}));}};
}
for(const [option,status] of [['noToken',401],['invalid',401],['unconfirmed',403],['disabled',503],['configFailure',503]])test('checkout rejects '+option+' before provider or reservation',async()=>{const s=setup({[option]:true}),r=await s.post();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(s.calls.length,0);});
test('client identity, price and malformed item claims are rejected',async()=>{
 for(const body of [{},[],{productId:'1'},{productId:0},{productId:1,userId:'forged'},{productId:1,price:1},' '.repeat(2049)]){const s=setup();assert.equal((await s.post(body)).status,400);assert.equal(s.calls.length,0);}
});
test('only verified account and server price enter the reserved transaction',async()=>{const s=setup(),r=await s.post();assert.equal(r.status,200);assert.equal((await r.json()).transactionId,txnId);assert.equal(s.calls[1].args.p_user_id,'verified-user');assert.equal(s.calls[2].price,priceId);assert.equal(s.calls[3].args.p_intent_id,intentId);});
test('ownership rejection, reused and ambiguous reservations never create twice',async()=>{
 for(const [reservation,status] of [[{ok:false,code:'ownership_exists'},409],[{ok:true,created:false,intent:{id:intentId,status:'ready',transaction_id:txnId}},200],[{ok:true,created:false,intent:{id:intentId,status:'creating'}},409],[{ok:true,created:false,intent:{id:intentId,status:'unknown'}},409]]){const s=setup({reservation});assert.equal((await s.post()).status,status);assert.equal(s.calls.some(c=>c.name==='create'),false);}
});
test('provider ambiguity or failed binding blocks and records unknown without exposing details',async()=>{
 for(const option of ['createFailure','saveFailure']){const s=setup({[option]:true}),r=await s.post();assert.equal(r.status,503);assert.equal(s.calls.at(-1).args.p_transaction_id,null);assert.equal((await r.text()).includes('secret'),false);assert.equal(s.calls.filter(c=>c.name==='create').length,1);}
 const s=setup({priceFailure:true});assert.equal((await s.post()).status,503);assert.equal(s.calls.some(c=>c.name==='reserve_sandbox_checkout'),false);
});
const transaction={id:txnId,status:'draft',collection_mode:'automatic',currency_code:'EUR',custom_data:{qatools_checkout_id:intentId,qatools_environment:'sandbox'},items:[{quantity:1,price:{id:priceId}}]};
test('provider transaction response must match attribution, item and currency',()=>{
 const validate=setup().load('src/lib/paddleTransaction.ts').validateSandboxTransaction;
 assert.equal(validate(transaction,intentId,priceId),txnId);
 for(const patch of [{id:'wrong'},{status:'completed'},{collection_mode:'manual'},{currency_code:'USD'},{custom_data:{}},{items:[]},{items:[{quantity:2,price:{id:priceId}}]},{items:[{quantity:1,price:{id:'wrong'}}]}])assert.throws(()=>validate({...transaction,...patch},intentId,priceId));
});
test('provider request contains server attribution and quantity one, no customer secrets or automatic retry',async()=>{
 let count=0;
 const s=setup({fetch:async(url,opts)=>{count++;assert.equal(url,'https://sandbox-api.paddle.com/transactions');assert.equal(opts.redirect,'error');const body=JSON.parse(opts.body);assert.deepEqual(body.items,[{price_id:priceId,quantity:1}]);assert.deepEqual(body.custom_data,{qatools_checkout_id:intentId,qatools_environment:'sandbox'});return {ok:true,json:async()=>({data:transaction})};}});
 assert.equal(await s.load('src/lib/paddleTransaction.ts').createSandboxTransaction(intentId,priceId),txnId);assert.equal(count,1);
});
test('SQL reserves once, protects ownership, forbids browser writes and binds by account',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite(),user='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
   INSERT INTO auth.users VALUES('${user}',now(),null),('${other}',null,null);
   CREATE TABLE public.products(id bigint PRIMARY KEY,slug text,published boolean,price_eur numeric);
   INSERT INTO public.products VALUES(1,'qafit01',true,5);
   CREATE TABLE public.entitlements(user_id uuid,product_id bigint,status text);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261003080000_sandbox_checkout_intents.sql','utf8'));
  for(const role of ['anon','authenticated','service_role']){
   const p=(await db.query("SELECT has_function_privilege($1,'public.reserve_sandbox_checkout(uuid,bigint)','EXECUTE') AS execute,has_table_privilege($1,'public.sandbox_checkout_intents','INSERT,UPDATE,DELETE,TRUNCATE') AS write",[role])).rows[0];assert.equal(p.execute,role==='service_role');assert.equal(p.write,false);
  }
  const reserve=async(account=user)=>(await db.query('SELECT public.reserve_sandbox_checkout($1,1) AS result',[account])).rows[0].result;
  assert.equal((await reserve(other)).code,'account_unavailable');
  const first=await reserve(),second=await reserve();assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(first.intent.id,second.intent.id);
  assert.equal((await db.query('SELECT public.finish_sandbox_checkout($1,$2,$3) AS ok',[other,first.intent.id,txnId])).rows[0].ok,false);
  assert.equal((await db.query('SELECT public.finish_sandbox_checkout($1,$2,$3) AS ok',[user,first.intent.id,txnId])).rows[0].ok,true);
  assert.equal((await db.query('SELECT public.finish_sandbox_checkout($1,$2,null) AS ok',[user,first.intent.id])).rows[0].ok,false);
  assert.equal((await reserve()).intent.transaction_id,txnId);
  await db.exec(`INSERT INTO public.entitlements VALUES('${user}',1,'revoked');`);assert.equal((await reserve()).code,'ownership_exists');
  await db.exec('DELETE FROM public.entitlements;UPDATE public.products SET price_eur=6');assert.equal((await reserve()).code,'item_unavailable');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.entitlements')).rows[0].count,0);
  await db.exec('SET ROLE authenticated');await assert.rejects(reserve(),/permission denied/);await db.exec('RESET ROLE');
 }finally{await db.close();}
});

test('saved checkout is revalidated without creating or rebinding a transaction',async()=>{
 const reservation={ok:true,created:false,intent:{id:intentId,status:'ready',transaction_id:txnId}};
 const s=setup({reservation}),r=await s.post();assert.equal(r.status,200);
 assert.equal(s.calls.at(-1).name,'revalidate');assert.equal(s.calls.at(-1).intent,intentId);
 const denied=setup({reservation,revalidateFailure:true});assert.equal((await denied.post()).status,503);
 assert.equal(denied.calls.some(c=>c.name==='create'||c.name==='finish_sandbox_checkout'),false);
 const fresh=setup({revalidateFailure:true});assert.equal((await fresh.post()).status,503);
 assert.equal(fresh.calls.filter(c=>c.name==='create').length,1);
});
const payable={...transaction,subscription_id:null,discount_id:null,
 items:[{quantity:1,price:{id:priceId,product_id:'pro_01m41bf7cprd18e5aebzyp1rzw',tax_mode:'internal',billing_cycle:null,trial_period:null,unit_price:{amount:'500',currency_code:'EUR'}}}],
 details:{totals:{subtotal:'420',tax:'80',total:'500',grand_total:'500',balance:'500',discount:'0',credit:'0',credit_to_balance:'0',currency_code:'EUR'},
 line_items:[{price_id:priceId,quantity:1,product:{id:'pro_01m41bf7cprd18e5aebzyp1rzw'},totals:{total:'500',discount:'0'}}]}};
test('payable transaction rejects completed, canceled, repriced, credited and misattributed checkouts',()=>{
 const validate=setup().load('src/lib/paddleTransaction.ts').validatePayableSandboxTransaction;
 assert.equal(validate(payable,txnId,intentId,priceId),txnId);
 assert.equal(validate({...payable,status:'ready'},txnId,intentId,priceId),txnId);
 for(const patch of [{id:'txn_'+'b'.repeat(26)},{status:'paid'},{status:'completed'},{status:'canceled'},{status:'past_due'},
 {subscription_id:'sub_test'},{discount_id:'dsc_test'},{custom_data:{qatools_checkout_id:'other',qatools_environment:'sandbox'}},
 {details:null},{items:[]}])assert.throws(()=>validate({...payable,...patch},txnId,intentId,priceId));
 for(const [field,value] of [['subtotal','421'],['tax','-1'],['tax',80],['total','600'],['grand_total','600'],['balance','0'],['credit','1'],['credit_to_balance','1'],['discount','1'],['currency_code','USD']]){
  assert.throws(()=>validate({...payable,details:{...payable.details,totals:{...payable.details.totals,[field]:value}}},txnId,intentId,priceId));
 }
 assert.throws(()=>validate({...payable,details:{...payable.details,line_items:[]}},txnId,intentId,priceId));
 assert.throws(()=>validate({...payable,items:[{quantity:1,price:{...payable.items[0].price,tax_mode:'external'}}]},txnId,intentId,priceId));
});
test('revalidation reads the fixed sandbox host without caching or a provider POST',async()=>{
 let reads=0;const s=setup({fetch:async(url,opts)=>{reads++;assert.equal(url,'https://sandbox-api.paddle.com/transactions/'+txnId);assert.equal(opts.cache,'no-store');assert.equal(opts.redirect,'error');assert.equal(opts.method,undefined);return {ok:true,json:async()=>({data:payable})};}});
 assert.equal(await s.load('src/lib/paddleTransaction.ts').fetchPayableSandboxTransaction(txnId,intentId,priceId),txnId);assert.equal(reads,1);
 await assert.rejects(s.load('src/lib/paddleTransaction.ts').fetchPayableSandboxTransaction('../escape',intentId,priceId));assert.equal(reads,1);
 const fail=setup({fetch:async()=>({ok:false})});await assert.rejects(fail.load('src/lib/paddleTransaction.ts').fetchPayableSandboxTransaction(txnId,intentId,priceId));
});

test('browser configuration is authenticated, gated and exposes only the sandbox client token',async()=>{
 for(const [options,status,enabled] of [[{noToken:true},401,undefined],[{invalid:true},401,undefined],[{unconfirmed:true},403,undefined],[{disabled:true},200,false],[{configFailure:true},200,false],[{},200,true]]){
  const s=setup(options);const r=await s.load('src/app/api/account/checkout/route.ts').GET(new Request('http://localhost/api/account/checkout',{headers:options.noToken?{}:{Authorization:'Bearer synthetic'}}));
  assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const body=await r.json();assert.equal(body.enabled,enabled);assert.equal(s.calls.length,0);
  if(enabled)assert.deepEqual(body,{enabled:true,environment:'sandbox',clientToken:'test_synthetic'});
 }
});
