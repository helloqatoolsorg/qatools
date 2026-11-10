const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const admin='00000000-0000-0000-0000-000000000001',user='00000000-0000-0000-0000-000000000002';
for(const [endpoint,rpc] of [['download-counts','read_admin_download_counts'],['dashboard','read_admin_dashboard_counts']])
test(endpoint+' route authorizes every request and hides diagnostics',async()=>{
 for(const option of ['denied','success','failure','throw',...(endpoint==='dashboard'?['missingMigration']:[])]){
 const calls=[];const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/'+endpoint+'/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name){
 if(name==='@/lib/requireAdmin')return {requireAdmin:async()=>option==='denied'?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:admin}}};
 if(name==='@/lib/activationHttp')return {privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})};
 if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:{rpc:async(name,args)=>{calls.push({name,args});if(option==='throw')throw Error('private diagnostic');return {data:option==='failure'?null:{free:2,paid:1,admin:0,total:3},error:option==='missingMigration'?{code:'PGRST202',message:'private diagnostic'}:option==='failure'?{message:'private diagnostic'}:null};}}};throw Error(name);
 }});
 const r=await exports.GET(new Request('http://localhost/api/admin/download-counts?adminId=forged'));assert.equal(r.status,option==='denied'?403:option==='success'?200:503);assert.equal(r.headers.get('cache-control'),'no-store');const body=await r.text();assert.ok(!body.includes('private diagnostic'));if(option==='missingMigration')assert.match(body,/20261110100000_admin_dashboard_counts/);if(option==='denied')assert.equal(calls.length,0);else assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{name:rpc,args:{p_admin_id:admin}});
 }
});
test('actual PostgreSQL download counts preserve acquisition source and enforce ownership',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
 CREATE TABLE admin_users(user_id uuid PRIMARY KEY);CREATE TABLE products(id bigint PRIMARY KEY,price_eur numeric);
 CREATE TABLE entitlements(user_id uuid,product_id bigint,source text,status text,PRIMARY KEY(user_id,product_id));
 CREATE TABLE product_downloads(product_id bigint PRIMARY KEY,file_path text,enabled boolean);
 INSERT INTO products VALUES(1,0),(2,5),(3,5);INSERT INTO product_downloads VALUES(1,'1.zip',true),(2,'2.zip',true),(3,'3.zip',true);`);
 await db.query('INSERT INTO auth.users VALUES($1,now(),NULL),($2,now(),NULL)',[admin,user]);await db.query('INSERT INTO admin_users VALUES($1)',[admin]);
 await db.query("INSERT INTO entitlements VALUES($1,1,'free','active'),($1,2,'purchase','active'),($1,3,'admin','active')",[user]);
 await db.exec(fs.readFileSync('supabase/migrations/20261005111000_download_request_counts.sql','utf8'));
 let n=10;const next=()=> '00000000-0000-0000-0000-'+String(n++).padStart(12,'0');
 async function record(id=1,who=user,path=id+'.zip',request=next()){return (await db.query('SELECT public.record_product_download($1,$2,$3,$4) result',[request,who,id,path])).rows[0].result;}
 async function counts(who=admin){return (await db.query('SELECT public.read_admin_download_counts($1) result',[who])).rows[0].result;}
 assert.deepEqual(await counts(),{free:0,paid:0,admin:0,total:0});
 const retry=next();assert.equal(await record(1,user,'1.zip',retry),true);assert.equal(await record(1,user,'1.zip',retry),true);assert.equal(await record(),true);assert.equal(await record(2),true);assert.equal(await record(3),true);assert.deepEqual(await counts(),{free:2,paid:1,admin:1,total:4});
 assert.equal(await record(1,admin),false);assert.equal(await record(1,user,'old.zip'),false);
 await db.exec("UPDATE entitlements SET status='refunded' WHERE product_id=2");assert.equal(await record(2),false);
 await db.exec('UPDATE product_downloads SET enabled=false WHERE product_id=1');assert.equal(await record(),false);
 await db.query('UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1',[user]);assert.equal(await record(3),false);
 await db.query("UPDATE auth.users SET email_confirmed_at=now(),banned_until=now()+interval '1 day' WHERE id=$1",[user]);assert.equal(await record(3),false);
 await db.exec("UPDATE products SET price_eur=100;UPDATE entitlements SET source='admin'");assert.deepEqual(await counts(),{free:2,paid:1,admin:1,total:4});await assert.rejects(counts(user),/Admin access/);
 for(const role of ['anon','authenticated','service_role']){
 const p=(await db.query("SELECT has_table_privilege($1,'product_download_events','SELECT,INSERT,UPDATE,DELETE') access,has_function_privilege($1,'record_product_download(uuid,uuid,bigint,text)','EXECUTE') record",[role])).rows[0];assert.equal(p.access,false);assert.equal(p.record,role==='service_role');
 }
 await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[admin]);await assert.rejects(counts(),/Admin access/);
 }finally{await db.close();}
});

test('dashboard counts active purchased tools once per account and excludes free or refunded access',
 {skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 try {
  await db.exec(`
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
   CREATE TABLE admin_users(user_id uuid PRIMARY KEY);
   CREATE TABLE products(id bigint PRIMARY KEY,product_type text,price_eur numeric);
   CREATE TABLE account_activations(user_id uuid,status text);
   CREATE TABLE entitlements(id bigint PRIMARY KEY,user_id uuid,product_id bigint,source text,status text);
   CREATE TABLE entitlement_origins(root_id bigint,tool_id bigint,status text);
   CREATE TABLE product_downloads(product_id bigint,file_path text,enabled boolean);
   INSERT INTO auth.users VALUES('${admin}',now(),NULL),('${user}',now(),NULL);
   INSERT INTO admin_users VALUES('${admin}');
   INSERT INTO products VALUES(1,'tool',5),(2,'tool',10),(3,'tool',15),(4,'tool',0),(5,'bundle',20),(6,'tool',7);
   INSERT INTO account_activations VALUES('${user}','active'),('${admin}','released');
   INSERT INTO entitlements VALUES
     (1,'${user}',1,'purchase','active'),
     (2,'${user}',2,'bundle','active'),
     (3,'${user}',3,'purchase','refunded'),
     (4,'${user}',4,'free','active'),
     (5,'${user}',5,'purchase','active'),
     (6,'${user}',6,'admin','active'),
     (7,'${admin}',1,'purchase','active');
   INSERT INTO entitlement_origins VALUES
     (1,1,'active'),(5,1,'active'),(5,2,'active'),(5,5,'active'),
     (3,3,'refunded'),(4,4,'active'),(6,6,'active'),(7,1,'active');
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261005111000_download_request_counts.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261110100000_admin_dashboard_counts.sql','utf8'));
  await db.exec("INSERT INTO product_download_events (id,product_id,source) VALUES (gen_random_uuid(),1,'purchase')");
  const counts=async who=>(await db.query('SELECT public.read_admin_dashboard_counts($1) AS counts',[who])).rows[0].counts;
  assert.deepEqual(await counts(admin),{downloads:1,users:2,paidToolActivations:2});
  await assert.rejects(counts(user),/Admin access required/);
  await db.exec("UPDATE entitlement_origins SET status='refunded' WHERE root_id=5");
  assert.deepEqual(await counts(admin),{downloads:1,users:2,paidToolActivations:1});
  await db.exec("UPDATE account_activations SET status='released'");
  assert.deepEqual(await counts(admin),{downloads:1,users:2,paidToolActivations:0});
  for(const role of ['anon','authenticated','service_role']){
   const { rows: [row] }=await db.query("SELECT has_function_privilege($1,'public.read_admin_dashboard_counts(uuid)','EXECUTE') AS allowed",[role]);
   assert.equal(row.allowed,role==='service_role');
  }
 } finally { await db.close(); }
});
