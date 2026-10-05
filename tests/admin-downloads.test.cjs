const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ZIP=fs.readFileSync('houdini/dist/qatools-houdini22-dev.zip');
function setup(o={}){
 const calls=[],modules=new Map();
 const db={from(table){calls.push({table});const q={select(columns){calls.push({columns});return q;},eq(key,value){calls.push({key,value});return q;},async maybeSingle(){return {error:o.queryError&&table!=='admin_users'?{message:'private details'}:o.membershipError&&table==='admin_users'?{}:null,data:table==='admin_users'?(o.nonAdmin?null:{user_id:'admin'}):table==='products'?(o.missingProduct?null:{id:1,product_type:'tool'}):(o.currentPath?{file_path:o.currentPath,file_name:'old.zip',enabled:true}:null)};}};return q;},async rpc(name,args){calls.push({rpc:name,args});return {data:o.rpcCode?{ok:false,code:o.rpcCode}:{ok:true},error:o.rpcError?{message:'private details'}:null};},storage:{async getBucket(id){calls.push({bucketCheck:id});return {data:{public:!!o.publicBucket},error:o.bucketError?{}:null};},from(bucket){return {async upload(path,bytes,options){calls.push({upload:path,size:bytes.length,...options});return {error:o.uploadError?{message:'private details'}:null};}};}}};
 function load(file){if(modules.has(file))return modules.get(file);const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:mod.exports,Buffer,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test'}},
 require(name){if(name==='server-only')return {};if(name==='node:crypto')return {randomUUID:()=> '00000000-0000-4000-8000-000000000001'};if(name==='next/server')return {NextResponse:{json:Response.json}};if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:db};if(name.startsWith('@/lib/'))return load('src/lib/'+name.slice(6)+'.ts');if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:o.invalidToken?null:{id:'verified-admin'}},error:o.invalidToken?{}:null})}})};throw Error(name);}});modules.set(file,mod.exports);return mod.exports;}
 return {calls,load,request(method='POST',body=ZIP,query='?productId=1&fileName=release.zip&expectedPath='){
 const request=new Request('http://localhost/api/admin/downloads'+query,{method,headers:{...(o.noToken?{}:{Authorization:'Bearer synthetic'}),'Content-Type':method==='POST'?'application/zip':'application/json'},...(method==='GET'?{}:{body:method==='PATCH'?JSON.stringify(body):body})});
 return load('src/app/api/admin/downloads/route.ts')[method](request);
 }};
}
for(const method of ['GET','PATCH','POST'])test(method+' independently rejects missing/invalid login and non-admins',async()=>{
 for(const [o,status] of [[{noToken:true},401],[{invalidToken:true},401],[{nonAdmin:true},403],[{membershipError:true},500]]){const s=setup(o),r=await s.request(method);assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.ok(s.calls.filter(c=>c.table).every(c=>c.table==='admin_users'));assert.ok(!s.calls.some(c=>c.upload||c.rpc||c.bucketCheck));}
});
test('directory validation accepts actual package and rejects unsafe/private/broken archives',()=>{
 const valid=setup().load('src/lib/adminDownloadUpload.ts').validToolZip;assert.equal(valid(ZIP),true);assert.equal(valid(Buffer.from('not a zip')),false);assert.equal(valid(ZIP.subarray(0,ZIP.length-1)),false);
 const original=Buffer.from('qatools.json');for(const name of ['../oops.json','C:/oops.json']){const modified=Buffer.from(ZIP);let cursor=0;while((cursor=modified.indexOf(original,cursor))!==-1){modified.write(name,cursor,'utf8');cursor+=original.length;}assert.equal(valid(modified),false);}
 const privateZip=Buffer.from(ZIP);let i=0;while((i=privateZip.indexOf(original,i))!==-1){privateZip.write('.env.secret!',i,'utf8');i+=original.length;}assert.equal(valid(privateZip),false);
});
test('stream size is enforced without trusting content length',async()=>{
 const s=setup();const bytes=Buffer.alloc(25*1024*1024+1);const r=await s.request('POST',bytes);assert.equal(r.status,413);assert.ok(!s.calls.some(c=>c.upload||c.rpc));
});
test('invalid request, missing product, stale mapping and public bucket never upload',async()=>{
 for(const [o,query,body,status] of [[{},'?productId=0&fileName=a.zip&expectedPath=',ZIP,400],[{},'?productId=1&fileName=../a.zip&expectedPath=',ZIP,400],[{},'?productId=1&fileName=a.zip',ZIP,400],[{},undefined,Buffer.from('bad'),400],[{missingProduct:true},undefined,ZIP,404],[{currentPath:'new.zip'},undefined,ZIP,409],[{publicBucket:true},undefined,ZIP,503],[{bucketError:true},undefined,ZIP,503]]){const s=setup(o),r=await s.request('POST',body,query);assert.equal(r.status,status);assert.ok(!s.calls.some(c=>c.upload||c.rpc));}
});
test('upload uses new path/no overwrite and verified admin, ignoring user IDs',async()=>{
 const s=setup(),r=await s.request('POST',ZIP,'?productId=1&fileName=release.zip&expectedPath=&adminId=victim');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const upload=s.calls.find(c=>c.upload),rpc=s.calls.find(c=>c.rpc);assert.equal(upload.upsert,false);assert.equal(upload.upload,'1/00000000-0000-4000-8000-000000000001/release.zip');assert.equal(upload.size,ZIP.length);assert.equal(rpc.args.p_admin_id,'verified-admin');assert.equal(rpc.args.p_expected_path,null);assert.equal(rpc.args.p_enabled,true);
});
test('toggle is explicit and upload failures never change mapping or disclose diagnostics',async()=>{
 const s=setup({currentPath:'old.zip'}),r=await s.request('PATCH',{productId:1,expectedPath:'old.zip',enabled:false,adminId:'victim'});assert.equal(r.status,200);assert.equal(s.calls.find(c=>c.rpc).args.p_file_path,null);assert.equal(s.calls.find(c=>c.rpc).args.p_enabled,false);assert.ok(!s.calls.some(c=>c.upload));
 for(const [o,status] of [[{uploadError:true},503],[{rpcError:true},503],[{rpcCode:'download_changed'},409],[{rpcCode:'not_admin'},403]]){const t=setup(o),response=await t.request();assert.equal(response.status,status);assert.ok(!(await response.text()).includes('private details'));if(o.uploadError)assert.ok(!t.calls.some(c=>c.rpc));}
});
test('GET returns only selected download metadata and rejects malformed product IDs',async()=>{
 const s=setup({currentPath:'old.zip'});assert.equal((await (await s.request('GET',null,'?productId=1')).json()).download.file_path,'old.zip');assert.ok(s.calls.some(c=>c.key==='product_id'&&c.value===1));
 for(const query of ['?productId=1.5','?productId=0','?productId=9007199254740992']){const t=setup();assert.equal((await t.request('GET',null,query)).status,400);assert.ok(!t.calls.some(c=>c.table==='product_downloads'));}
});
test('SQL writer checks admin/current file/private object and never grants browser writes',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite(),admin='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',path='1/00000000-0000-4000-8000-000000000001/release.zip';
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA storage;
 CREATE TABLE public.products(id bigint PRIMARY KEY);INSERT INTO public.products VALUES(1);CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);INSERT INTO public.admin_users VALUES('${admin}');
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);CREATE TABLE storage.objects(bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261003060000_secure_product_downloads.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261003070000_admin_product_downloads.sql','utf8'));
 for(const role of ['anon','authenticated','service_role']){const p=(await db.query("SELECT has_function_privilege($1,'public.set_product_download(uuid,bigint,text,text,text,boolean)','EXECUTE') AS execute,has_table_privilege($1,'public.product_downloads','INSERT,UPDATE,DELETE') AS write",[role])).rows[0];assert.equal(p.execute,role==='service_role');assert.equal(p.write,false);}
 async function save(expected=null,next=path,enabled=true,actor=admin,id=1,name='release.zip'){await db.exec('SET ROLE service_role');try{return (await db.query('SELECT public.set_product_download($1,$2,$3,$4,$5,$6) AS result',[actor,id,expected,next,name,enabled])).rows[0].result;}finally{await db.exec('RESET ROLE');}}
 assert.equal((await save(null,path,true,other)).code,'not_admin');assert.equal((await save(null,path,true,admin,999)).code,'missing_product');assert.equal((await save()).code,'missing_file');
 await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[path]);assert.equal((await save()).ok,true);
 assert.equal((await save()).code,'download_changed');assert.equal((await save(path,null,false)).ok,true);assert.equal((await db.query('SELECT enabled FROM public.product_downloads')).rows[0].enabled,false);
 await db.exec("UPDATE storage.buckets SET public=true WHERE id='qatools-downloads'");assert.equal((await save(path,null,true)).code,'missing_file');assert.equal((await save(path,null,false)).ok,true);await db.exec("UPDATE storage.buckets SET public=false WHERE id='qatools-downloads'");
 assert.equal((await save(path,'2/00000000-0000-4000-8000-000000000001/release.zip')).code,'invalid_request');
 const replacement='1/00000000-0000-4000-8000-000000000003/next.zip';await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[replacement]);assert.equal((await save(path,replacement,true,admin,1,'next.zip')).ok,true);assert.equal((await save(path,null,false)).code,'download_changed');assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,2);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT public.set_product_download($1,1,null,null,null,true)',[admin]),/permission denied/);
 }finally{await db.close();}
});
