const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function setup(o={}) {
 const calls=[],modules=new Map();
 const db={from(table){calls.push({table});const q={select(columns){calls.push({columns});return q;},eq(key,value){calls.push({key,value});return q;},async maybeSingle(){return table==='entitlements'?{data:o.unowned?null:{id:1},error:o.ownershipError?{message:'private diagnostic'}:null}:{data:o.missingFile?null:{file_path:'qanoise01/release.zip',file_name:'qanoise01.zip'},error:o.fileError?{}:null};}};return q;},storage:{async getBucket(id){calls.push({bucketCheck:id});return {data:o.missingBucket?null:{public:o.publicBucket?true:false},error:o.bucketError?{}:null};},from(bucket){calls.push({bucket});return {async createSignedUrl(path,seconds,options){calls.push({path,seconds,options});return {data:o.missingUrl?null:{signedUrl:'https://example.invalid/signed-file'},error:o.storageError?{message:'private diagnostic'}:null};}};}}};
 function load(file){if(modules.has(file))return modules.get(file);const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:mod.exports,Buffer,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test'}},
 require(name){if(name==='server-only')return {};if(name==='next/server')return {NextResponse:{json:Response.json}};
 if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:db};if(name==='@/lib/requireAccount')return load('src/lib/requireAccount.ts');if(name==='@/lib/activationHttp')return load('src/lib/activationHttp.ts');
 if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:o.invalidToken?null:{id:'verified-user',email_confirmed_at:o.unconfirmed?null:'2026-10-03'}},error:o.invalidToken?{}:null})}})};throw Error(name);}
 });modules.set(file,mod.exports);return mod.exports;}
 return {calls,post(body={productId:1}){return load('src/app/api/account/download/route.ts').POST(new Request('http://localhost/api/account/download',{method:'POST',headers:o.noToken?{}:{Authorization:'Bearer synthetic'},body:typeof body==='string'?body:JSON.stringify(body)}));}};
}
for(const [option,status] of [['noToken',401],['invalidToken',401],['unconfirmed',403]])test('download blocks '+option+' before data access',async()=>{const s=setup({[option]:true}),r=await s.post();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(s.calls.length,0);});
test('download rejects invalid IDs and oversized bodies',async()=>{for(const body of [{},[],{productId:0},{productId:'1'},{productId:1.5},{productId:9007199254740992},' '.repeat(1025),'{']){const s=setup();assert.equal((await s.post(body)).status,400);assert.equal(s.calls.length,0);}});
test('inactive or absent ownership cannot access file mappings or storage',async()=>{const s=setup({unowned:true}),r=await s.post();assert.equal(r.status,403);assert.ok(s.calls.some(c=>c.key==='status'&&c.value==='active'));assert.ok(!s.calls.some(c=>c.table==='product_downloads'||c.bucketCheck||c.bucket));});
test('download signs only the trusted mapping for the verified owner',async()=>{
 const s=setup(),r=await s.post({productId:1,userId:'victim',file_path:'private-secret',bucket:'other'});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).url,'https://example.invalid/signed-file');
 assert.ok(s.calls.some(c=>c.key==='user_id'&&c.value==='verified-user'));assert.ok(s.calls.some(c=>c.key==='product_id'&&c.value===1));assert.ok(s.calls.some(c=>c.key==='enabled'&&c.value===true));
 const sign=s.calls.find(c=>c.path);assert.equal(sign.path,'qanoise01/release.zip');assert.equal(sign.seconds,120);assert.equal(sign.options.download,'qanoise01.zip');assert.equal(s.calls.find(c=>c.bucket).bucket,'qatools-downloads');
});
test('missing releases are explicit; storage/query failures never expose diagnostics or a URL',async()=>{for(const [o,status] of [[{missingFile:true},404],[{ownershipError:true},503],[{fileError:true},503],[{bucketError:true},503],[{publicBucket:true},503],[{missingBucket:true},503],[{storageError:true},503],[{missingUrl:true},503]]){const s=setup(o),r=await s.post();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const body=await r.text();assert.ok(!body.includes('private diagnostic')&&!body.includes('signed-file'));if(o.publicBucket||o.missingBucket||o.bucketError)assert.ok(!s.calls.some(c=>c.path));}});
test('migration isolates files despite broad existing storage policies',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA storage;
 CREATE TABLE public.products(id bigint PRIMARY KEY);INSERT INTO public.products VALUES(1);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
 CREATE TABLE storage.objects(id bigint PRIMARY KEY,bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
 CREATE POLICY broad_existing ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
 INSERT INTO storage.objects VALUES(1,'qatools-downloads','secret.zip'),(2,'product-media','image.png');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261003060000_secure_product_downloads.sql','utf8'));
 assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='qatools-downloads'")).rows[0].public,false);
 for(const role of ['anon','authenticated','service_role']){
 const p=(await db.query("SELECT has_table_privilege($1,'public.product_downloads','SELECT') AS read,has_table_privilege($1,'public.product_downloads','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS write",[role])).rows[0];assert.equal(p.read,role==='service_role');assert.equal(p.write,false);
 }
 for(const role of ['anon','authenticated']){
 await db.exec('SET ROLE '+role);assert.deepEqual((await db.query('SELECT name FROM storage.objects')).rows.map(r=>r.name),['image.png']);
 await assert.rejects(db.exec("INSERT INTO storage.objects VALUES(3,'qatools-downloads','forged.zip')"),/row-level security/);
 assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='qatools-downloads' RETURNING id")).rows.length,0);await db.exec('RESET ROLE');
 }
 for(const filePath of ['../secret','item/../secret','/root.zip','item//file.zip','https://example.invalid/file','item/'])await assert.rejects(db.query('INSERT INTO public.product_downloads(product_id,file_path,file_name) VALUES(1,$1,$2)',[filePath,'release.zip']),/check constraint/);
 await db.exec("INSERT INTO public.product_downloads(product_id,file_path,file_name) VALUES(1,'item/1.0/release.zip','release.zip'); SET ROLE service_role;");assert.equal((await db.query('SELECT enabled FROM public.product_downloads')).rows[0].enabled,false);assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,2);
 }finally{await db.close();}
});
