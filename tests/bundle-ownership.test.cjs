const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,process,Set,Map,Request,Response,FormData,File,URL,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
const pack=load('src/lib/houdiniPackage.ts',{'server-only':{},'../../public/qatools.json':JSON.parse(fs.readFileSync('public/qatools.json'))}),validate=load('src/lib/adminDownloadUpload.ts',{'server-only':{}}),bundle=load('src/lib/bundlePackage.ts',{'server-only':{},'./houdiniPackage':pack,'./adminDownloadUpload':validate});
const hda=Buffer.concat([Buffer.from('INDX'),Buffer.alloc(40)]),tools=[{id:1,slug:'one'},{id:2,slug:'two'}],entry=(name,bytes=hda)=>({name,bytes}),good=[entry('qatools/otls/one.hda'),entry('qatools/otls/two_online.hdalc')];
test('bundle ZIP matches exact selected tools and rebuilds shared runtime once',async()=>{const zip=pack.makePackageZip([...good,entry('qatools.json',Buffer.from('obsolete'))]);const selected=bundle.bundleTools(zip,tools);assert.deepEqual(Array.from(selected,t=>t.name),['one.hda','two_online.hdalc']);const rebuilt=await pack.buildHoudiniPackage(Buffer.from(JSON.stringify(pack.packageConfig)),selected);assert.ok(rebuilt.includes(Buffer.from('qatools.json')));});
test('bundle ZIP rejects missing, extra, ambiguous, duplicate, script and corrupt entries',()=>{
 for(const entries of [[good[0]],[...good,entry('qatools/otls/other.hda')],[...good,entry('qatools/otls/one.hdalc')],[...good,entry('qatools/scripts/evil.py')],[entry('qatools/otls/one.hda',Buffer.from('not HDA')),good[1]]])assert.throws(()=>bundle.bundleTools(pack.makePackageZip(entries),tools));
 const zip=pack.makePackageZip(good),broken=Buffer.from(zip);broken[50]^=1;assert.throws(()=>bundle.bundleTools(broken,tools));assert.throws(()=>bundle.bundleTools(zip,[...tools,{id:3,slug:'two_online'}]));
});
test('actual PostgreSQL bundle sources, pinned checkout, overlapping refunds and publication gates',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();const read=n=>fs.readFileSync('supabase/migrations/'+n,'utf8'),remote=read('20261002172027_remote_schema.sql'),table=n=>{const at=remote.indexOf('CREATE TABLE "public"."'+n+'"');return remote.slice(at,remote.indexOf(';',at)+1);};
 const admin='00000000-0000-4000-8000-000000000001',buyer='00000000-0000-4000-8000-000000000002';
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);CREATE TABLE admin_users(user_id uuid PRIMARY KEY);CREATE TABLE category(id bigint PRIMARY KEY,active boolean);CREATE TABLE complexity(id bigint PRIMARY KEY,active boolean);CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);CREATE TABLE storage.objects(bucket_id text,name text);INSERT INTO category VALUES(1,true);INSERT INTO complexity VALUES(1,true);`);
 await db.exec(table('products')+table('product_media')+table('orders')+table('order_items')+table('entitlements'));
 await db.exec("INSERT INTO products(id,name,slug,price_eur,current_version,category_id,complexity_id,published) VALUES(1,'one','one',5,'1',1,1,true)");
 for(const file of ['20261003060000_secure_product_downloads.sql','20261003070000_admin_product_downloads.sql','20261003080000_sandbox_checkout_intents.sql','20261003090000_sandbox_payment_fulfillment.sql','20261004100000_paddle_simulation_isolation.sql','20261004120000_customer_order_numbers.sql','20261004130000_sandbox_full_refunds.sql','20261004140000_recheck_approved_refund_events.sql','20261004150000_paddle_replay_event_identity.sql','20261004180000_sandbox_cart_checkout.sql','20261004180100_sandbox_cart_fulfillment.sql','20261004190000_admin_paddle_catalog_setup.sql','20261004200000_sandbox_business_tax_totals.sql','20261005100000_product_drafts.sql','20261005110000_product_main_image.sql','20261005111000_download_request_counts.sql','20261005120000_product_publication_workflow.sql','20261005140000_bundle_ownership_delivery.sql']){
  if(file==='20261005140000_bundle_ownership_delivery.sql'){
   await db.query('INSERT INTO auth.users VALUES($1,now(),null)',['00000000-0000-4000-8000-000000000007']);
   await db.query("INSERT INTO entitlements(user_id,product_id,source,status) VALUES($1,1,'free','active')",['00000000-0000-4000-8000-000000000007']);
  }
  await db.exec(read(file));
 }
 assert.equal((await db.query('SELECT count(*)::int n FROM entitlement_origins')).rows[0].n,1);
 await db.query('INSERT INTO auth.users VALUES($1,now(),null),($2,now(),null)',[admin,buyer]);await db.query('INSERT INTO admin_users VALUES($1)',[admin]);
 for(const [id,slug,price,kind] of [[1,'one',5,'tool'],[2,'two',7,'tool'],[10,'bundle-a',9,'bundle'],[11,'bundle-b',8,'bundle'],[20,'twenty',7,'tool'],[3,'early-bundle',9,'bundle']]){
  await db.query("INSERT INTO products(id,name,slug,price_eur,current_version,compatibility,subtitle,description,category_id,complexity_id,product_type,published) VALUES($1,$2,$2,$3,'1','Houdini 22','Test','Test',1,1,$4,$5) ON CONFLICT(id) DO UPDATE SET category_id=1,complexity_id=1",[id,slug,price,kind,kind==='tool']);
  await db.query("INSERT INTO sandbox_product_prices VALUES($1,$2,$3,true) ON CONFLICT(product_id) DO UPDATE SET price_id=excluded.price_id,paddle_product_id=excluded.paddle_product_id",[id,'pri_'+String(id).padStart(26,'0'),'pro_'+String(id).padStart(26,'0')]);
 }
 const path=id=>id+'/00000000-0000-4000-8000-000000000005/package.zip';
 for(const id of [10,11,3]){
  const memberIds=id===3?[1,20]:[1,2];await db.query('INSERT INTO product_members VALUES($1,$2),($1,$3)',[id,...memberIds]);await db.query("INSERT INTO product_media(product_id,media_type,file_path,role,sort_order) VALUES($1,'image','test.gif','card',0)",[id]);
  assert.ok((await db.query('SELECT product_publication_checks($1,$2) r',[admin,id])).rows[0].r.missing.includes('Bundle ZIP matching the included tools'));
  await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[path(id)]);
  await assert.rejects(db.query("SELECT set_bundle_download($1,$2,NULL,$3,'package.zip',ARRAY[1]::bigint[])",[buyer,id,path(id)]).then(r=>{assert.equal(r.rows[0].set_bundle_download.ok,true)}));
  assert.equal((await db.query("SELECT set_bundle_download($1,$2,NULL,$3,'package.zip',ARRAY[1]::bigint[]) r",[admin,id,path(id)])).rows[0].r.ok,false);
  assert.equal((await db.query("SELECT set_bundle_download($1,$2,NULL,$3,'package.zip',$4::bigint[]) r",[admin,id,path(id),memberIds])).rows[0].r.ok,true);
  assert.equal((await db.query('SELECT product_publication_checks($1,$2) r',[admin,id])).rows[0].r.ready,true);
  const stamp=(await db.query('SELECT updated_at FROM products WHERE id=$1',[id])).rows[0].updated_at;
  await db.query('SELECT publish_product_draft($1,$2,$3,$4)',[admin,id,stamp,'pri_'+String(id).padStart(26,'0')]);
 }
 await assert.rejects(db.exec('DELETE FROM product_members WHERE product_id=10'),/immutable/);
 // Independent purchase followed by two overlapping bundle purchases.
 async function purchase(ids,n,who=buyer){
  const rows=(await db.query('SELECT id,slug,price_eur FROM products WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])).rows;const lines=rows.map(p=>({productId:Number(p.id),slug:p.slug,priceId:'pri_'+String(p.id).padStart(26,'0'),paddleProductId:'pro_'+String(p.id).padStart(26,'0'),amount:Number(p.price_eur)*100}));
  const reserved=(await db.query('SELECT reserve_sandbox_cart($1,$2) r',[who,lines])).rows[0].r;assert.equal(reserved.ok,true);
  const txn='txn_'+String(n).padStart(26,'0');await db.query('SELECT finish_sandbox_checkout($1,$2,$3)',[who,reserved.intent.id,txn]);
  const total=lines.reduce((s,l)=>s+l.amount,0),event={eventId:'evt_'+String(n).padStart(26,'0'),type:'transaction.completed',txnId:txn,intentId:reserved.intent.id,valid:true,checkoutVersion:'cart-v1',items:lines.map((l,i)=>({...l,providerItemId:'txnitm_'+String(n*100+i).padStart(26,'0')})),total,subtotal:total,occurredAt:'2026-10-05T12:00:00Z',eventHash:String(n).padStart(64,'0')};
  assert.equal((await db.query('SELECT process_sandbox_payment_event($1,$2) r',[event,'a'.repeat(64)])).rows[0].r.outcome,'fulfilled');return {txn,total,id:n,event};
 }
 async function refund(p,n){const event={eventId:'evt_'+String(n).padStart(26,'0'),type:'adjustment.updated',refundId:'adj_'+String(n).padStart(26,'0'),txnId:p.txn,fullRefund:true,refundTotal:p.total,occurredAt:'2026-10-05T13:00:00Z',eventHash:String(n).padStart(64,'0')};const result=(await db.query('SELECT process_sandbox_payment_event($1,$2) r',[event,'b'.repeat(64)])).rows[0].r;assert.equal(result.outcome,'refunded');assert.equal((await db.query('SELECT process_sandbox_payment_event($1,$2) r',[event,'b'.repeat(64)])).rows[0].r.outcome,'refunded');}
 async function state(id,who=buyer){return (await db.query('SELECT status FROM entitlements WHERE user_id=$1 AND product_id=$2',[who,id])).rows[0].status;}
 const individual=await purchase([1],1),first=await purchase([10],2),second=await purchase([11],3);
 await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[path(2)]);
 assert.equal((await db.query("SELECT set_product_download($1,2,NULL,$2,'package.zip',true) r",[admin,path(2)])).rows[0].r.ok,true);
 assert.equal((await db.query('SELECT record_product_download(gen_random_uuid(),$1,2,$2) r',[buyer,path(2)])).rows[0].r,true);
 assert.equal(await state(2),'active');assert.equal((await db.query('SELECT bundled_tool_ids FROM order_items WHERE product_id=10')).rows[0].bundled_tool_ids.length,2);
 await refund(first,20);assert.equal(await state(1),'active');assert.equal(await state(2),'active');assert.equal(await state(10),'refunded');
 await refund(second,22);assert.equal(await state(1),'active');assert.equal(await state(2),'refunded'); // independent purchase survives both bundle refunds
 await refund(individual,21);assert.equal(await state(1),'refunded');
 // A fresh bundle refund preserves an independent tool from before the purchase.
 const buyer2='00000000-0000-4000-8000-000000000003';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[buyer2]);
 await db.query("INSERT INTO entitlements(user_id,product_id,source,status) VALUES($1,1,'admin','active')",[buyer2]);
 const extra=await purchase([10],4,buyer2);await refund(extra,23);assert.equal(await state(1,buyer2),'active');assert.equal(await state(2,buyer2),'refunded');
 const buyer3='00000000-0000-4000-8000-000000000004';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[buyer3]);
 const together=await purchase([10,1],5,buyer3);assert.equal(await state(1,buyer3),'active');await refund(together,24);assert.equal(await state(1,buyer3),'refunded');assert.equal(await state(2,buyer3),'refunded');
 const buyer4='00000000-0000-4000-8000-000000000005';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[buyer4]);
 await db.exec("CREATE FUNCTION fail_bundle_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='00000000-0000-4000-8000-000000000005' AND NEW.product_id=20 THEN RAISE EXCEPTION 'forced bundle rollback'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_bundle_test BEFORE INSERT ON entitlements FOR EACH ROW EXECUTE FUNCTION fail_bundle_test();");
 await assert.rejects(purchase([3,20],6,buyer4),/forced bundle rollback/);assert.equal((await db.query('SELECT count(*)::int n FROM orders WHERE user_id=$1',[buyer4])).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM entitlements WHERE user_id=$1',[buyer4])).rows[0].n,0);await db.exec('DROP TRIGGER fail_bundle_test ON entitlements');
 const bundleFirst=await purchase([3,20],6,buyer4);assert.equal(await state(20,buyer4),'active');await refund(bundleFirst,25);assert.equal(await state(20,buyer4),'refunded');
 // Manual bundle grants have the same included-tool coverage and can be revoked independently.
 const adminBuyer='00000000-0000-4000-8000-000000000006';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[adminBuyer]);
 await db.query("INSERT INTO entitlements(user_id,product_id,source,status) VALUES($1,10,'admin','active')",[adminBuyer]);assert.equal(await state(2,adminBuyer),'active');
 assert.equal((await db.query('SELECT record_product_download(gen_random_uuid(),$1,2,$2) r',[adminBuyer,path(2)])).rows[0].r,true);
 assert.deepEqual((await db.query('SELECT source FROM product_download_events ORDER BY source')).rows.map(r=>r.source),['admin','purchase']);
 await db.query("UPDATE entitlements SET status='revoked' WHERE user_id=$1 AND product_id=10",[adminBuyer]);assert.equal(await state(2,adminBuyer),'revoked');
 await db.query("INSERT INTO products(id,name,slug,price_eur,current_version,product_type,published) VALUES(30,'unused-bundle','unused-bundle',3,'1','bundle',false)");
 await db.exec('INSERT INTO product_members VALUES(30,1),(30,2)');await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[path(30)]);
 assert.equal((await db.query("SELECT set_bundle_download($1,30,NULL,$2,'package.zip',ARRAY[1,2]::bigint[]) r",[admin,path(30)])).rows[0].r.ok,true);
 const unusedStamp=(await db.query('SELECT updated_at FROM products WHERE id=30')).rows[0].updated_at;
 await db.query('SELECT delete_unused_product_draft($1,30,$2)',[admin,unusedStamp]);assert.equal((await db.query('SELECT count(*)::int n FROM bundle_releases WHERE product_id=30')).rows[0].n,0);
 await db.exec("SELECT setval(pg_get_serial_sequence('public.products','id'),(SELECT max(id) FROM products),true)");
 await db.exec(read('20261005150000_prepared_tool_identity.sql'));
 const rid='00000000-0000-4000-8000-000000000080';
 const identity={schema:1,label:'Beautiful Noise',internal_name:'Beautiful_Noise',slug:'beautiful_noise',file:'beautiful_noise.hda',sha256:'a'.repeat(64)};
 const imported=(await db.query('SELECT import_prepared_tool($1,$2,$3) r',[admin,rid,identity])).rows[0].r;
 assert.equal(imported.name,'Beautiful Noise');assert.equal(imported.slug,'beautiful_noise');
 assert.deepEqual((await db.query('SELECT import_prepared_tool($1,$2,$3) r',[admin,rid,identity])).rows[0].r,imported);
 await assert.rejects(db.query('SELECT import_prepared_tool($1,$2,$3)',[buyer,rid,identity]),/Admin access/);
 await assert.rejects(db.query('SELECT import_prepared_tool($1,$2,$3)',[admin,rid,{...identity,sha256:'b'.repeat(64)}]),/request changed/);
 await assert.rejects(db.query('SELECT import_prepared_tool($1,gen_random_uuid(),$2)',[admin,identity]),/duplicate key/);
 const data={name:identity.label,slug:identity.slug,product_type:'tool',subtitle:'New subtitle',description:'',price_eur:null,compatibility:'',current_version:'',release_date:null,category_id:0,complexity_id:0,tool_ids:[]};
 const updated=(await db.query('SELECT save_product_draft($1,$2,$3,$4,$5) r',[admin,rid,data,imported.id,imported.updated_at])).rows[0].r;
 await assert.rejects(db.query('SELECT save_product_draft($1,$2,$3,$4,$5)',[admin,rid,{...data,name:'Changed Name'},imported.id,updated.updated_at]),/identity is locked/);
 await assert.rejects(db.query('SELECT save_product_draft($1,$2,$3,$4,$5)',[admin,rid,{...data,slug:'other'},imported.id,updated.updated_at]),/identity is locked/);
 await assert.rejects(db.query('SELECT save_product_draft($1,gen_random_uuid(),$2)',[admin,data]),/Upload a prepared tool/);
 assert.equal((await db.query('SELECT name FROM products WHERE id=$1',[imported.id])).rows[0].name,identity.label);
 assert.ok(!(await db.query('SELECT product_publication_checks($1,$2) r',[admin,imported.id])).rows[0].r.missing.includes('Valid title'));
 const releasePath=path(imported.id);await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[releasePath]);
 const nextIdentity={...identity,sha256:'b'.repeat(64)};
 await assert.rejects(db.query("SELECT replace_prepared_tool_download($1,$2,NULL,$3,'package.zip',$4)",[admin,imported.id,releasePath,{...nextIdentity,label:'Wrong Tool'}]),/identity is locked/);
 assert.equal((await db.query("SELECT replace_prepared_tool_download($1,$2,NULL,$3,'package.zip',$4) r",[admin,imported.id,releasePath,nextIdentity])).rows[0].r.ok,true);
 await assert.rejects(db.query("SELECT replace_prepared_tool_download($1,$2,NULL,$3,'package.zip',$4)",[admin,imported.id,releasePath,nextIdentity]),/Download changed/);
 assert.equal((await db.query('SELECT prepared_identity FROM products WHERE id=$1',[imported.id])).rows[0].prepared_identity.sha256,nextIdentity.sha256);
 await db.query('SELECT delete_unused_product_draft($1,$2,$3)',[admin,imported.id,updated.updated_at]);
 assert.ok((await db.query('SELECT import_prepared_tool($1,gen_random_uuid(),$2) r',[admin,identity])).rows[0].r.id);
 assert.equal((await db.query('SELECT slug FROM products WHERE id=1')).rows[0].slug,'one');
 assert.equal((await db.query("SELECT has_function_privilege('service_role','save_product_draft_legacy(uuid,uuid,jsonb,bigint,timestamptz)','EXECUTE') allowed")).rows[0].allowed,false);
 for(const role of ['anon','authenticated']){assert.equal((await db.query("SELECT has_table_privilege($1,'entitlement_origins','INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role])).rows[0].allowed,false);assert.equal((await db.query("SELECT has_function_privilege($1,'set_bundle_download(uuid,bigint,text,text,text,bigint[])','EXECUTE') allowed",[role])).rows[0].allowed,false);}
 }finally{await db.close();}
});


function routeSetup(options={}){
 const calls=[],zip=pack.makePackageZip(options.missing?[good[0]]:good);
 const db={from(table){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:table==='products'?{id:10,slug:'bundle-a',product_type:options.project?'project':'bundle',published:false}:null,error:null};},async in(){return {data:tools.map(t=>({...t,product_type:'tool',published:true})),error:null};},then(resolve,reject){return Promise.resolve({data:tools.map(t=>({tool_id:t.id})),error:null}).then(resolve,reject);}};return q;},storage:{async getBucket(){return {data:{public:false},error:null};},from(){return {async upload(path,bytes){calls.push({path,bytes});return {error:null};}};}},async rpc(name,args){calls.push({name,args});return {data:{ok:!options.conflict},error:null};}};
 const route=load('src/app/api/admin/products/package/route.ts',{'@/lib/requireAdmin':{requireAdmin:async()=>options.denied?{response:Response.json({error:'denied'},{status:403})}:{user:{id:'trusted-admin'}}},'@/lib/activationHttp':{privateJson:(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}})},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/houdiniPackage':pack,'@/lib/preparedTool':{preparedTool(){throw Error('Use prepared ZIP')}},'@/lib/bundlePackage':bundle});
 const form=new FormData();form.set('tool',new File([zip],'bundle.zip'));
 return {calls,post:()=>route.POST(new Request('http://localhost/api/admin/products/package?productId=10&expectedPath=',{method:'POST',body:form}))};
}
test('bundle upload authenticates, validates membership and binds only trusted IDs atomically',async()=>{
 const s=routeSetup(),response=await s.post();assert.equal(response.status,200);const saved=s.calls.find(c=>c.name);assert.equal(saved.name,'set_bundle_download');assert.equal(saved.args.p_admin_id,'trusted-admin');assert.deepEqual(Array.from(saved.args.p_tool_ids),[1,2]);assert.equal(saved.args.p_expected_path,null);assert.equal(response.headers.get('Cache-Control'),'no-store');
 for(const [options,status] of [[{denied:true},403],[{missing:true},400],[{project:true},409]]){const bad=routeSetup(options);assert.equal((await bad.post()).status,status);assert.equal(bad.calls.length,0);}
 const changed=routeSetup({conflict:true});assert.equal((await changed.post()).status,409);
});
