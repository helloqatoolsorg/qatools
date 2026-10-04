const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(options={}) {
 const calls=[],modules=new Map();
 const rows=Array.from({length:options.count??1},(_,i)=>({id:100-i,order_number:`sandbox-${String(100-i).padStart(6,'0')}`,user_id:'customer',status:'paid',items:[],total:5,currency:'EUR'}));
 const db={from(table){calls.push({table});const q={select(columns){calls.push({columns});return q;},eq(column,value){calls.push({column,value});return q;},
  order(column,config){calls.push({order:column,...config});return q;},
  async maybeSingle(){return {data:options.nonAdmin?null:{user_id:'admin'},error:options.membershipError?{}:null};},
  async range(start,end){calls.push({start,end});return {data:rows,error:options.databaseError?{message:'secret SQL details'}:null};},
  async in(column,ids){calls.push({profileIds:ids});return {data:[{user_id:'customer',name:'Test customer'}],error:options.profileError?{}:null};}};return q;}};
 function load(file){if(modules.has(file))return modules.get(file);const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
   exports:mod.exports,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test'}},
   require(name){if(name==='server-only')return {};if(name==='next/server')return {NextResponse:{json:Response.json}};
    if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:db};if(name==='@/lib/requireAdmin')return load('src/lib/requireAdmin.ts');
    if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:'admin'}},error:options.invalidToken?{}:null})}})};
    throw Error('Unexpected import '+name);}
  });modules.set(file,mod.exports);return mod.exports;}
 return {calls,async get(query=''){const request=new Request('http://localhost/api/admin/orders'+query,{headers:options.noToken?{}:{Authorization:'Bearer synthetic'}});return load('src/app/api/admin/orders/route.ts').GET(request);}};
}
for(const [option,status] of [['noToken',401],['invalidToken',401],['nonAdmin',403],['membershipError',500]])test('orders: '+option+' blocks order/customer reads',async()=>{
 const s=setup({[option]:true}),response=await s.get();assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.ok(s.calls.filter(c=>c.table).every(c=>c.table==='admin_users'));
});
test('malformed filters/pages do not reach commercial tables',async()=>{
 for(const query of ['?page=0','?page=-1','?page=1.5','?page=10000','?page=x','?status=paid,refunded','?status=bogus']) {
  const s=setup();assert.equal((await s.get(query)).status,400);assert.ok(!s.calls.some(c=>c.table==='orders'));
 }
});
test('bounded newest-first paging uses one sentinel row and only shown customer IDs',async()=>{
 const s=setup({count:51});const response=await s.get('?page=2&status=paid');const data=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(data.orders.length,50);assert.equal(data.hasMore,true);assert.equal(data.page,2);assert.equal(data.orders[0].customerName,'Test customer');
 assert.equal(data.orders[0].order_number,'sandbox-000100');
 assert.ok(s.calls.some(c=>c.columns?.includes('order_number')));
 assert.ok(s.calls.some(c=>c.start===50&&c.end===100));assert.ok(s.calls.some(c=>c.column==='status'&&c.value==='paid'));
 assert.ok(s.calls.some(c=>c.order==='id'&&c.ascending===false));assert.deepEqual(Array.from(s.calls.find(c=>c.profileIds).profileIds),['customer']);
 assert.ok(s.calls.filter(c=>c.columns).every(c=>!c.columns.includes('invoice_details')&&!c.columns.includes('secret')&&!c.columns.includes('*')));
});
test('empty orders return a genuine empty state and skip customer lookup',async()=>{
 const s=setup({count:0});const result=await (await s.get()).json();assert.equal(result.orders.length,0);assert.equal(result.hasMore,false);
 assert.ok(!s.calls.some(c=>c.table==='profiles'));
});
test('last page has no next page',async()=>{const s=setup({count:50});assert.equal((await (await s.get()).json()).hasMore,false);});
test('query failures return no records or SQL diagnostics',async()=>{
 for(const options of [{databaseError:true},{profileError:true}]){const s=setup(options);const response=await s.get();assert.equal(response.status,503);
  const result=await response.json();assert.equal(result.orders,undefined);assert.ok(!JSON.stringify(result).includes('secret'));
 }
});

test('order read migration grants service reads without browser escalation or writes',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE TABLE public.orders(id bigint PRIMARY KEY,user_id text);CREATE TABLE public.order_items(id bigint PRIMARY KEY,order_id bigint REFERENCES public.orders);
   ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
   GRANT SELECT ON public.orders,public.order_items TO authenticated;
   CREATE POLICY own_orders ON public.orders FOR SELECT TO authenticated USING(user_id=current_setting('request.jwt.claim.sub',true));
   CREATE POLICY own_items ON public.order_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.orders WHERE id=order_id));
   INSERT INTO public.orders VALUES(1,'customer-a'),(2,'customer-b');INSERT INTO public.order_items VALUES(1,1),(2,2);`);
  await db.exec(fs.readFileSync(path.resolve('supabase/migrations/20261003040000_admin_order_read.sql'),'utf8'));
  for(const table of ['orders','order_items'])for(const role of ['anon','authenticated','service_role']){
   const result=(await db.query("SELECT has_table_privilege($1,$2,'SELECT') AS read, has_table_privilege($1,$2,'INSERT,UPDATE,DELETE') AS write",[role,'public.'+table])).rows[0];
   assert.equal(result.read,role!=='anon');assert.equal(result.write,false);
  }
  await db.exec("SET ROLE service_role");assert.equal((await db.query('SELECT * FROM public.orders')).rows.length,2);
  await assert.rejects(db.exec("UPDATE public.orders SET user_id='forged'"),/permission denied/);
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','customer-a',false); SET ROLE authenticated;");
  assert.equal((await db.query('SELECT * FROM public.orders')).rows.length,1);assert.equal((await db.query('SELECT * FROM public.order_items')).rows.length,1);
 }finally{await db.close();}
});
