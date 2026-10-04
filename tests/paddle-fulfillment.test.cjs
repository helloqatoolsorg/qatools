const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const intentId='00000000-0000-4000-8000-000000000001',txn='txn_'+'a'.repeat(26),pid='pri_01m41bkp4f0fxgb9cfm37n5p4b',pro='pro_01m41bf7cprd18e5aebzyp1rzw';
const eid=n=>'evt_'+String(n).padStart(26,'0');
const fixture=()=>({event_id:eid(1),event_type:'transaction.completed',occurred_at:'2026-10-03T17:00:00Z',data:{id:txn,status:'completed',collection_mode:'automatic',currency_code:'EUR',subscription_id:null,discount_id:null,custom_data:{qatools_checkout_id:intentId,qatools_environment:'sandbox'},items:[{quantity:1,price:{id:pid,product_id:pro,billing_cycle:null,trial_period:null,tax_mode:'internal',unit_price:{amount:'500',currency_code:'EUR'}}}],details:{totals:{subtotal:'417',tax:'83',total:'500',grand_total:'500',currency_code:'EUR',discount:'0',credit:'0',credit_to_balance:'0',balance:'0'},line_items:[{price_id:pid,quantity:1,product:{id:pro},totals:{total:'500',discount:'0'}}]}}});
function setup(options={}){
 const calls=[],cache=new Map();
 function load(file){if(cache.has(file))return cache.get(file);const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:mod.exports,Buffer,Date,process:{env:{}},require(name){
   if(name==='server-only')return {};if(name==='node:crypto')return crypto;
   if(name==='next/server')return {NextResponse:{json:Response.json}};
   if(name==='@/lib/activationHttp')return load('src/lib/activationHttp.ts');
   if(name==='@/lib/paddleSandbox')return {paddleSandboxConfig(){if(options.noConfig)throw Error('private');return {webhookSecret:'synthetic-secret'};}};
   if(name==='@/lib/paddleWebhook')return load('src/lib/paddleWebhook.ts');
   if(name==='@/lib/paddleFulfillment')return load('src/lib/paddleFulfillment.ts');
   if(name==='@/lib/paddleWebhookDatabase')return {paddleWebhookDatabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:!options.retry},error:options.dbError?{}:null};}}};
   throw Error(name);
  }
 });cache.set(file,mod.exports);return mod.exports;}
 return {calls,load,post(event=fixture(),invalid=false){const raw=JSON.stringify(event),time=Math.floor(Date.now()/1000),hash=crypto.createHmac('sha256','synthetic-secret').update(time+':'+raw).digest('hex');return load('src/app/api/paddle/webhook/route.ts').POST(new Request('http://localhost/api/paddle/webhook',{method:'POST',body:raw,headers:{'paddle-signature':`ts=${time};h1=${invalid?'0'.repeat(64):hash}`}}));}};
}
test('completed event normalization requires approved item, exact totals and account attribution',()=>{
 const normalize=setup().load('src/lib/paddleFulfillment.ts').normalizePaddleEvent;
 assert.equal(normalize(fixture()).valid,true);
 const changes=[e=>e.data.currency_code='USD',e=>e.data.custom_data.qatools_environment='live',e=>e.data.custom_data.qatools_checkout_id='bad',e=>e.data.status='paid',e=>e.data.items[0].quantity=2,e=>e.data.items[0].price.tax_mode='external',e=>e.data.items[0].price.billing_cycle={},e=>e.data.items[0].price.id='other',e=>e.data.details.totals.total='499',e=>e.data.details.totals.discount='1',e=>e.data.details.totals.credit='1',e=>e.data.details.totals.tax='82',e=>e.data.details.line_items[0].quantity=2,e=>e.data.details.line_items.push({}),e=>e.data.subscription_id='sub_other'];
 for(const change of changes){const e=fixture();change(e);assert.equal(normalize(e).valid,false);}
 assert.throws(()=>normalize({...fixture(),event_id:'bad'}));assert.throws(()=>normalize({...fixture(),occurred_at:'bad'}));
});
test('unsigned or tampered events cannot reach SQL',async()=>{const s=setup(),r=await s.post(fixture(),true);assert.equal(r.status,400);assert.equal(s.calls.length,0);assert.equal(r.headers.get('cache-control'),'no-store');});
test('verified event reaches SQL with normalized fields and exact body digest only',async()=>{const s=setup(),e=fixture();e.data.email='private@example.invalid';const r=await s.post(e);assert.equal(r.status,200);assert.equal(s.calls.length,1);assert.equal(s.calls[0].args.p_body_hash,crypto.createHash('sha256').update(JSON.stringify(e)).digest('hex'));assert.equal(JSON.stringify(s.calls).includes('private@'),false);});
test('config/database/binding failures return retryable responses without provider payload',async()=>{for(const option of ['noConfig','dbError','retry']){const s=setup({[option]:true}),r=await s.post();assert.equal(r.status,503);assert.equal((await r.text()).includes('private'),false);}});
test('refund and cancellation identifiers are normalized without granting ownership',()=>{const norm=setup().load('src/lib/paddleFulfillment.ts').normalizePaddleEvent,e=fixture();e.event_type='adjustment.updated';e.data.transaction_id=txn;assert.equal(norm(e).txnId,txn);assert.equal(norm(e).valid,false);});
test('simulation IDs are accepted but matching real purchase fields cannot grant or block ownership',()=>{
 const normalize=setup().load('src/lib/paddleFulfillment.ts').normalizePaddleEvent;
 const event=fixture();event.event_id='ntfsimevt_'+'a'.repeat(26);
 const result=normalize(event);assert.equal(result.valid,false);assert.equal(result.txnId,null);assert.equal(result.intentId,null);
 assert.throws(()=>normalize({...event,event_id:'ntfsimevt_short'}));
});
test('only approved full refund events normalize as automatic refunds',()=>{
 const normalize=setup().load('src/lib/paddleFulfillment.ts').normalizePaddleEvent;
 const refund=()=>({event_id:eid(30),event_type:'adjustment.updated',occurred_at:'2026-10-04T12:00:00Z',data:{id:'adj_'+'a'.repeat(26),transaction_id:txn,action:'refund',status:'approved',type:'full',currency_code:'EUR',subscription_id:null,totals:{total:'500',currency_code:'EUR'},reason:'private'}});
 const r=normalize(refund());assert.equal(r.fullRefund,true);assert.equal(r.refundTotal,500);assert.equal(r.valid,false);assert.ok(!JSON.stringify(r).includes('private'));
 const created=refund();created.event_type='adjustment.created';assert.equal(normalize(created).fullRefund,true);
 for(const change of [e=>e.data.status='pending_approval',e=>e.data.type='partial',e=>e.data.action='chargeback',e=>e.data.id='bad',e=>e.data.totals.total='0',e=>e.data.totals.currency_code='USD',e=>e.event_id='ntfsimevt_'+'a'.repeat(26)]){
  const e=refund();change(e);assert.equal(normalize(e).fullRefund,false);
 }
});
test('dashboard item-based refunds qualify only for a single fully refunded item',()=>{
 const normalize=setup().load('src/lib/paddleFulfillment.ts').normalizePaddleEvent;
 const refund=()=>({event_id:eid(40),event_type:'adjustment.updated',occurred_at:'2026-10-04T12:00:00Z',data:{id:'adj_'+'a'.repeat(26),transaction_id:txn,action:'refund',status:'approved',type:'partial',currency_code:'EUR',subscription_id:null,totals:{total:'500',currency_code:'EUR'},items:[{item_id:'txnitm_'+'a'.repeat(26),type:'full',amount:'500',totals:{total:'500'}}]}});
 assert.equal(normalize(refund()).fullRefund,true);
 for(const change of [e=>e.data.items[0].type='partial',e=>e.data.items[0].totals.total='499',e=>e.data.items[0].item_id='bad',e=>e.data.items.push(e.data.items[0]),e=>e.data.status='pending_approval']){
  const e=refund();change(e);assert.equal(normalize(e).fullRefund,false);
 }
});
test('actual SQL fulfillment is atomic, idempotent, bound to intent and blocks out-of-order review events',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite(),user='00000000-0000-0000-0000-000000000001';
 const normalize=setup().load('src/lib/paddleFulfillment.ts').normalizePaddleEvent;
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
   INSERT INTO auth.users VALUES('${user}',now(),null);
   CREATE TABLE public.products(id bigint PRIMARY KEY,slug text,published boolean,price_eur numeric);INSERT INTO public.products VALUES(1,'qafit01',true,5);
   CREATE TABLE public.orders(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid REFERENCES auth.users,provider text,provider_transaction_id text UNIQUE,status text CHECK(status IN ('pending','paid','refunded','partially_refunded','cancelled')),currency text,subtotal numeric(12,2),total numeric(12,2),provider_created_at timestamptz,created_at timestamptz DEFAULT now());
   CREATE TABLE public.order_items(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id bigint REFERENCES public.orders,product_id bigint REFERENCES public.products,quantity int CHECK(quantity>0),unit_price numeric(12,2));
   CREATE TABLE public.entitlements(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid REFERENCES auth.users,product_id bigint REFERENCES public.products,order_item_id bigint REFERENCES public.order_items,source text CHECK(source IN ('purchase','free','admin')),status text CHECK(status IN ('active','refunded','revoked')),UNIQUE(user_id,product_id));`);
  await db.exec(fs.readFileSync('supabase/migrations/20261003080000_sandbox_checkout_intents.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261003090000_sandbox_payment_fulfillment.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004100000_paddle_simulation_isolation.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004130000_sandbox_full_refunds.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004140000_recheck_approved_refund_events.sql','utf8'));
  await db.query(`INSERT INTO public.sandbox_checkout_intents(id,user_id,product_id,price_id,amount_cents,currency,status,transaction_id) VALUES($1,$2,1,$3,500,'EUR','ready',$4)`,[intentId,user,pid,txn]);
  for(const role of ['anon','authenticated','service_role']){const p=(await db.query("SELECT has_function_privilege($1,'public.process_sandbox_payment_event(jsonb,text)','EXECUTE') AS execute,has_table_privilege($1,'public.sandbox_payment_events','INSERT,UPDATE,DELETE,TRUNCATE') AS write",[role])).rows[0];assert.equal(p.execute,role==='service_role');assert.equal(p.write,false);}
  async function process(event=fixture(),bodyHash){const n=normalize(event);return (await db.query('SELECT public.process_sandbox_payment_event($1::jsonb,$2) AS result',[JSON.stringify(n),bodyHash??crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex')])).rows[0].result;}
  async function reset(){await db.exec("TRUNCATE public.sandbox_payment_events,public.entitlements,public.order_items,public.orders;UPDATE public.sandbox_checkout_intents SET status='ready'");}
  const simulated=fixture();simulated.event_id='ntfsimevt_'+'a'.repeat(26);
  const forgedNormalized={...normalize(fixture()),eventId:simulated.event_id};
  const isolated=(await db.query('SELECT public.process_sandbox_payment_event($1::jsonb,$2) AS result',[JSON.stringify(forgedNormalized),'1'.repeat(64)])).rows[0].result;
  assert.equal(isolated.outcome,'ignored');assert.equal((await db.query('SELECT transaction_id FROM public.sandbox_payment_events')).rows[0].transaction_id,null);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.entitlements')).rows[0].n,0);
  const first=await process();assert.equal(first.outcome,'fulfilled');assert.equal((await process()).outcome,'fulfilled');
  assert.equal((await process(fixture(),'0'.repeat(64))).ok,false);
  let e=fixture();e.event_id=eid(2);assert.equal((await process(e)).outcome,'duplicate');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n,1);
  const ownership=(await db.query('SELECT * FROM public.entitlements')).rows[0];assert.equal(ownership.user_id,user);assert.equal(ownership.status,'active');assert.equal(ownership.source,'purchase');
  assert.equal(Number((await db.query('SELECT total FROM public.orders')).rows[0].total),5);
  await reset();e=fixture();e.event_id=eid(3);e.event_type='adjustment.updated';e.data.transaction_id=txn;assert.equal((await process(e)).outcome,'review');assert.equal((await process()).outcome,'review');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.entitlements')).rows[0].n,0);
  await reset();const earlyRefund={event_id:eid(5),event_type:'adjustment.created',occurred_at:'2026-10-04T12:00:00Z',data:{id:'adj_'+'a'.repeat(26),transaction_id:txn,action:'refund',status:'approved',type:'full',currency_code:'EUR',subscription_id:null,totals:{total:'500',currency_code:'EUR'}}};
  assert.equal((await process(earlyRefund)).outcome,'review');assert.equal((await process()).outcome,'review');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.entitlements')).rows[0].n,0);
  await reset();await db.exec("UPDATE public.sandbox_checkout_intents SET status='creating',transaction_id=null");assert.equal((await process()).ok,false);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.sandbox_payment_events')).rows[0].n,0);await db.query("UPDATE public.sandbox_checkout_intents SET status='ready',transaction_id=$1",[txn]);assert.equal((await process()).outcome,'fulfilled');
  await reset();e=fixture();e.data.details.totals.total='499';assert.equal((await process(e)).outcome,'review');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n,0);
  await reset();e=fixture();e.data.id='txn_'+'b'.repeat(26);assert.equal((await process(e)).outcome,'review');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n,0);
  await reset();await db.exec("UPDATE auth.users SET banned_until=now()+interval '1 day'");assert.equal((await process()).outcome,'review');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.entitlements')).rows[0].n,0);await db.exec('UPDATE auth.users SET banned_until=null');
  await reset();await db.exec(`INSERT INTO public.entitlements(user_id,product_id,source,status) VALUES('${user}',1,'admin','revoked')`);assert.equal((await process()).outcome,'review');assert.equal((await db.query('SELECT status FROM public.entitlements')).rows[0].status,'revoked');
  await reset();await db.exec("CREATE FUNCTION public.fail_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fail_entitlement BEFORE INSERT ON public.entitlements FOR EACH ROW EXECUTE FUNCTION public.fail_entitlement();");await assert.rejects(process(),/synthetic failure/);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.order_items')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM public.sandbox_payment_events')).rows[0].n,0);await db.exec('DROP TRIGGER fail_entitlement ON public.entitlements');assert.equal((await process()).outcome,'fulfilled');
  await db.exec('SET ROLE authenticated');await assert.rejects(process(),/permission denied/);await db.exec('RESET ROLE');
  await db.exec(fs.readFileSync('supabase/migrations/20261004120000_customer_order_numbers.sql','utf8'));
  assert.equal((await db.query('SELECT order_number FROM public.orders')).rows[0].order_number,'sandbox-000001');
  e=fixture();e.event_id=eid(4);assert.equal((await process(e)).outcome,'duplicate');
  assert.equal((await db.query("SELECT last_number::int AS n FROM public.order_number_counters WHERE scope='sandbox'")).rows[0].n,1);
  const purchased=(await db.query('SELECT * FROM public.entitlements')).rows[0];
  await db.exec("INSERT INTO public.products VALUES(2,'other-tool',true,10)");
  await db.query("INSERT INTO public.entitlements(user_id,product_id,source,status) VALUES($1,2,'free','active')",[user]);
  const status=async()=> (await db.query('SELECT status FROM public.entitlements WHERE product_id=1')).rows[0].status;
  const refund=(id=30)=>({event_id:eid(id),event_type:'adjustment.updated',occurred_at:'2026-10-04T12:00:00Z',data:{id:'adj_'+'a'.repeat(26),transaction_id:txn,action:'refund',status:'approved',type:'full',currency_code:'EUR',subscription_id:null,totals:{total:'500',currency_code:'EUR'}}});
  const invalid=[e=>e.data.status='pending_approval',e=>e.data.type='partial',e=>e.data.action='chargeback',e=>e.data.status='rejected',e=>e.data.totals.total='499',e=>e.data.currency_code='USD',e=>e.data.id='invalid',e=>e.data.transaction_id='txn_'+'z'.repeat(26)];
  for(let i=0;i<invalid.length;i++){const r=refund(10+i);invalid[i](r);assert.equal((await process(r)).outcome,'review');assert.equal(await status(),'active');}
  const sim=refund();sim.event_id='ntfsimevt_'+'z'.repeat(26);assert.equal((await process(sim)).outcome,'ignored');assert.equal(await status(),'active');
  const itemRefund=refund(29);itemRefund.data.type='partial';itemRefund.data.items=[{item_id:'txnitm_'+'a'.repeat(26),type:'full',totals:{total:'500'}}];
  const itemNormalized=normalize(itemRefund),itemHash=crypto.createHash('sha256').update(JSON.stringify(itemRefund)).digest('hex');
  // Model the event recorded for review by the previous strict normalizer.
  await db.query("INSERT INTO public.sandbox_payment_events(event_id,body_hash,event_type,transaction_id,outcome,occurred_at) VALUES($1,$2,'adjustment.updated',$3,'review',now())",[itemNormalized.eventId,itemHash,txn]);
  assert.equal((await process(itemRefund,'0'.repeat(64))).ok,false);assert.equal(await status(),'active');
  await db.query('UPDATE public.entitlements SET order_item_id=null WHERE product_id=1');
  assert.equal((await process(refund(21))).outcome,'review');assert.equal(await status(),'active');
  await db.query('UPDATE public.entitlements SET order_item_id=$1 WHERE product_id=1',[purchased.order_item_id]);
  await db.exec("UPDATE public.entitlements SET source='admin' WHERE product_id=1");
  assert.equal((await process(refund(22))).outcome,'review');assert.equal(await status(),'active');
  await db.exec("UPDATE public.entitlements SET source='purchase' WHERE product_id=1");
  await db.exec('UPDATE public.sandbox_checkout_intents SET product_id=2');
  assert.equal((await process(refund(23))).outcome,'review');assert.equal(await status(),'active');
  await db.exec('UPDATE public.sandbox_checkout_intents SET product_id=1');
  await db.exec("CREATE FUNCTION public.fail_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic refund failure'; END $$; CREATE TRIGGER fail_refund BEFORE UPDATE ON public.entitlements FOR EACH ROW EXECUTE FUNCTION public.fail_refund();");
  await assert.rejects(process(refund()),/synthetic refund failure/);assert.equal(await status(),'active');
  assert.equal((await db.query('SELECT status FROM public.orders')).rows[0].status,'paid');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.sandbox_payment_events WHERE event_id=$1',[eid(30)])).rows[0].n,0);
  await db.exec('DROP TRIGGER fail_refund ON public.entitlements');
  assert.equal((await process(itemRefund)).outcome,'refunded');assert.equal(await status(),'refunded');
  assert.equal((await db.query('SELECT outcome FROM public.sandbox_payment_events WHERE event_id=$1',[eid(29)])).rows[0].outcome,'refunded');
  assert.equal((await process(itemRefund)).outcome,'refunded');
  assert.equal((await process(refund())).outcome,'refunded');assert.equal(await status(),'refunded');
  assert.equal((await process(refund())).outcome,'refunded');assert.equal((await process(refund(31))).outcome,'refunded');
  const retained=(await db.query('SELECT status,order_number FROM public.orders')).rows[0];assert.equal(retained.status,'refunded');assert.equal(retained.order_number,'sandbox-000001');
  assert.equal((await db.query('SELECT status FROM public.entitlements WHERE product_id=2')).rows[0].status,'active');
  const delayed=fixture();delayed.event_id=eid(32);assert.equal((await process(delayed)).outcome,'review');assert.equal(await status(),'refunded');
  await db.exec('SET ROLE authenticated');await assert.rejects(process(refund(33)),/permission denied/);await db.exec('RESET ROLE');


 }finally{await db.close();}
});
