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
 // Refunded ownership is reusable only after a fresh verified payment.
 await db.exec(read('20261005160000_refunded_product_repurchase.sql'));
 const rebought=await purchase([1],40);assert.equal(await state(1),'active');
 await refund(individual,41);assert.equal(await state(1),'active'); // new delivery for the old refund
 assert.equal((await db.query('SELECT process_sandbox_payment_event($1,$2) r',[individual.event,'a'.repeat(64)])).rows[0].r.outcome,'fulfilled');
 assert.deepEqual((await db.query('SELECT status FROM orders WHERE user_id=$1 AND provider_transaction_id=ANY($2::text[]) ORDER BY id',[buyer,[individual.txn,rebought.txn]])).rows.map(r=>r.status),['refunded','paid']);
 const line={productId:1,slug:'one',priceId:'pri_'+String(1).padStart(26,'0'),paddleProductId:'pro_'+String(1).padStart(26,'0'),amount:500};
 assert.equal((await db.query('SELECT reserve_sandbox_cart($1,$2) r',[buyer,[line]])).rows[0].r.code,'ownership_exists');
 await refund(rebought,42);assert.equal(await state(1),'refunded');
 const again=await purchase([1],43),reBundle=await purchase([10],44);
 await refund(reBundle,45);assert.equal(await state(1),'active');assert.equal(await state(2),'refunded');
 await refund(first,46);assert.equal(await state(1),'active');
 await refund(again,47);assert.equal(await state(1),'refunded');
 await db.query("UPDATE entitlements SET status='revoked' WHERE user_id=$1 AND product_id=1",[buyer]);
 assert.equal((await db.query('SELECT reserve_sandbox_cart($1,$2) r',[buyer,[line]])).rows[0].r.code,'ownership_exists');
 // The retained single-item checkout follows the same repurchase policy.
 const legacyBuyer='00000000-0000-4000-8000-000000000009';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[legacyBuyer]);
 await db.exec("UPDATE products SET slug='qafit01' WHERE id=1;UPDATE sandbox_product_prices SET price_id='pri_01m41bkp4f0fxgb9cfm37n5p4b',paddle_product_id='pro_01m41bf7cprd18e5aebzyp1rzw' WHERE product_id=1");
 async function legacyBuy(n){
  const reserved=(await db.query('SELECT reserve_sandbox_checkout($1,1) r',[legacyBuyer])).rows[0].r;assert.equal(reserved.ok,true);
  const txn='txn_'+String(n).padStart(26,'0');await db.query('SELECT finish_sandbox_checkout($1,$2,$3)',[legacyBuyer,reserved.intent.id,txn]);
  const event={eventId:'evt_'+String(n).padStart(26,'0'),type:'transaction.completed',txnId:txn,intentId:reserved.intent.id,valid:true,priceId:'pri_01m41bkp4f0fxgb9cfm37n5p4b',total:500,subtotal:500,occurredAt:'2026-10-05T12:00:00Z',eventHash:String(n).padStart(64,'0')};
  assert.equal((await db.query('SELECT process_sandbox_payment_event($1,$2) r',[event,'a'.repeat(64)])).rows[0].r.outcome,'fulfilled');return {txn,total:500};
 }
 const legacyOld=await legacyBuy(60);await refund(legacyOld,61);await legacyBuy(62);await refund(legacyOld,63);assert.equal(await state(1,legacyBuyer),'active');
 await db.exec("UPDATE products SET slug='one' WHERE id=1");
 // Assembly commits only the exact source mappings and membership it validated.
 await db.exec(read('20261005170000_automatic_bundle_assembly.sql'));
 await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[path(1)]);
 await db.query("SELECT set_product_download($1,1,NULL,$2,'package.zip',true)",[admin,path(1)]);
 const builtPath='10/00000000-0000-4000-8000-000000000099/built.zip';await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[builtPath]);
 const sources=[{tool_id:1,file_path:path(1)},{tool_id:2,file_path:path(2)}];
 for(const [who,src] of [[buyer,sources],[admin,[sources[0]]],[admin,[sources[0],{...sources[1],file_path:'stale.zip'}]],[admin,[sources[0],sources[0]]]]){
  assert.equal((await db.query("SELECT set_assembled_bundle_download($1,10,$2,$3,'built.zip',$4) r",[who,path(10),builtPath,src])).rows[0].r.ok,false);
 }
 assert.equal((await db.query("SELECT set_assembled_bundle_download($1,10,$2,$3,'built.zip',$4) r",[admin,path(10),builtPath,sources])).rows[0].r.ok,true);
 await assert.rejects(db.query("SELECT set_assembled_bundle_download($1,10,$2,$3,'built.zip',$4)",[admin,path(10),builtPath,sources]),/changed/);
 await db.exec('UPDATE product_downloads SET enabled=false WHERE product_id=2');
 assert.equal((await db.query("SELECT set_assembled_bundle_download($1,10,$2,$3,'built.zip',$4) r",[admin,builtPath,builtPath,sources])).rows[0].r.ok,false);
 assert.equal((await db.query('SELECT file_path FROM bundle_releases WHERE product_id=10')).rows[0].file_path,builtPath);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'set_assembled_bundle_download(uuid,bigint,text,text,text,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 // Pretty bundle titles save independently from their stable identifier.
 await db.exec(read('20261005180000_bundle_display_titles.sql'));
 const bundleRequest='00000000-0000-4000-8000-000000000081';
 const emptyBundle={name:'QA Test Bundle',product_type:'bundle',subtitle:'',description:'',price_eur:null,compatibility:'',current_version:'',release_date:null,category_id:0,complexity_id:0,tool_ids:[]};
 const pretty=(await db.query('SELECT save_product_draft($1,$2,$3) r',[admin,bundleRequest,emptyBundle])).rows[0].r;
 assert.equal(pretty.name,'QA Test Bundle');assert.equal(pretty.slug,'qa_test_bundle');
 const renamed=(await db.query('SELECT save_product_draft($1,$2,$3,$4,$5) r',[admin,bundleRequest,{...emptyBundle,name:'New Bundle Title',slug:pretty.slug},pretty.id,pretty.updated_at])).rows[0].r;
 assert.equal(renamed.name,'New Bundle Title');assert.equal(renamed.slug,pretty.slug);
 assert.equal((await db.query('SELECT published FROM products WHERE id=$1',[pretty.id])).rows[0].published,false);
 await assert.rejects(db.query('SELECT save_product_draft($1,$2,$3,$4,$5)',[admin,bundleRequest,{...emptyBundle,slug:'different'},pretty.id,renamed.updated_at]),/slug is locked/);
 await assert.rejects(db.query('SELECT save_product_draft($1,gen_random_uuid(),$2)',[buyer,emptyBundle]),/Admin access/);
 await assert.rejects(db.query('SELECT save_product_draft($1,gen_random_uuid(),$2)',[admin,emptyBundle]),/duplicate key/);
 // Account presentation separates direct acquisitions from effective tool access.
 await db.exec("ALTER TABLE category ADD COLUMN name text DEFAULT 'SOP'");
 await db.exec('CREATE TABLE account_activations(id bigint PRIMARY KEY,user_id uuid,machine_id text,status text,activated_at timestamptz)');
 await db.exec(read('20261007200000_account_purchase_groups.sql'));
 const displayBuyer='00000000-0000-4000-8000-000000000100';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[displayBuyer]);
 await db.query("INSERT INTO account_activations VALUES(1,$1,'my-pc','active',now()),(2,$2,'other-pc','active',now())",[displayBuyer,buyer]);
 await db.exec("UPDATE sandbox_product_prices SET price_id='pri_'||lpad('1',26,'0'),paddle_product_id='pro_'||lpad('1',26,'0') WHERE product_id=1");
 async function view(who=displayBuyer){return (await db.query('SELECT read_account_purchases($1) r',[who])).rows[0].r;}
 const mixed=await purchase([1,10],90,displayBuyer);
 let page=await view();assert.equal(page.ok,true);assert.equal(page.entitlements.length,3);
 assert.deepEqual(page.entitlements.filter(e=>e.direct_acquisition).map(e=>e.products.id).sort((a,b)=>a-b),[1,10]);
 assert.deepEqual(page.entitlements.find(e=>e.products.id===10).included_tools.map(t=>t.id).sort((a,b)=>a-b),[1,2]);
 assert.deepEqual(page.machines.map(m=>m.machine_id),['my-pc']);
 const bundleLine=(await db.query("SELECT i.provider_item_id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.provider_transaction_id=$1 AND i.product_id=10",[mixed.txn])).rows[0];
 const refundBundle={eventId:'evt_'+String(91).padStart(26,'0'),type:'adjustment.updated',refundId:'adj_'+String(91).padStart(26,'0'),txnId:mixed.txn,refundedTools:true,refundTotal:900,refundItems:[{providerItemId:bundleLine.provider_item_id,amount:900}],occurredAt:'2026-10-07T13:00:00Z',eventHash:'c'.repeat(64)};
 assert.equal((await db.query('SELECT process_sandbox_payment_event($1,$2) r',[refundBundle,'b'.repeat(64)])).rows[0].r.outcome,'refunded');
 page=await view();assert.deepEqual(page.entitlements.filter(e=>e.direct_acquisition).map(e=>e.products.id),[1]);
 const newBundle=await purchase([10],92,displayBuyer);
 await db.query("UPDATE orders SET provider_created_at='2026-10-07T15:00:00Z' WHERE provider_transaction_id=$1",[newBundle.txn]);
 page=await view();assert.deepEqual(page.entitlements.filter(e=>e.direct_acquisition).map(e=>e.products.id).sort((a,b)=>a-b),[1,10]);
 assert.equal(Date.parse(page.entitlements.find(e=>e.products.id===10).granted_at),Date.parse('2026-10-07T15:00:00Z'));
 // Refund the separate tool's original purchase: it remains usable via the rebought bundle,
 // but must no longer appear as a separate acquisition even though source stays purchase.
 await refund(mixed,93);page=await view();assert.deepEqual(page.entitlements.filter(e=>e.direct_acquisition).map(e=>e.products.id),[10]);
 assert.equal(page.entitlements.find(e=>e.products.id===1).source,'purchase');assert.equal(page.entitlements.length,3);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'read_account_purchases(uuid)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 assert.equal((await view('00000000-0000-4000-8000-000000000999')).ok,false);
 const displayAdmin='00000000-0000-4000-8000-000000000101';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[displayAdmin]);
 await db.query("INSERT INTO entitlements(user_id,product_id,source,status) VALUES($1,1,'admin','active'),($1,10,'admin','active')",[displayAdmin]);
 assert.deepEqual((await view(displayAdmin)).entitlements.filter(e=>e.direct_acquisition).map(e=>e.products.id).sort((a,b)=>a-b),[1,10]);
 // Standalone bundle pricing has no dependency on constituent prices.
 await db.exec(read('20261005190000_independent_bundle_pricing.sql'));
 for(const price of [12,20]){
  await db.query('UPDATE products SET price_eur=$1 WHERE id=10',[price]);
  const checklist=(await db.query('SELECT product_publication_checks($1,10) r',[admin])).rows[0].r;
  assert.equal(checklist.ready,true);assert.ok(!checklist.missing.some(x=>x.includes('tools total')));
 }
 await db.exec('UPDATE products SET price_eur=0 WHERE id IN (1,2)');
 assert.equal((await db.query('SELECT product_publication_checks($1,10) r',[admin])).rows[0].r.ready,true);
 await db.exec('UPDATE products SET price_eur=0 WHERE id=10');
 assert.ok((await db.query('SELECT product_publication_checks($1,10) r',[admin])).rows[0].r.missing.includes('Bundle price greater than zero'));
 await db.exec('UPDATE products SET price_eur=9 WHERE id=10');
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

 // Projects reuse the same verified checkout snapshot and purchase-origin rules.
 await db.exec(read('20261007230000_project_delivery.sql'));
 const projectBuyer='00000000-0000-4000-8000-000000000201';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[projectBuyer]);
 await db.exec("UPDATE products SET price_eur=5 WHERE id=1;UPDATE product_downloads SET enabled=true WHERE product_id IN (1,2)");
 assert.equal((await db.query("SELECT set_assembled_bundle_download($1,10,$2,$2,'built.zip',$3) r",[admin,builtPath,sources])).rows[0].r.ok,true); // existing bundle writer survives the new release column
 await db.exec("INSERT INTO products(id,name,slug,price_eur,current_version,compatibility,subtitle,description,category_id,complexity_id,product_type,published) VALUES(200,'Example Project','example_project',15,'1','Houdini 22','Scene','Project description',1,1,'project',false);INSERT INTO product_members VALUES(200,1),(200,2);INSERT INTO product_media(product_id,media_type,file_path,role,sort_order) VALUES(200,'image','test.gif','card',0)");
 await db.query('INSERT INTO sandbox_product_prices VALUES(200,$1,$2,true)',['pri_'+String(200).padStart(26,'0'),'pro_'+String(200).padStart(26,'0')]);
 const projectPath=path(200);await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[projectPath]);
 const fingerprint='d'.repeat(64),projectSources=[{tool_id:1,file_path:path(1)},{tool_id:2,file_path:path(2)}];
 assert.ok((await db.query('SELECT product_publication_checks($1,200) r',[admin])).rows[0].r.missing.includes('Project ZIP and installer matching the included tools'));
 assert.equal((await db.query("SELECT set_product_download($1,200,NULL,$2,'package.zip',true) r",[admin,projectPath])).rows[0].r.ok,false);
 assert.equal((await db.query("SELECT set_bundle_download($1,200,NULL,$2,'package.zip',ARRAY[1,2]::bigint[]) r",[admin,projectPath])).rows[0].r.ok,false);
 for(const [who,src,hash] of [[buyer,projectSources,fingerprint],[admin,projectSources,null],[admin,projectSources,'bad'],[admin,[projectSources[0]],fingerprint],[admin,[projectSources[0],{...projectSources[1],file_path:'stale'}],fingerprint]])
  assert.equal((await db.query("SELECT set_assembled_project_download($1,200,NULL,$2,'package.zip',$3,$4) r",[who,projectPath,src,hash])).rows[0].r.ok,false);
 assert.equal((await db.query("SELECT set_assembled_project_download($1,200,NULL,$2,'package.zip',$3,$4) r",[admin,projectPath,projectSources,fingerprint])).rows[0].r.ok,true);
 await assert.rejects(db.query("SELECT set_assembled_project_download($1,200,NULL,$2,'package.zip',$3,$4)",[admin,projectPath,projectSources,'e'.repeat(64)]),/changed/);
 assert.equal((await db.query('SELECT project_sha256 FROM bundle_releases WHERE product_id=200')).rows[0].project_sha256,fingerprint); // failed replacement rolls back its attestation too
 assert.equal((await db.query('SELECT product_publication_checks($1,200) r',[admin])).rows[0].r.ready,true);
 const projectStamp=(await db.query('SELECT updated_at FROM products WHERE id=200')).rows[0].updated_at;
 await db.query('SELECT publish_product_draft($1,200,$2,$3)',[admin,projectStamp,'pri_'+String(200).padStart(26,'0')]);
 await assert.rejects(db.exec('DELETE FROM product_members WHERE product_id=200'),/immutable/);
 const ownedTool=await purchase([1],200,projectBuyer),ownedProject=await purchase([200],201,projectBuyer);
 assert.equal(await state(2,projectBuyer),'active');assert.equal((await db.query('SELECT bundled_tool_ids FROM order_items WHERE product_id=200')).rows[0].bundled_tool_ids.length,2);
 let projectView=await view(projectBuyer);assert.deepEqual(projectView.entitlements.filter(e=>e.direct_acquisition).map(e=>e.products.id).sort((a,b)=>a-b),[1,200]);assert.equal(projectView.entitlements.find(e=>e.products.id===200).included_tools.length,2);
 assert.equal((await db.query('SELECT record_product_download(gen_random_uuid(),$1,200,$2) r',[projectBuyer,projectPath])).rows[0].r,true);
 await refund(ownedProject,202);assert.equal(await state(1,projectBuyer),'active');assert.equal(await state(2,projectBuyer),'refunded');assert.equal(await state(200,projectBuyer),'refunded');
 assert.equal((await db.query('SELECT record_product_download(gen_random_uuid(),$1,200,$2) r',[projectBuyer,projectPath])).rows[0].r,false);
 const projectAgain=await purchase([200],203,projectBuyer);await refund(ownedProject,204);assert.equal(await state(200,projectBuyer),'active');await refund(ownedTool,205);assert.equal(await state(1,projectBuyer),'active');await refund(projectAgain,206);assert.equal(await state(1,projectBuyer),'refunded');
 const grantUser='00000000-0000-4000-8000-000000000202';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[grantUser]);await db.query("INSERT INTO entitlements(user_id,product_id,source,status) VALUES($1,200,'admin','active')",[grantUser]);assert.equal(await state(2,grantUser),'active');
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'set_assembled_project_download(uuid,bigint,text,text,text,jsonb,text)','EXECUTE') allowed",[role])).rows[0].allowed,false);

 // The new live ledger starts empty and preserves sandbox rows and bundle snapshots.
 const sandboxCount=(await db.query('SELECT count(*)::int n FROM sandbox_payment_events')).rows[0].n;
 await db.exec(read('20261008130000_live_paddle_flows.sql'));
 assert.equal((await db.query('SELECT count(*)::int n FROM live_product_prices')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM sandbox_payment_events')).rows[0].n,sandboxCount);
 const liveChecks=(await db.query('SELECT live_product_publication_checks($1,10) r',[admin])).rows[0].r;assert.ok(liveChecks.missing.includes('Verified Paddle price'));
 await db.exec('UPDATE products SET price_eur=7 WHERE id=2');
 const job=(await db.query('SELECT reserve_live_catalog_setup($1,2,$2,700) r',[admin,'two'])).rows[0].r;assert.equal(job.ok,true);assert.equal(job.created,true);
 const attempt=job.job.attempt_id,livePro='pro_'+String(2).padStart(26,'0'),livePri='pri_'+String(2).padStart(26,'0');
 assert.equal((await db.query("SELECT advance_live_catalog_setup($1,$2,'reserved','product_ready',$3,null) r",[admin,attempt,livePro])).rows[0].r,true);
 assert.equal((await db.query("SELECT advance_live_catalog_setup($1,$2,'product_ready','price_ready',$3,$4) r",[admin,attempt,livePro,livePri])).rows[0].r,true);
 assert.equal((await db.query('SELECT complete_live_catalog_setup($1,$2) r',[admin,attempt])).rows[0].r,true);
 assert.equal((await db.query('SELECT reserve_live_catalog_setup($1,2,$2,700) r',[admin,'two'])).rows[0].r.code,'mapped');
 const liveBuyer='00000000-0000-4000-8000-000000000303';await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[liveBuyer]);
 for(const id of [1,10])await db.query("SELECT set_live_product_price($1,$2,'',false,$3,$4,true)",[admin,id,'pri_'+String(id).padStart(26,'0'),'pro_'+String(id).padStart(26,'0')]);
 async function livePurchase(ids,n){
  const rows=(await db.query('SELECT id,slug,price_eur FROM products WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])).rows;
  const lines=rows.map(p=>({productId:Number(p.id),slug:p.slug,priceId:'pri_'+String(p.id).padStart(26,'0'),paddleProductId:'pro_'+String(p.id).padStart(26,'0'),amount:Number(p.price_eur)*100}));
  const r=(await db.query('SELECT reserve_live_cart($1,$2) r',[liveBuyer,lines])).rows[0].r;assert.equal(r.ok,true);assert.equal(r.intent.version,'cart-v1');
  const transaction='txn_'+String(n).padStart(26,'0');assert.equal((await db.query('SELECT finish_live_checkout($1,$2,$3) r',[liveBuyer,r.intent.id,transaction])).rows[0].r,true);
  const total=lines.reduce((v,i)=>v+i.amount,0),event={environment:'live',eventId:'evt_'+String(n).padStart(26,'0'),type:'transaction.completed',txnId:transaction,intentId:r.intent.id,valid:true,checkoutVersion:'cart-v1',items:lines.map((l,i)=>({...l,providerItemId:'txnitm_'+String(n*100+i).padStart(26,'0')})),total,subtotal:total,occurredAt:'2026-10-08T12:00:00Z',eventHash:String(n).padStart(64,'0')};
  assert.equal((await db.query('SELECT process_live_payment_event($1,$2) r',[{...event,environment:'sandbox'},'a'.repeat(64)])).rows[0].r.ok,false);
  assert.equal((await db.query('SELECT process_live_payment_event($1,$2) r',[event,'a'.repeat(64)])).rows[0].r.outcome,'fulfilled');
  assert.equal((await db.query('SELECT process_live_payment_event($1,$2) r',[event,'b'.repeat(64)])).rows[0].r.outcome,'fulfilled');
  const simulated={...event,eventId:'ntfsimevt_'+String(n).padStart(26,'0')};
  assert.equal((await db.query('SELECT process_live_payment_event($1,$2) r',[simulated,'a'.repeat(64)])).rows[0].r.outcome,'ignored');
  assert.equal((await db.query('SELECT process_live_payment_event($1,$2) r',[{...event,eventHash:'f'.repeat(64)},'a'.repeat(64)])).rows[0].r.ok,false);
  return {transaction,total,event};
 }
 // Same transaction reference as an earlier sandbox purchase stays independently bound.
 const liveTool=await livePurchase([1],1),liveBundle=await livePurchase([10],2);
 assert.equal((await db.query("SELECT count(*)::int n FROM orders WHERE provider_transaction_id=$1",[liveTool.transaction])).rows[0].n,2);
 assert.equal((await db.query("SELECT bundled_tool_ids FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.provider='paddle' AND i.product_id=10")).rows[0].bundled_tool_ids.length,2);
 async function liveRefund(p,n){const e={environment:'live',eventId:'evt_'+String(n).padStart(26,'0'),type:'adjustment.updated',refundId:'adj_'+String(n).padStart(26,'0'),txnId:p.transaction,fullRefund:true,refundTotal:p.total,occurredAt:'2026-10-08T13:00:00Z',eventHash:String(n).padStart(64,'0')};assert.equal((await db.query('SELECT process_live_payment_event($1,$2) r',[e,'b'.repeat(64)])).rows[0].r.outcome,'refunded');}
 await liveRefund(liveBundle,304);assert.equal(await state(1,liveBuyer),'active');assert.equal(await state(2,liveBuyer),'refunded');
 const liveAgain=await livePurchase([10],305);await liveRefund(liveBundle,306);assert.equal(await state(10,liveBuyer),'active');await liveRefund(liveAgain,307);assert.equal(await state(1,liveBuyer),'active');
 assert.equal((await db.query('SELECT count(*)::int n FROM sandbox_payment_events')).rows[0].n,sandboxCount);
 for(const role of ['anon','authenticated']){
  for(const table of ['live_product_prices','live_catalog_setups','live_checkout_intents','live_payment_events'])assert.equal((await db.query("SELECT has_table_privilege($1,$2,'SELECT') allowed",[role,table])).rows[0].allowed,false);
  for(const fn of ['process_live_payment_event(jsonb,text)','reserve_live_cart(uuid,jsonb)','set_live_product_price(uuid,bigint,text,boolean,text,text,boolean)'])assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,false);
 }
 assert.equal((await db.query("SELECT has_function_privilege('service_role','process_cart_live_payment_event(jsonb,text)','EXECUTE') allowed")).rows[0].allowed,false);

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
