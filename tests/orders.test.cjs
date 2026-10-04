const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(options={}) {
 const calls=[],modules=new Map();
 const rows=Array.from({length:options.count??1},(_,i)=>({id:100-i,order_number:`sandbox-${String(100-i).padStart(6,'0')}`,user_id:'customer',status:'paid',items:[],total:5,currency:'EUR'}));
 const db={async rpc(name,args){calls.push({rpc:name,args});return {data:{orders:rows.slice(0,50).map(r=>({...r,customerName:'Test customer',customerEmail:'customer@example.test'})),page:args.p_page,hasMore:rows.length>50},error:options.databaseError||options.profileError?{message:'secret SQL details'}:null};},from(table){calls.push({table});const q={select(columns){calls.push({columns});return q;},eq(column,value){calls.push({column,value});return q;},
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
 for(const query of ['?page=0','?page=-1','?page=1.5','?page=10000','?page=x','?status=paid,refunded','?status=bogus','?sort=customer_password','?direction=random']) {
  const s=setup();assert.equal((await s.get(query)).status,400);assert.ok(!s.calls.some(c=>c.rpc));
 }
});
test('admin query passes validated sort/filter and returns bounded page with email',async()=>{
 const s=setup({count:51}),response=await s.get('?page=2&status=paid&sort=email&direction=asc'),data=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(data.orders.length,50);assert.equal(data.hasMore,true);assert.equal(data.page,2);
 assert.equal(data.orders[0].customerEmail,'customer@example.test');const call=s.calls.find(c=>c.rpc);assert.equal(call.rpc,'read_admin_orders');
 assert.deepEqual({...call.args},{p_admin_id:'admin',p_page:2,p_status:'paid',p_sort:'email',p_direction:'asc'});
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

test('actual SQL sorting is global, stable, filtered and restricted',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,banned_until timestamptz);
 CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);
 CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,name text);
 CREATE TABLE public.products(id bigint PRIMARY KEY,name text,slug text);
 CREATE TABLE public.orders(id bigint PRIMARY KEY,order_number text,user_id uuid,provider text,provider_order_id text,provider_transaction_id text,status text,currency text,subtotal numeric,total numeric,created_at timestamptz,provider_created_at timestamptz);
 CREATE TABLE public.order_items(id bigint PRIMARY KEY,order_id bigint,product_id bigint,quantity integer,unit_price numeric);
 INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000001','admin@example.test',now(),NULL),('00000000-0000-0000-0000-000000000002','z@example.test',now(),NULL),('00000000-0000-0000-0000-000000000003','a@example.test',now(),NULL);
 INSERT INTO admin_users VALUES('00000000-0000-0000-0000-000000000001');
 INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000002','Customer Z');
 INSERT INTO products VALUES(1,'qafit01','qafit01');
 INSERT INTO orders SELECT n,'sandbox-'||n,CASE WHEN n=55 THEN '00000000-0000-0000-0000-000000000003'::uuid ELSE '00000000-0000-0000-0000-000000000002'::uuid END,'paddle_sandbox',NULL,'txn_'||n,CASE WHEN n=54 THEN 'refunded' ELSE 'paid' END,'EUR',n,n,'2026-10-01'::timestamptz+n*interval '1 minute',NULL FROM generate_series(1,55)n;
 INSERT INTO order_items VALUES(1,55,1,1,55);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261005090000_admin_order_sorting.sql','utf8'));
 const admin='00000000-0000-0000-0000-000000000001';
 async function read(page,status,sort,dir,id=admin){return (await db.query('SELECT public.read_admin_orders($1,$2,$3,$4,$5) result',[id,page,status,sort,dir])).rows[0].result;}
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("SELECT has_function_privilege($1,'public.read_admin_orders(uuid,integer,text,text,text)','EXECUTE') allowed",[role])).rows[0].allowed,role==='service_role');
 await assert.rejects(read(1,'all','date','desc','00000000-0000-0000-0000-000000000002'),/Admin access/);
 for(const sort of ['number','price','date']){const asc=await read(1,'all',sort,'asc'),desc=await read(1,'all',sort,'desc');assert.equal(asc.orders[0].id,1);assert.equal(desc.orders[0].id,55);assert.equal(asc.orders.length,50);assert.equal(asc.hasMore,true);const last=await read(2,'all',sort,'asc');assert.deepEqual(last.orders.map(o=>o.id),[51,52,53,54,55]);assert.equal(last.hasMore,false);}
 const email=await read(1,'all','email','asc');assert.equal(email.orders[0].id,55);assert.equal(email.orders[0].customerEmail,'a@example.test');assert.equal(email.orders[0].items[0].product.slug,'qafit01');assert.equal(email.orders[1].id,54);
 assert.equal((await read(1,'all','email','desc')).orders[0].id,54);
 assert.equal((await read(1,'all','state','desc')).orders[0].id,54);assert.equal((await read(1,'all','state','asc')).orders[0].id,55);
 assert.deepEqual((await read(1,'refunded','price','asc')).orders.map(o=>o.id),[54]);assert.equal((await read(1,'pending','date','desc')).orders.length,0);
 await assert.rejects(read(0,'all','date','desc'),/Invalid/);await assert.rejects(read(1,'all','forged','desc'),/Invalid/);
 await db.exec(`UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='00000000-0000-0000-0000-000000000001';`);await assert.rejects(read(1,'all','date','desc'),/Admin access/);
 }finally{await db.close();}
});
