const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const stamp='2026-10-08T09:00:00.000Z',png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(10,16);png.writeUInt32BE(10,20);
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,URL,Request,Response,Set,Number,Date,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
function setup(options={}){
 const calls=[];const db={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:options.missing?null:{id:1,updated_at:options.stale?'2000-01-01':stamp},error:options.database?{}:null};}};},storage:{async getBucket(){return {data:{public:!options.private},error:null};},from(){return {async upload(path,bytes,opts){calls.push({upload:path,bytes,opts});return {error:options.upload?{}:null};},async remove(){calls.push({removed:true});return {error:null};}};}},async rpc(name,args){calls.push({name,args});return {data:options.conflict?null:{id:1,updated_at:stamp,media:[]},error:options.conflict?{message:'secret SQL diagnostic'}:null};}};
 const media=load('src/lib/productMedia.ts',{'server-only':{}});
 const route=load('src/app/api/admin/products/gallery/route.ts',{'@/lib/requireAdmin':{requireAdmin:async()=>options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:'trusted-admin'}}},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/productMedia':media,'@/lib/activationHttp':{privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}}),readActivationBody:async(request,max)=>{const bytes=await request.arrayBuffer();if(bytes.byteLength>max)return null;try{return JSON.parse(Buffer.from(bytes));}catch{return null;}}}});
 return {calls,route};
}
const upload=(overrides='',bytes=png)=>new Request('http://localhost/api/admin/products/gallery?productId=1&expectedUpdatedAt='+stamp+overrides,{method:'POST',body:bytes});
const edit=(method,body)=>new Request('http://localhost/api/admin/products/gallery',{method,body:JSON.stringify(body)});
test('gallery methods independently authorize before uploads or mutations',async()=>{
 for(const method of ['POST','PATCH','DELETE']){const s=setup({denied:true}),response=await s.route[method](method==='POST'?upload():edit(method,{}));assert.equal(response.status,403);assert.equal(s.calls.length,0);assert.equal(response.headers.get('Cache-Control'),'no-store');}
});
test('gallery add/replace validates images and binds only verified admin/product IDs',async()=>{
 for(const suffix of ['', '&mediaId=9']){const s=setup(),response=await s.route.POST(upload(suffix));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const call=s.calls.find(c=>c.name);assert.equal(call.name,'manage_product_gallery');assert.equal(call.args.p_admin_id,'trusted-admin');assert.equal(call.args.p_product_id,1);assert.equal(call.args.p_action,suffix?'replace':'add');assert.match(call.args.p_path,/^drafts\/1\/[a-f0-9-]{36}\.png$/);assert.equal(s.calls[0].opts.upsert,false);}
 for(const [option,status] of [['database',503],['missing',409],['stale',409],['private',503],['upload',503],['conflict',409]]){const s=setup({[option]:true}),response=await s.route.POST(upload());assert.equal(response.status,status,option);assert.ok(!JSON.stringify(await response.json()).includes('secret'));assert.ok(!s.calls.some(c=>c.removed));}
 for(const bytes of [Buffer.from('<svg></svg>'),Buffer.alloc(4*1024*1024+1)]){const s=setup();assert.equal((await s.route.POST(upload('',bytes))).status,bytes.length>4*1024*1024?413:400);assert.equal(s.calls.length,0);}
 const s=setup();assert.equal((await s.route.POST(upload('&mediaId=bad'))).status,400);assert.equal(s.calls.length,0);
});
test('gallery removal/order reject arbitrary fields, duplicate IDs and oversized bodies',async()=>{
 for(const [method,extra] of [['DELETE',{mediaId:3}],['PATCH',{mediaIds:[3,2]}]]){
  const valid={productId:1,expectedUpdatedAt:stamp,...extra},s=setup();assert.equal((await s.route[method](edit(method,valid))).status,200);assert.equal(s.calls[0].args.p_admin_id,'trusted-admin');
  for(const body of [{...valid,userId:'forged'},{...valid,productId:0},{...valid,expectedUpdatedAt:'bad'},method==='PATCH'?{...valid,mediaIds:[3,3]}:{...valid,mediaId:-1},{...valid,expectedUpdatedAt:'x'.repeat(3000)}]){const bad=setup();assert.equal((await bad.route[method](edit(method,body))).status,400);assert.equal(bad.calls.length,0);}
  const conflict=setup({conflict:true});assert.equal((await conflict.route[method](edit(method,valid))).status,409);
 }
});
test('actual PostgreSQL gallery mutations protect versions, main image and published commerce',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();try{
  const remote=fs.readFileSync('supabase/migrations/20261002172027_remote_schema.sql','utf8'),table=n=>{const at=remote.indexOf('CREATE TABLE "public"."'+n+'"');return remote.slice(at,remote.indexOf(';',at)+1);};
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);CREATE TABLE admin_users(user_id uuid PRIMARY KEY);CREATE TABLE storage.buckets(id text,public boolean);CREATE TABLE storage.objects(bucket_id text,name text);INSERT INTO storage.buckets VALUES('product-media',true)");
  await db.exec(table('products')+table('product_media'));
  await db.exec(fs.readFileSync('supabase/migrations/20261008090000_product_gallery_management.sql','utf8'));
  const admin='00000000-0000-4000-8000-000000000001',buyer='00000000-0000-4000-8000-000000000002';await db.query('INSERT INTO auth.users VALUES($1,now(),null),($2,now(),null)',[admin,buyer]);await db.query('INSERT INTO admin_users VALUES($1)',[admin]);
  await db.exec("INSERT INTO products(id,name,slug,price_eur,current_version,published,category_id,complexity_id) VALUES(1,'one','one',5,'1',false,1,1),(2,'two','two',8,'2',true,1,1);INSERT INTO product_media(product_id,media_type,file_path,role,sort_order) VALUES(1,'image','card.png','card',0),(2,'image','card2.png','card',0)");
  const path=(id,n)=>'drafts/'+id+'/00000000-0000-4000-8000-'+String(n).padStart(12,'0')+'.png';
  let stamp=(await db.query('SELECT updated_at::text AS updated_at FROM products WHERE id=1')).rows[0].updated_at;
  async function run(action,id=null,file=null,ids=null,who=admin,product=1,version=stamp){return (await db.query('SELECT manage_product_gallery($1,$2,$3,$4,$5,$6,$7) r',[who,product,version,action,id,file,ids])).rows[0].r;}
  await assert.rejects(run('add',null,path(1,1),null,buyer),/Admin access/);await assert.rejects(run('remove',1),/Gallery image not found/);await assert.rejects(run('add',null,path(1,1)),/Invalid gallery image/);
  await db.query("INSERT INTO storage.objects VALUES('product-media',$1),('product-media',$2),('product-media',$3),('product-media',$4)",[path(1,1),path(1,2),path(1,3),path(2,4)]);
  const first=await run('add',null,path(1,1));const stale=stamp;stamp=first.updated_at;const second=await run('add',null,path(1,2));stamp=second.updated_at;
  const ids=second.media.filter(m=>m.role==='gallery').map(m=>m.id);await assert.rejects(run('remove',ids[0],null,null,admin,1,stale),/Product changed/);
  for(const selection of [[ids[0],ids[0]],[ids[0]],[1,...ids],[...ids,999]])await assert.rejects(run('reorder',null,null,selection),/Gallery selection changed/);
  const reordered=await run('reorder',null,null,[...ids].reverse());stamp=reordered.updated_at;assert.deepEqual(reordered.media.filter(m=>m.role==='gallery').map(m=>m.id),[...ids].reverse());
  const replaced=await run('replace',ids[0],path(1,3));stamp=replaced.updated_at;assert.equal(replaced.media.find(m=>m.id===ids[0]).file_path,path(1,3));
  await assert.rejects(run('replace',ids[0],path(2,4)),/Invalid gallery image/);
  const removed=await run('remove',ids[1]);stamp=removed.updated_at;assert.equal(removed.media.filter(m=>m.role==='gallery')[0].sort_order,1);assert.equal(removed.media.find(m=>m.role==='card').file_path,'card.png');assert.equal((await db.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n,4);
  const before=(await db.query('SELECT name,slug,price_eur,published,current_version FROM products WHERE id=2')).rows[0];let publishedStamp=(await db.query('SELECT updated_at::text AS updated_at FROM products WHERE id=2')).rows[0].updated_at;
  const published=await run('add',null,path(2,4),null,admin,2,publishedStamp);publishedStamp=published.updated_at;const child=published.media.find(m=>m.role==='gallery').id;
  await assert.rejects(run('remove',child),/Gallery image not found/);await run('remove',child,null,null,admin,2,publishedStamp);
  assert.deepEqual((await db.query('SELECT name,slug,price_eur,published,current_version FROM products WHERE id=2')).rows[0],before);
  // The legacy pending-file draft upload counts rows, not gaps in ordering.
  await db.exec("UPDATE product_media SET sort_order=100 WHERE product_id=1 AND role='card'");
  const legacy=(await db.query('SELECT attach_product_draft_image($1,1,$2) r',[admin,path(1,2)])).rows[0].r;stamp=legacy.updated_at;
  await assert.rejects(db.query('SELECT attach_product_draft_image($1,2,$2)',[admin,path(2,4)]),/Unpublished draft required/);
  // A full gallery permits replacement/removal but blocks another append.
  await db.exec("INSERT INTO product_media(product_id,media_type,file_path,role,sort_order) SELECT 1,'image','extra.png','gallery',x FROM generate_series(3,19) x");
  await assert.rejects(run('add',null,path(1,1)),/Media limit/);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'manage_product_gallery(uuid,bigint,timestamptz,text,bigint,text,bigint[])','EXECUTE') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});
test('gallery editor shows saved ordering, excludes main artwork and exposes accessible controls',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/AdminGallery.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,Set,URLSearchParams,require(n){if(n==='next/image')return {__esModule:true,default:props=>React.createElement('img',{src:props.src,alt:props.alt})};if(n==='@/lib/supabase')return {supabase:{storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:'https://media.test/'+path}})})}}};return require(n);}});
 const props={productId:1,updatedAt:stamp,media:[{id:1,file_path:'card.png',role:'card',sort_order:0},{id:2,file_path:'second.png',role:'gallery',sort_order:2},{id:3,file_path:'first.png',role:'detail',sort_order:1}],disabled:false,allowAdd:true,onUpdated(){},onBusyChange(){},onReload(){}};
 const html=renderToStaticMarkup(React.createElement(exports.default,props));assert.ok(html.indexOf('first.png')<html.indexOf('second.png'));assert.ok(!html.includes('card.png'));assert.match(html,/Replace gallery image 1/);assert.match(html,/Move gallery image 1 earlier/);assert.match(html,/Image changes apply when you click Update product/);assert.equal((html.match(/>Remove</g)||[]).length,2);
 const locked=renderToStaticMarkup(React.createElement(exports.default,{...props,disabled:true,allowAdd:false}));assert.match(locked,/<fieldset disabled=""/);assert.ok(!locked.includes('Add gallery image'));assert.match(locked,/Image changes apply when you click Update product/);
});
