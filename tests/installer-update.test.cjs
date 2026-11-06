const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,Blob,URL,Response,Request,process,require:n=>n in mocks?mocks[n]:require(n.startsWith('.')?path.resolve(path.dirname(file),n):n)});return exports;}
const packageLib=load('src/lib/houdiniPackage.ts',{'server-only':{}}),zipLib=load('src/lib/adminDownloadUpload.ts',{'server-only':{}});
const contents=load('src/lib/installerContents.ts',{'server-only':{},'./adminDownloadUpload':zipLib}).installerContents;
test('ZIP contents list actual packaged files and reject corrupt or unsafe directories',async()=>{
 const hda=fs.readFileSync('houdini/otls/qafit01_online.hdalc');
 const bytes=await packageLib.buildHoudiniPackage(Buffer.from(JSON.stringify(packageLib.packageConfig)),[{name:'qafit01.hdalc',bytes:hda}]);
 const names=Array.from(contents(bytes));assert.ok(names.includes('QATools.json'));assert.ok(names.includes('QATools/otls/qafit01.hdalc'));
 assert.throws(()=>contents(Buffer.from('not a ZIP')));
 const corrupt=Buffer.from(bytes);const at=corrupt.indexOf(Buffer.from('QATools/otls/qafit01.hdalc'),corrupt.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])));corrupt.write('../',at);assert.throws(()=>contents(corrupt));
});
function setup(options={}){
 const calls=[],old=Buffer.from('old-package'),newBytes=options.same?old:Buffer.from('new-package');
 const db={from(table){calls.push(table);const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:table==='products'?{id:1,slug:'qa_fit',product_type:'tool',prepared_identity:options.identity??null}:{file_path:'1/old/QA_Fit.zip',file_name:'QA_Fit.zip',enabled:true},error:null};}};return q;},storage:{async getBucket(){calls.push('bucket');return {data:{public:!!options.publicBucket}};},from(){return {async download(){calls.push('read');return {data:new Blob([old])};},async upload(path){calls.push({upload:path});return {error:options.uploadFailure?{}:null};}};}},async rpc(name,args){calls.push({rpc:name,args});return {data:{ok:!options.stale},error:null};}};
 const route=load('src/app/api/admin/products/rebuild/route.ts',{'@/lib/requireAdmin':{requireAdmin:async()=>options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:'admin'}}},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/activationHttp':{privateJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})},'@/lib/bundlePackage':{bundleTools:()=>[{name:'QA_Fit.hdalc',bytes:Buffer.from('hda')}]},'@/lib/houdiniPackage':{packageConfig:{},buildHoudiniPackage:async()=>newBytes}});
 return {calls,run:(expected='1/old/QA_Fit.zip')=>route.POST(new Request('http://localhost/rebuild?productId=1&expectedPath='+encodeURIComponent(expected),{method:'POST'}))};
}
test('rebuild authenticates first, rejects stale mappings and leaves identical packages untouched',async()=>{
 const denied=setup({denied:true});assert.equal((await denied.run()).status,403);assert.equal(denied.calls.length,0);
 const stale=setup();assert.equal((await stale.run('other')).status,409);assert.ok(!stale.calls.includes('read'));
 const same=setup({same:true});const response=await same.run();assert.equal(response.status,200);assert.equal((await response.json()).unchanged,true);assert.ok(!same.calls.some(c=>c.upload||c.rpc));
});
test('rebuild preserves filename and uses compare-and-swap; unsafe identities and storage never mutate mapping',async()=>{
 const s=setup();assert.equal((await s.run()).status,200);const write=s.calls.find(c=>c.rpc);assert.equal(write.rpc,'set_product_download');assert.equal(write.args.p_expected_path,'1/old/QA_Fit.zip');assert.equal(write.args.p_file_name,'QA_Fit.zip');assert.match(write.args.p_file_path,/^1\/[a-f0-9-]+\/QA_Fit.zip$/);
 for(const options of [{publicBucket:true},{uploadFailure:true},{identity:{file:'wrong.hdalc',sha256:'wrong'}}]){const fail=setup(options);assert.ok((await fail.run()).status>=400);assert.ok(!fail.calls.some(c=>c.rpc));}
 const stale=setup({stale:true});assert.equal((await stale.run()).status,409);
});
