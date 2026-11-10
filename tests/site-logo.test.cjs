const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), sharp = require('sharp');
const oldPath = 'branding/logos/33333333-3333-4333-8333-333333333333.png';
const revision = '11111111-1111-4111-8111-111111111111';
function load(file, mocks) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, {exports,Buffer,Request,Response,URL,Uint8Array,require:n=>n in mocks?mocks[n]:require(n)});
 return exports;
}
function setup(options={}) {
 const calls=[];
 const db={from(table){let mutation;return {
  select(){return this;},eq(field,value){calls.push(['filter',field,value]);return this;},
  update(value){mutation=value;calls.push(['update',value]);return this;},
  async single(){return {data:{logo_path:options.oldPath ?? null,revision:options.stale?'22222222-2222-4222-8222-222222222222':revision},error:options.database?{message:'private detail'}:null};},
  async maybeSingle(){return {data:options.conflict?null:mutation,error:options.saveError?{message:'private detail'}:null};}
 };},storage:{async getBucket(){return {data:{public:!options.privateBucket},error:null};},from(){return {async upload(path,bytes,config){calls.push(['upload',path,bytes,config]);return {error:options.uploadError?{}:null};},async remove(paths){calls.push(['remove', paths]);return {error:options.removeError?{}:null};}};}}};
 const route=load('src/app/api/admin/site-logo/route.ts',{
  '@/lib/requireAdmin':{requireAdmin:async()=>options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:'admin'}}},
  '@/lib/supabaseAdmin':{supabaseAdmin:db},
  '@/lib/productMedia':load('src/lib/productMedia.ts',{'server-only':{}}),
  '@/lib/activationHttp':{privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})}
 });return {route,calls};
}
const upload=bytes=>new Request('https://test/api/admin/site-logo?revision='+revision,{method:'POST',body:bytes});
test('logo reads and uploads require authorization before database or storage access',async()=>{
 for(const method of ['GET','POST']){const s=setup({denied:true});const res=await s.route[method](method==='POST'?upload('bad'):new Request('https://test'));assert.equal(res.status,403);assert.equal(s.calls.length,0);}
 assert.equal(setup().route.DELETE,undefined);
});
test('valid raster is decoded, resized, re-encoded and stored immutably before version checked update',async()=>{
 const png=await sharp({create:{width:1200,height:300,channels:4,background:{r:255,g:255,b:255,alpha:0.5}}}).png().toBuffer();
 const s=setup(),res=await s.route.POST(upload(png));assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
 const saved=s.calls.find(c=>c[0]==='upload');assert.match(saved[1],/^branding\/logos\/[a-f0-9-]{36}\.png$/);assert.equal(saved[3].upsert,false);
 const metadata=await sharp(saved[2]).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,1024);assert.equal(metadata.height,256);assert.equal(metadata.hasAlpha,true);
 assert.ok(s.calls.some(c=>c[0]==='filter' && c[1]==='revision' && c[2]===revision));assert.ok(s.calls.find(c=>c[0]==='update')[1].logo_path);
 const webp=await sharp(png).webp().toBuffer();assert.equal((await setup().route.POST(upload(webp))).status,200);
});
test('invalid, oversized, corrupt and oversized dimensions never change the pointer',async()=>{
 const header=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.write('IHDR',12);header.writeUInt32BE(10,16);header.writeUInt32BE(10,20);
 const oversized=await sharp({create:{width:4097,height:1,channels:4,background:'white'}}).png().toBuffer();
 for(const [bytes,status] of [[Buffer.from('<svg><script/></svg>'),400],[header,400],[Buffer.alloc(2*1024*1024+1),413],[oversized,400]]){
  const s=setup();assert.equal((await s.route.POST(upload(bytes))).status,status);assert.ok(!s.calls.some(c=>c[0]==='upload' || c[0]==='update'));
 }
});
test('stale revisions and storage failures preserve current logo and redact internals',async()=>{
 const png=await sharp({create:{width:10,height:10,channels:4,background:'white'}}).png().toBuffer();
 for(const [option,status] of [['stale',409],['database',503],['privateBucket',503],['uploadError',503],['conflict',409],['saveError',503]]){
  const s=setup({[option]:true});const res=await s.route.POST(upload(png));assert.equal(res.status,status);assert.ok(!JSON.stringify(await res.json()).includes('private detail'));
  if(['stale','database','privateBucket','uploadError'].includes(option))assert.ok(!s.calls.some(c=>c[0]==='update'));
 }
});
test('logo cleanup removes only a known unused branding file',async()=>{
 const png=await sharp({create:{width:10,height:10,channels:4,background:'white'}}).png().toBuffer();
 const saved=setup({oldPath});
 assert.equal((await saved.route.POST(upload(png))).status,200);
 assert.deepEqual(saved.calls.filter(c=>['upload','update','remove'].includes(c[0])).map(c=>c[0]),['upload','update','remove']);
 assert.equal(saved.calls.find(c=>c[0]==='remove')[1][0],oldPath);

 const conflict=setup({oldPath,conflict:true});
 assert.equal((await conflict.route.POST(upload(png))).status,409);
 assert.equal(conflict.calls.find(c=>c[0]==='remove')[1][0],conflict.calls.find(c=>c[0]==='upload')[1]);

 for(const options of [{oldPath,saveError:true},{oldPath,stale:true},{oldPath:'other/product.png'}]){
  const s=setup(options);await s.route.POST(upload(png));assert.ok(!s.calls.some(c=>c[0]==='remove'));
 }
 assert.equal((await setup({oldPath,removeError:true}).route.POST(upload(png))).status,200);
});
test('branding migration grants public read only and uses singleton/version constraints',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261008110000_site_logo.sql','utf8');
 assert.match(sql,/enable row level security/i);assert.match(sql,/revoke all .* from anon, authenticated, service_role/i);assert.match(sql,/grant select .* to anon, authenticated/i);assert.match(sql,/grant select, update .* to service_role/i);assert.match(sql,/check \(id = 1\)/i);
});
