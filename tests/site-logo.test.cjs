const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), sharp = require('sharp');
const revision = '11111111-1111-4111-8111-111111111111';
function load(file, mocks) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, {exports,Buffer,Request,Response,URL,Uint8Array,require:n=>n in mocks?mocks[n]:require(n)});
 return exports;
}
function setup(options={}) {
 const calls=[];
 const db={from(table){let mutation=false;return {
  select(){return this;},eq(field,value){calls.push(['filter',field,value]);return this;},
  update(value){mutation=true;calls.push(['update',value]);return this;},
  async single(){return {data:{logo_path:null,revision:options.stale?'22222222-2222-4222-8222-222222222222':revision},error:options.database?{message:'private detail'}:null};},
  async maybeSingle(){return {data:options.conflict?null:{logo_path:null,revision},error:options.saveError?{message:'private detail'}:null};}
 };},storage:{async getBucket(){return {data:{public:!options.privateBucket},error:null};},from(){return {async upload(path,bytes,config){calls.push(['upload',path,bytes,config]);return {error:options.uploadError?{}:null};}};}}};
 const route=load('src/app/api/admin/site-logo/route.ts',{
  '@/lib/requireAdmin':{requireAdmin:async()=>options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:'admin'}}},
  '@/lib/supabaseAdmin':{supabaseAdmin:db},
  '@/lib/productMedia':load('src/lib/productMedia.ts',{'server-only':{}}),
  '@/lib/activationHttp':{privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}}),readActivationBody:async r=>{try{return await r.json();}catch{return null;}}}
 });return {route,calls};
}
const upload=bytes=>new Request('https://test/api/admin/site-logo?revision='+revision,{method:'POST',body:bytes});
const restore=(body={revision})=>new Request('https://test/api/admin/site-logo',{method:'DELETE',body:JSON.stringify(body)});
test('all logo operations require server authorization before database/storage access',async()=>{
 for(const method of ['GET','POST','DELETE']){const s=setup({denied:true});const res=await s.route[method](method==='POST'?upload('bad'):method==='DELETE'?restore():new Request('https://test'));assert.equal(res.status,403);assert.equal(s.calls.length,0);}
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
test('restoring clears only the version-checked pointer and invalid input cannot update',async()=>{
 const s=setup();assert.equal((await s.route.DELETE(restore())).status,200);assert.equal(s.calls.find(c=>c[0]==='update')[1].logo_path,null);assert.ok(!s.calls.some(c=>c[0]==='upload'));
 for(const invalid of [{revision:'bad'},{revision,extra:true},{}]){const s=setup();assert.equal((await s.route.DELETE(restore(invalid))).status,400);assert.ok(!s.calls.some(c=>c[0]==='update'));}
 assert.equal((await setup({conflict:true}).route.DELETE(restore())).status,409);
});
test('branding migration grants public read only and uses singleton/version constraints',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261008110000_site_logo.sql','utf8');
 assert.match(sql,/enable row level security/i);assert.match(sql,/revoke all .* from anon, authenticated, service_role/i);assert.match(sql,/grant select .* to anon, authenticated/i);assert.match(sql,/grant select, update .* to service_role/i);assert.match(sql,/check \(id = 1\)/i);
});
