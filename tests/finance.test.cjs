const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function route(options={}) {
 const calls=[];
 const db={from(table){calls.push(table);return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:options.nonAdmin?null:{user_id:'admin'},error:null};}};},async rpc(name,args){calls.push({name,args});return {data:options.malformed?{}:{currencies:[],environment:args.p_environment},error:options.failure?{message:'private SQL diagnostic'}:null};}};
 const modules={};
 function load(file){if(modules[file])return modules[file];const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'}},require(name){if(name==='server-only')return {};if(name==='next/server')return {NextResponse:{json:Response.json}};if(name==='@/lib/requireAdmin')return load('src/lib/requireAdmin.ts');if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:db};if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:'admin'}},error:options.invalidToken?{}:null})}})};throw Error(name);}});return modules[file]=mod.exports;}
 return {calls,get(query=''){return load('src/app/api/admin/finance/route.ts').GET(new Request('https://example.invalid/api/admin/finance'+query,{headers:options.noToken?{}:{Authorization:'Bearer synthetic'}}));}};
}
for(const [option,status] of [['noToken',401],['invalidToken',401],['nonAdmin',403]])test('finance rejects '+option+' before report read',async()=>{const s=route({[option]:true}),r=await s.get();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.ok(!s.calls.some(c=>typeof c==='object'));});
test('finance rejects invalid filters before RPC',async()=>{for(const query of ['?period=week','?period=all','?environment=all','?period=month;drop','?environment=']){const s=route();assert.equal((await s.get(query)).status,400);assert.ok(!s.calls.some(c=>typeof c==='object'));}});
test('finance uses authenticated admin ID and sandbox default, accepts requested periods',async()=>{for(const period of ['month','3months','6months','year']){const s=route(),r=await s.get('?period='+period);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(JSON.parse(JSON.stringify(s.calls.find(c=>typeof c==='object'))),{name:'read_admin_finance',args:{p_admin_id:'admin',p_environment:'sandbox',p_period:period}});}const s=route();await s.get('?environment=live');assert.equal(s.calls.find(c=>typeof c==='object').args.p_environment,'live');});
test('finance fails closed without leaking SQL or partial report',async()=>{for(const options of [{failure:true},{malformed:true}]){const r=await route(options).get();assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private SQL'));}});

test('finance renders loading, error, genuine empty live state, exact amounts and sandbox warning',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 function render({environment='sandbox',report=null,error=null,loading=false}={}){
  const states=[environment,'month',report,'',loading,error,0,'remaining'];const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/AdminFinance.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:mod.exports,Intl,Date,Math,require(name){if(name==='react')return {...React,useState:()=>[states.shift(),()=>{}],useEffect:()=>{}};if(name==='react/jsx-runtime')return require(name);if(name==='@/lib/supabase')return {};if(name.endsWith('.css'))return {};throw Error(name);}});
  return renderToStaticMarkup(React.createElement(mod.exports.default));
 }
 assert.match(render({loading:true}),/Loading finance/);
 assert.match(render({error:'Unable to load finance.'}),/role="alert"/);
 const empty=render({environment:'live',report:{currencies:[]}});assert.match(empty,/No completed live orders/);assert.ok(!empty.includes('Sandbox test transactions'));
 const summary={currency:'EUR',orders:1,payments:8.26,refunds:0,remaining:8.26,monthRemaining:8.26,last30DaysRemaining:8.26,refundedOrders:0,reviewOrders:0,periodOrders:1,periodPayments:8.26,periodRefunds:0,periodRemaining:8.26,points:[{date:'2026-10-07',endDate:'2026-10-07',orders:1,payments:8.26,refunds:0,remaining:8.26}]};
 const html=render({report:{currencies:[summary],generatedAt:'2026-10-07T12:00:00Z',startDate:'2026-10-01',endDate:'2026-10-07'}});
 assert.match(html,/Sandbox test transactions/);assert.match(html,/€8.26/);assert.match(html,/Show exact amounts/);assert.match(html,/role="img"/);assert.match(html,/not a refund-date cash-flow chart/);assert.match(html,/Last 30 days/);assert.ok(!html.includes('Last 7 days'));assert.ok(!html.includes('This month'));
});

test('actual PostgreSQL finance aggregates full and item refunds, isolates currencies/environments and permissions',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 const admin='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
 CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);
 CREATE TABLE public.orders(id bigint PRIMARY KEY,currency text,status text,total numeric(12,2),provider text,provider_created_at timestamptz,created_at timestamptz);
 CREATE TABLE public.order_items(id bigint PRIMARY KEY,order_id bigint,unit_price numeric(12,2),quantity integer,fully_refunded boolean);
 INSERT INTO auth.users VALUES('${admin}',now(),null),('${other}',now(),null);INSERT INTO public.admin_users VALUES('${admin}');
 INSERT INTO public.orders VALUES
 (1,'EUR','paid',35,'paddle_sandbox',now(),now()),
 (2,'EUR','refunded',10,'paddle_sandbox',now(),now()),
 (3,'EUR','partially_refunded',20,'paddle_sandbox',now(),now()),
 (4,'EUR','paid',8.26,'paddle_sandbox',now(),now()),
 (5,'EUR','pending',99,'paddle_sandbox',now(),now()),
 (6,'EUR','cancelled',99,'paddle_sandbox',now(),now()),
 (7,'EUR','paid',200,'paddle',now(),now()),
 (8,'USD','paid',15,'paddle_sandbox',now(),now()),
 (9,'EUR','paid',100,'paddle_sandbox',now()-interval '2 years',now()),
 (10,'EUR','paid',0,'free',now(),now()),
 (11,'EUR','paid',10,'paddle_sandbox',now(),now());
 INSERT INTO public.order_items VALUES(1,1,30,1,false),(2,1,5,1,false),(3,2,10,1,false),
 (4,3,3,2,true),(5,3,14,1,false),(6,4,8.26,1,false),(7,11,10,1,false);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261007220000_admin_finance.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261007221000_finance_rolling_periods.sql','utf8'));
 const read=async(environment='sandbox',period='month')=>(await db.query('SELECT public.read_admin_finance($1,$2,$3) AS value',[admin,environment,period])).rows[0].value;
 const report=await read(),eur=report.currencies.find(c=>c.currency==='EUR');
 assert.equal(eur.orders,6);assert.equal(eur.payments,183.26);assert.equal(eur.refunds,16);assert.equal(eur.remaining,167.26);
 assert.equal(eur.monthPayments,83.26);assert.equal(eur.monthRefunds,16);assert.equal(eur.monthRemaining,67.26);assert.equal(eur.refundedOrders,2);assert.equal(eur.reviewOrders,0);
 assert.equal(eur.periodOrders,5);assert.equal(eur.points.reduce((s,p)=>s+p.orders,0),5);
 assert.equal(Math.round(eur.points.reduce((s,p)=>s+p.remaining,0)*100),6726);
 assert.equal(report.currencies.find(c=>c.currency==='USD').remaining,15);
 assert.equal((await read('live')).currencies[0].payments,200);
 assert.equal(eur.points.length,30);assert.equal(eur.last30DaysRemaining,67.26);
 for(const period of ['month','3months','6months','year']){
  const result=await read('sandbox',period),points=result.currencies[0].points;
  const dayCount=Math.round((Date.parse(result.endDate)-Date.parse(result.startDate))/86400000)+1;
  const weekly=['6months','year'].includes(period),width=weekly?7:1;
  assert.equal(points.length,Math.ceil(dayCount/width));
  assert.equal(points[0].date,result.startDate);assert.equal(points.at(-1).endDate,result.endDate);
  for(let i=1;i<points.length;i++)assert.equal(Date.parse(points[i].date)-Date.parse(points[i-1].date),width*86400000);
  assert.equal(points.reduce((sum,p)=>sum+p.orders,0),5);
 }
 // Window edges and weekly boundaries: no gaps, duplicates or extra prior-day sales.
 const long=await read('sandbox','year'),weeklyPoints=long.currencies.find(c=>c.currency==='EUR').points;
 await db.query(`INSERT INTO public.orders VALUES
  (20,'EUR','paid',1,'paddle_sandbox',($1::date::timestamp AT TIME ZONE 'UTC'),now()),
  (21,'EUR','paid',2,'paddle_sandbox',(($1::date+6)::timestamp AT TIME ZONE 'UTC'),now()),
  (22,'EUR','paid',4,'paddle_sandbox',(($1::date+7)::timestamp AT TIME ZONE 'UTC'),now()),
  (23,'EUR','paid',8,'paddle_sandbox',(($1::date-1)::timestamp AT TIME ZONE 'UTC'),now())`,[long.startDate]);
 const edges=(await read('sandbox','year')).currencies.find(c=>c.currency==='EUR');
 assert.equal(edges.points[0].payments,3);assert.equal(edges.points[1].payments,4);
 assert.equal(edges.periodPayments,90.26);
 assert.equal(weeklyPoints[0].date,long.startDate);
 await db.exec('DELETE FROM public.orders WHERE id BETWEEN 20 AND 23');
 // Original purchase date wins over local insertion time; refunds never add a new sale.
 await db.exec("UPDATE public.orders SET status='refunded' WHERE id=1;");
 assert.equal((await read()).currencies.find(c=>c.currency==='EUR').refunds,51);
 await db.exec("UPDATE public.orders SET status='partially_refunded' WHERE id=11;");
 assert.equal((await read()).currencies.find(c=>c.currency==='EUR').reviewOrders,1);
 for(const role of ['anon','authenticated']){
 const rights=(await db.query("SELECT has_function_privilege($1,'public.read_admin_finance(uuid,text,text)','EXECUTE') AS allowed",[role])).rows[0];assert.equal(rights.allowed,false);
 await db.exec('SET ROLE '+role);await assert.rejects(read(),/permission denied/);await db.exec('RESET ROLE');
 }
 await db.exec('SET ROLE service_role');assert.equal((await read()).environment,'sandbox');await assert.rejects(db.query('SELECT public.read_admin_finance($1)',[other]),/Admin access/);await db.exec('RESET ROLE');
 await assert.rejects(read('all'),/Invalid/);await assert.rejects(read('sandbox','invalid'),/Invalid/);
 await db.exec(`UPDATE auth.users SET email_confirmed_at=null WHERE id='${admin}'`);await assert.rejects(read(),/Admin access/);
 await db.exec(`UPDATE auth.users SET email_confirmed_at=now(),banned_until=now()+interval '1 day' WHERE id='${admin}'`);await assert.rejects(read(),/Admin access/);
 }finally{await db.close();}
});
