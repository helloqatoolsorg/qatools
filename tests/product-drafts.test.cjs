const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const admin='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const valid={name:'qatest01',product_type:'tool',subtitle:'A tool',description:'Tool description',price_eur:5,compatibility:'Houdini 22',current_version:'1.0',release_date:null,category_id:1,complexity_id:1,tool_ids:[]};
function load(file,mocks={}) {const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const exports={};vm.runInNewContext(code,{exports,require:n=>n in mocks?mocks[n]:require(n),Buffer,Uint8Array,URL,Request,Response,Set,Date,Number,JSON});return exports;}
const lib=load('src/lib/productDraft.ts');
const mediaLib=load('src/lib/productMedia.ts',{'server-only':{}});
function setup(options={}) {
 const calls=[];
 const db={from(table){calls.push({table});const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return Promise.resolve({data:options.noExisting?null:{id:1,published:!!options.published,slug:'qatest01',price_eur:options.paid?5:0,updated_at:'2026-10-05T00:00:00Z'},error:null});},then(resolve,reject){const data=table==='products'?[{id:1,name:'tool',tool_ids:[]}]:[];return Promise.resolve({data,count:data.length,error:options.readError?{message:'secret'}:null}).then(resolve,reject);}};return q;},async rpc(name,args){calls.push({rpc:name,args});if(name==='product_publication_checks')return {data:{ready:true,missing:[],updated_at:'2026-10-05T00:00:00Z'},error:null};return {data:{id:10,media_id:20,updated_at:'2026-10-05T01:00:00Z'},error:options.rpcError?{code:options.rpcError,message:options.primaryKey?'duplicate key violates products_pkey':'secret details'}:null};},storage:{async getBucket(){return {data:{public:true},error:null};},from(bucket){return {async upload(file,bytes){calls.push({bucket,upload:file,bytes});return {error:null};},async remove(files){calls.push({remove:files});return {error:null};}};}}};
 const route=load('src/app/api/admin/products/route.ts',{'@/lib/requireAdmin':{async requireAdmin(){return options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:admin}};}},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/paddleCartDatabase':{paddleCartDatabase:db},'@/lib/paddleCartCatalog':{verifyCatalogPrice:async()=>{if(options.providerFailure)throw Error("secret provider detail");}},'@/lib/productDraft':lib});
 const media=load('src/app/api/admin/products/media/route.ts',{'@/lib/requireAdmin':{async requireAdmin(){return options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:admin}};}},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/productMedia':mediaLib});
 const request=data=>new Request('http://localhost/api/admin/products',{method:'POST',body:JSON.stringify(data)});
 return {calls,route,media,post:data=>route.POST(request(data)),get:()=>route.GET(new Request('http://localhost/api/admin/products'))};
}
test('draft validation rejects browser publication, bad money, unsafe names and invalid composition',()=>{
 assert.equal(lib.validDraft(valid),true);
 for(const patch of [{published:true},{price_eur:1.001},{name:'../tool'},{name:'Tool'},{category_id:1.5},{product_type:'other'},{tool_ids:[1]},{product_type:'project',tool_ids:[1,1]},{tool_ids:'bad'}])assert.equal(lib.validDraft({...valid,...patch}),false);
 assert.equal(lib.validDraft({...valid,product_type:'bundle',tool_ids:[1,2]}),true);
});
test('both product methods and media deny non-admins before any privileged work',async()=>{
 const s=setup({denied:true}); for(const response of [await s.get(),await s.post({}),await s.route.PATCH(new Request('http://localhost/api/admin/products',{method:'PATCH',body:'{}'})),await s.media.POST(new Request('http://localhost/api/admin/products/media?productId=1',{method:'POST',body:'x'}))]){assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'no-store');}assert.equal(s.calls.length,0);
});
test('catalog reads complete draft information and never leaks database errors',async()=>{
 const s=setup();assert.equal((await (await s.get()).json()).products.length,1);
 const bad=setup({readError:true});const response=await bad.get();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('secret'));
});
test('creation forwards only a valid draft and authenticated admin identity',async()=>{
 const s=setup();const response=await s.post({requestId:other,data:valid});assert.equal(response.status,200);assert.equal(s.calls[0].rpc,'save_product_draft');assert.equal(s.calls[0].args.p_admin_id,admin);assert.equal(s.calls[0].args.p_product_id,undefined);
 const bad=setup();assert.equal((await bad.post({requestId:other,data:{...valid,published:true}})).status,400);assert.equal(bad.calls.length,0);
});
test('stale draft and duplicate name errors are clear without SQL leakage',async()=>{
 for(const [code,status] of [['40001',409],['23505',409],['22023',400],['XX000',503]]){const s=setup({rpcError:code});const response=await s.post({requestId:other,data:valid});assert.equal(response.status,status);assert.ok(!(await response.text()).includes('secret'));}
});
test('publishing routes enforce an authenticated identity and reject malformed or stale requests',async()=>{
 const s=setup(); const request=body=>new Request('http://localhost/api/admin/products',{method:'PATCH',body:JSON.stringify(body)});
 assert.equal((await s.route.PATCH(request({productId:1,expectedUpdatedAt:'2026-10-05T00:00:00Z'}))).status,200);assert.equal(s.calls.find(c=>c.rpc==='publish_product_draft').args.p_admin_id,admin);
 const bad=setup();assert.equal((await bad.route.PATCH(request({productId:1,published:true}))).status,400);assert.equal(bad.calls.length,0);
 const stale=setup({rpcError:'40001'});assert.equal((await stale.route.PATCH(request({productId:1,expectedUpdatedAt:'2026-10-05T00:00:00Z'}))).status,409);
});
test('image validation rejects SVG/HTML and media upload cleans up a failed attachment',async()=>{
 assert.equal(mediaLib.imageFormat(Buffer.from('<svg></svg>')),null);assert.equal(mediaLib.imageFormat(Buffer.from('<html>')),null);
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
 const s=setup({rpcError:'40001'});const response=await s.media.POST(new Request('http://localhost/api/admin/products/media?productId=1',{method:'POST',body:png}));assert.equal(response.status,409);const uploaded=s.calls.find(c=>c.upload);assert.match(uploaded.upload,/^drafts\/1\/[a-f0-9-]+\.png$/);assert.deepEqual(Array.from(s.calls.find(c=>c.remove).remove),[uploaded.upload]);
 const blocked=setup({published:true});assert.equal((await blocked.media.POST(new Request('http://localhost/api/admin/products/media?productId=1',{method:'POST',body:png}))).status,409);assert.ok(!blocked.calls.some(c=>c.upload));
});
test('actual PostgreSQL draft lifecycle, retry, composition, isolation and stale edits',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 try {
 const schema=fs.readFileSync('supabase/migrations/20261002172027_remote_schema.sql','utf8');
 const table=name=>schema.slice(schema.indexOf('CREATE TABLE "public"."'+name+'"'),schema.indexOf(';',schema.indexOf('CREATE TABLE "public"."'+name+'"'))+1);
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz); CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY); CREATE TABLE public.category(id bigint PRIMARY KEY,active boolean); CREATE TABLE public.complexity(id bigint PRIMARY KEY,active boolean); CREATE TABLE public.product_downloads(product_id bigint PRIMARY KEY,file_path text,enabled boolean);');
 await db.exec(table('products')+table('product_media'));
 await db.exec("ALTER TABLE products ENABLE ROW LEVEL SECURITY; GRANT SELECT ON products TO anon,authenticated; CREATE POLICY published_read ON products FOR SELECT TO anon,authenticated USING(published); INSERT INTO category VALUES(1,true),(2,false); INSERT INTO complexity VALUES(1,true); INSERT INTO products(name,slug,price_eur,current_version,category_id,complexity_id,published) VALUES('qafit01','qafit01',5,'1',1,1,true),('qaroad01','qaroad01',30,'1',1,1,true);");
 await db.query('INSERT INTO auth.users VALUES($1,now(),NULL),($2,now(),NULL)',[admin,other]);await db.query('INSERT INTO admin_users VALUES($1)',[admin]);
 await db.exec(fs.readFileSync('supabase/migrations/20261005100000_product_drafts.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261005110000_product_main_image.sql','utf8'));
 async function save(d=valid,request=other,id=null,stamp=null,who=admin){return (await db.query('SELECT public.save_product_draft($1,$2,$3,$4,$5) result',[who,request,d,id,stamp])).rows[0].result;}
 const first=await save();assert.equal(first.id,3);assert.deepEqual(await save(),first);assert.equal((await db.query('SELECT count(*)::int n FROM products')).rows[0].n,3);
 const row=(await db.query('SELECT * FROM products WHERE id=3')).rows[0];assert.equal(row.published,false);assert.equal(row.name,row.slug);assert.equal(row.product_type,'tool');
 await assert.rejects(save(valid,'00000000-0000-0000-0000-000000000003',null,null,other),/Admin access/);
 await assert.rejects(save(valid,'00000000-0000-0000-0000-000000000003'),/duplicate key/);
 await assert.rejects(save({...valid,category_id:2}),/Invalid price or lookup/);
 const updated=await save({...valid,subtitle:'Updated'},other,first.id,first.updated_at);assert.notEqual(updated.updated_at,first.updated_at);
 await assert.rejects(save(valid,other,first.id,first.updated_at),/Draft changed/);
 const bundle={...valid,name:'qabundle01',product_type:'bundle',tool_ids:[1,2],price_eur:25};const b=await save(bundle,'00000000-0000-0000-0000-000000000004');assert.equal((await db.query('SELECT count(*)::int n FROM product_members WHERE product_id=$1',[b.id])).rows[0].n,2);
 for(const tool_ids of [[1,1],[3],[999],[b.id]])await assert.rejects(save({...bundle,name:'qabad01',tool_ids},'00000000-0000-0000-0000-000000000005'),/Invalid composition/);
 await assert.rejects(save({...bundle,name:'qabad01',price_eur:35},'00000000-0000-0000-0000-000000000005'),/Invalid composition/);
 await assert.rejects(db.query('UPDATE products SET published=true WHERE id=$1',[b.id]),/composed_products_remain_drafts/);
 let image=(await db.query("SELECT public.attach_product_draft_image($1,$2,'drafts/3/00000000-0000-0000-0000-000000000009.png') result",[admin,first.id])).rows[0].result;assert.notEqual(image.updated_at,updated.updated_at);assert.equal((await db.query('SELECT role FROM product_media WHERE product_id=3')).rows[0].role,'card');
 await assert.rejects(db.query("SELECT public.attach_product_draft_image($1,1,'drafts/1/00000000-0000-0000-0000-000000000009.png')",[admin]),/Unpublished draft/);
 await assert.rejects(db.query('SELECT public.publish_product_draft($1,$2,$3)',[admin,3,image.updated_at]),/Tool artwork and enabled download/);
 await assert.rejects(db.query('SELECT public.publish_product_draft($1,$2,$3)',[admin,b.id,b.updated_at]),/Tool artwork and enabled download/);

 const card=(await db.query('SELECT id FROM product_media WHERE product_id=3')).rows[0].id;
 async function replace(stamp=image.updated_at,media=card,who=admin,path='drafts/3/00000000-0000-0000-0000-000000000010.png'){return (await db.query('SELECT public.set_product_draft_card($1,3,$2,$3,$4) result',[who,media,stamp,path])).rows[0].result;}
 await db.exec("INSERT INTO product_media(product_id,media_type,file_path,role,sort_order) VALUES(3,'image','old.png','main',1),(3,'image','gallery.png','gallery',2)");
 await assert.rejects(replace(image.updated_at,null),/Image changed/);await assert.rejects(replace(image.updated_at,card,other),/Admin access/);await assert.rejects(replace(image.updated_at,card,admin,'unsafe.png'),/Invalid media path/);
 const oldStamp=image.updated_at;image=await replace();assert.equal(image.media_id,card);assert.equal((await db.query('SELECT count(*)::int n FROM product_media WHERE product_id=3')).rows[0].n,3);assert.equal((await db.query("SELECT count(*)::int n FROM product_media WHERE product_id=3 AND role IN ('card','main')")).rows[0].n,1);await assert.rejects(replace(oldStamp),/Draft changed/);
 image=await replace();assert.equal(image.media_id,card);
 const fresh=await save({...valid,name:'qapreview01'},'00000000-0000-0000-0000-000000000006');
 const created=(await db.query('SELECT public.set_product_draft_card($1,$2,NULL,$3,$4) result',[admin,fresh.id,fresh.updated_at,'drafts/'+fresh.id+'/00000000-0000-0000-0000-000000000010.png'])).rows[0].result;assert.ok(created.media_id);
 await db.exec("INSERT INTO product_downloads VALUES(3,'3/release.zip',true)");
 const published=(await db.query('SELECT public.publish_product_draft($1,$2,$3) result',[admin,3,image.updated_at])).rows[0].result;assert.equal(published.id,3);
 await assert.rejects(save(valid,other,3,published.updated_at),/Draft changed/);
 for(const role of ['anon','authenticated','service_role']){const privileges=(await db.query("SELECT has_function_privilege($1,'public.save_product_draft(uuid,uuid,jsonb,bigint,timestamptz)','EXECUTE') allowed,has_table_privilege($1,'public.product_members','INSERT,UPDATE,DELETE') writes",[role])).rows[0];assert.equal(privileges.allowed,role==='service_role');assert.equal(privileges.writes,false);}
 await db.exec('SET ROLE anon');assert.equal((await db.query('SELECT * FROM products')).rows.length,3);await assert.rejects(db.exec('SELECT * FROM product_members'),/permission denied/);await db.exec('RESET ROLE');
 await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[admin]);await assert.rejects(save(),/Admin access/);
 } finally {await db.close();}
});

test('main image route requires stale-edit protection and returns the replaced preview',async()=>{
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
 const bad=setup();assert.equal((await bad.media.POST(new Request('http://localhost/api/admin/products/media?productId=1&role=card',{method:'POST',body:png}))).status,400);assert.equal(bad.calls.length,0);
 const s=setup();const r=await s.media.POST(new Request('http://localhost/api/admin/products/media?productId=1&role=card&expectedMediaId=20&expectedUpdatedAt=2026-10-05T00:00:00Z',{method:'POST',body:png}));assert.equal(r.status,200);const row=s.calls.find(c=>c.rpc);assert.equal(row.rpc,'set_product_draft_card');assert.equal(row.args.p_expected_media_id,20);assert.equal(row.args.p_admin_id,admin);assert.equal((await r.json()).media.id,20);
});

test('paid publication rechecks Paddle and cannot publish on provider failure',async()=>{const s=setup({paid:true,providerFailure:true});const r=await s.route.PATCH(new Request('http://localhost/api/admin/products',{method:'PATCH',body:JSON.stringify({productId:1,expectedUpdatedAt:'2026-10-05T00:00:00Z'})}));assert.equal(r.status,409);assert.equal(s.calls.some(c=>c.rpc==='publish_product_draft'),false);assert.ok(!(await r.text()).includes('secret'));});
test('unfinished drafts save without pretending missing fields are publication ready',()=>{const d={...valid,subtitle:'',description:'',compatibility:'',current_version:'',price_eur:null,category_id:0,complexity_id:0};assert.equal(lib.validDraft(d),true);assert.equal(lib.validDraft({...d,product_type:'bundle',tool_ids:[]}),true);assert.deepEqual(Array.from(lib.draftValidationErrors(d)),[]);});
test('GIF files are accepted only with recognized headers, bounded dimensions and trailer',()=>{const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');assert.equal(mediaLib.imageFormat(gif),'gif');assert.equal(mediaLib.imageFormat(gif.subarray(0,gif.length-1)),null);const big=Buffer.from(gif);big.writeUInt16LE(65535,6);assert.equal(mediaLib.imageFormat(big),null);});

test('actual duplicate name opens its existing product; identity conflicts do not reserve names',async()=>{
 const same=setup({rpcError:'23505'}); const conflict=await same.post({requestId:other,data:valid});assert.equal(conflict.status,409);assert.equal((await conflict.json()).existingProduct.id,1);
 const counter=setup({rpcError:'23505',noExisting:true,primaryKey:true});const r=await counter.post({requestId:other,data:valid});assert.equal(r.status,503);assert.match((await r.json()).error,/ID counter/);
 const unknown=setup({rpcError:'23505',noExisting:true});assert.match((await (await unknown.post({requestId:other,data:valid})).json()).error,/No product name conflict/);
});
test('draft deletion authorizes, validates, protects stale and linked records, and hides diagnostics',async()=>{
 const body={productId:1,expectedUpdatedAt:'2026-10-05T00:00:00Z'};const request=data=>new Request('http://localhost/api/admin/products',{method:'DELETE',body:JSON.stringify(data)});
 const denied=setup({denied:true});assert.equal((await denied.route.DELETE(request(body))).status,403);assert.equal(denied.calls.length,0);
 const invalid=setup();assert.equal((await invalid.route.DELETE(request({...body,adminId:other}))).status,400);assert.equal(invalid.calls.length,0);
 for(const [code,status] of [[null,200],['40001',409],['22023',409],['23503',409],['XX000',503]]){const s=setup({rpcError:code});const r=await s.route.DELETE(request(body));assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(s.calls.find(c=>c.rpc).args.p_admin_id,admin);assert.ok(!(await r.text()).includes('secret'));}
});
