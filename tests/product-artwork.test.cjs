const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const stamp='2026-10-08T10:00:00.000Z',png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(10,16);png.writeUInt32BE(10,20);
function load(file,mocks,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,Buffer,URL,URLSearchParams,Request,Response,Set,Map,Number,Date,...globals,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
function setup(options={}){
 const calls=[];const db={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id:1,updated_at:options.stale?'2000-01-01':stamp},error:options.database?{}:null};}};},storage:{async getBucket(){return {data:{public:!options.private},error:null};},from(){return {async upload(path,bytes,opts){calls.push({upload:path,opts});return {error:options.upload?{}:null};}};}},async rpc(name,args){calls.push({name,args});return {data:options.conflict?null:{id:1,updated_at:stamp,media:[]},error:options.conflict?{message:'secret'}:null};}};
 const media=load('src/lib/productMedia.ts',{'server-only':{}});
 const route=load('src/app/api/admin/products/artwork/route.ts',{'@/lib/requireAdmin':{requireAdmin:async()=>options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:'trusted-admin'}}},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/productMedia':media,'@/lib/activationHttp':{privateJson:(body,status=200)=>Response.json(body,{status}),readActivationBody:async(req,max)=>{const b=await req.arrayBuffer();if(b.byteLength>max)return null;try{return JSON.parse(Buffer.from(b));}catch{return null;}}}});
 return {calls,route};
}
const upload=(bytes=png)=>new Request('http://localhost/api/admin/products/artwork?productId=1&expectedUpdatedAt='+stamp,{method:'POST',body:bytes});
const save=(body)=>new Request('http://localhost/api/admin/products/artwork',{method:'PUT',body:JSON.stringify(body)});
const body={productId:1,expectedUpdatedAt:stamp,media:[{id:1,role:'card',path:'card.png'}]};
test('artwork stages uploads without binding and requires authorization on both methods',async()=>{
 for(const method of ['POST','PUT']){const s=setup({denied:true});assert.equal((await s.route[method](method==='POST'?upload():save(body))).status,403);assert.equal(s.calls.length,0);}
 const s=setup(),response=await s.route.POST(upload());assert.equal(response.status,200);assert.match((await response.json()).path,/^drafts\/1\/[a-f0-9-]{36}\.png$/);assert.equal(s.calls.length,1);assert.equal(s.calls[0].opts.upsert,false);
 for(const [option,status] of [['stale',409],['database',503],['private',503],['upload',503]]){const s=setup({[option]:true});assert.equal((await s.route.POST(upload())).status,status);assert.ok(!s.calls.some(c=>c.name));}
 for(const bytes of [Buffer.from('bad'),Buffer.alloc(4*1024*1024+1)])assert.equal((await setup().route.POST(upload(bytes))).status,bytes.length>4*1024*1024?413:400);
});
test('artwork commit validates payload and passes trusted admin and exact version',async()=>{
 const s=setup();assert.equal((await s.route.PUT(save(body))).status,200);assert.equal(s.calls[0].name,'save_product_artwork');assert.equal(s.calls[0].args.p_admin_id,'trusted-admin');assert.equal(s.calls[0].args.p_expected_updated_at,stamp);
 for(const invalid of [{...body,productId:0},{...body,media:Array(21).fill(body.media[0])},{...body,media:[{...body.media[0],id:-1}]},{...body,media:[{...body.media[0],role:'video'}]},{...body,media:[{...body.media[0],extra:true}]}]){const s=setup();assert.equal((await s.route.PUT(save(invalid))).status,400);assert.equal(s.calls.length,0);}
 const c=setup({conflict:true}),response=await c.route.PUT(save(body));assert.equal(response.status,409);assert.ok(!JSON.stringify(await response.json()).includes('secret'));
});
test('gallery editing stages locally; only explicit save uploads then commits once',async()=>{
 const React=require('react'),calls=[],changes=[];
 const component=load('src/components/AdminGallery.tsx',{'react':{...React,useState:()=>[null,()=>{}],useRef:()=>({current:[]}),useEffect:()=>{}},'next/image':{__esModule:true,default:()=>null},'@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'token'}},error:null})},storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:path}})})}}}},{fetch:async(url,options)=>{calls.push({url,options});return Response.json(options.method==='POST'?{path:'drafts/1/new.png'}:{gallery:{id:1,updated_at:stamp,media:[]}});}});
 const media=[{id:1,file_path:'card.png',role:'card',sort_order:0},{id:2,file_path:'a.png',role:'gallery',sort_order:1},{id:3,file_path:'b.png',role:'gallery',sort_order:2}];
 const tree=component.default({media,disabled:false,onChange:m=>changes.push(m)}),nodes=[];
 function walk(node){if(!node)return;if(Array.isArray(node))return node.forEach(walk);if(typeof node==='object'){nodes.push(node);walk(node.props?.children);}}walk(tree);
 nodes.find(n=>n.props?.['aria-label']==='Move gallery image 1 later').props.onClick();assert.equal(changes[0].find(m=>m.id===2).sort_order,2);
 nodes.find(n=>n.type==='button' && n.props.children==='Remove').props.onClick();assert.equal(changes[1].length,2);assert.equal(media.length,3);assert.equal(calls.length,0);
 await component.saveArtwork(1,stamp,[{...media[0],file:new Blob([png])},media[1]]);assert.equal(calls.length,2);assert.equal(calls[0].options.method,'POST');assert.equal(calls[1].options.method,'PUT');assert.equal(JSON.parse(calls[1].options.body).media[0].path,'drafts/1/new.png');
 const source=fs.readFileSync('src/components/AdminProducts.tsx','utf8');assert.ok(!source.includes('Upload selected media'));assert.ok(source.includes('Update product'));assert.ok(!source.includes('uploadImage('));
});
test('actual PostgreSQL artwork transaction preserves published commerce and rolls back all invalid changes',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();try{
 const remote=fs.readFileSync('supabase/migrations/20261002172027_remote_schema.sql','utf8'),table=n=>{const at=remote.indexOf('CREATE TABLE "public"."'+n+'"');return remote.slice(at,remote.indexOf(';',at)+1);};
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);CREATE TABLE admin_users(user_id uuid PRIMARY KEY);CREATE TABLE storage.buckets(id text,public boolean);CREATE TABLE storage.objects(bucket_id text,name text);INSERT INTO storage.buckets VALUES('product-media',true)");await db.exec(table('products')+table('product_media'));
 await db.exec(fs.readFileSync('supabase/migrations/20261008100000_explicit_product_artwork_update.sql','utf8'));
 const admin='00000000-0000-4000-8000-000000000001',buyer='00000000-0000-4000-8000-000000000002';await db.query('INSERT INTO auth.users VALUES($1,now(),null),($2,now(),null)',[admin,buyer]);await db.query('INSERT INTO admin_users VALUES($1)',[admin]);
 await db.exec("INSERT INTO products(id,name,slug,price_eur,current_version,published,category_id,complexity_id) VALUES(1,'one','one',5,'1',true,1,1),(2,'two','two',8,'2',false,1,1);INSERT INTO product_media(product_id,media_type,file_path,role,sort_order) VALUES(1,'image','card.png','card',0),(1,'image','a.png','gallery',1),(1,'image','b.png','detail',2),(2,'image','other.png','card',0)");
 const path='drafts/1/00000000-0000-4000-8000-000000000005.png';await db.query("INSERT INTO storage.objects VALUES('product-media',$1)",[path]);
 const original=(await db.query('SELECT * FROM products WHERE id=1')).rows[0];let version=(await db.query('SELECT updated_at::text t FROM products WHERE id=1')).rows[0].t;
 const rows=(await db.query('SELECT id,role,file_path AS path FROM product_media WHERE product_id=1 ORDER BY sort_order')).rows;
 const apply=(media,who=admin,v=version)=>db.query('SELECT save_product_artwork($1,1,$2,$3) r',[who,v,JSON.stringify(media)]);
 await assert.rejects(apply(rows,buyer),/Admin access/);
 for(const media of [[{...rows[0],path}, {...rows[1],path:'wrong'}],[{...rows[0],path},rows[0]],[rows[1]], [{...rows[0],id:4}], [{...rows[0],role:'gallery'}], Array(21).fill(rows[0])]){
  await assert.rejects(apply(media));assert.deepEqual((await db.query('SELECT id,role,file_path AS path FROM product_media WHERE product_id=1 ORDER BY sort_order')).rows,rows);assert.equal((await db.query('SELECT updated_at::text t FROM products WHERE id=1')).rows[0].t,version);
 }
 const saved=(await apply([{...rows[0],path},rows[2],{id:null,role:'gallery',path}])).rows[0].r;const stale=version;version=saved.updated_at;
 assert.equal(saved.media[0].file_path,path);assert.equal(saved.media[1].id,3);assert.equal(saved.media.length,3);await assert.rejects(apply(rows,admin,stale),/Product changed/);
 const after=(await db.query('SELECT * FROM products WHERE id=1')).rows[0];after.updated_at=original.updated_at;assert.deepEqual(after,original);
 assert.equal((await db.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n,1);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'save_product_artwork(uuid,bigint,timestamptz,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});
