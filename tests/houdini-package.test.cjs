const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{exports,require:n=>n in mocks?mocks[n]:require(n.startsWith('.')?path.resolve(path.dirname(file),n):n),Buffer,process,Uint8Array,URL,Request,Response,FormData,File,Set,JSON});return exports;}
const config=fs.readFileSync('public/qatools.json'),hda=fs.readFileSync('houdini/otls/qafit01_online.hdalc');
const library=load('src/lib/houdiniPackage.ts',{'server-only':{}});
function entries(zip){const result=[];let at=0;while(zip.readUInt32LE(at)===0x04034b50){const size=zip.readUInt32LE(at+18),len=zip.readUInt16LE(at+26),extra=zip.readUInt16LE(at+28),start=at+30+len+extra;result.push({name:zip.toString('utf8',at+30,at+30+len),bytes:zip.subarray(start,start+size)});at=start+size;}return result;}
test('portable JSON rejects extra environment settings, absolute paths and oversized inputs',()=>{
 assert.equal(library.validPackageJson(config),true);
 for(const value of [{env:[{qatools:'C:/secret'}],path:[{HOUDINI_PATH:'$qatools'}]},{...library.packageConfig,scripts:['evil.py']},{env:[{qatools:'$HOUDINI_PACKAGE_PATH/qatools',SECRET:'secret'}],path:[{HOUDINI_PATH:'$qatools'}]},null,{}])assert.equal(library.validPackageJson(Buffer.from(JSON.stringify(value))),false);
 assert.equal(library.validPackageJson(Buffer.alloc(9000)),false);
});
test('HDA accepts the real installer tool and rejects traversal, scripts and missing content',()=>{
 assert.equal(library.validHda('qafit01_online.hdalc',hda),true);
 for(const name of ['../tool.hda','C:/tool.hda','tool.py','tool.hda/secret'])assert.equal(library.validHda(name,hda),false);
 assert.equal(library.validHda('tool.hda',Buffer.from('not a digital asset')),false);
});
test('single and multi-tool archives have one root JSON, exact HDAs and shared runtime',async()=>{
 const bytes=await library.buildHoudiniPackage(config,[{name:'qafit01_online.hdalc',bytes:hda}]);
 const zipValidator=load('src/lib/adminDownloadUpload.ts',{'server-only':{}});assert.equal(zipValidator.validToolZip(bytes),true);
 const items=entries(bytes);assert.equal(items.length,7);assert.equal(items[0].name,'qatools.json');assert.ok(items[0].bytes.equals(config));assert.ok(items.find(e=>e.name==='qatools/otls/qafit01_online.hdalc').bytes.equals(hda));
 for(const name of library.runtimeFiles)assert.ok(items.find(e=>e.name==='qatools/python3.13libs/qatools_licensing/'+name).bytes.equals(fs.readFileSync('houdini/python/qatools_licensing/'+name)));
 assert.ok(items.find(e=>e.name==='qatools/scripts/pythonrc.py'));
 assert.ok(items.every(e=>!e.name.includes('.env')&&!e.name.includes('account-v2.json')));
 const bundle=entries(await library.buildHoudiniPackage(config,[{name:'one.hda',bytes:hda},{name:'two.hda',bytes:hda}]));assert.equal(bundle.filter(e=>e.name==='qatools.json').length,1);assert.equal(bundle.filter(e=>e.name.startsWith('qatools/otls/')).length,2);
 await assert.rejects(library.buildHoudiniPackage(config,[{name:'tool.hda',bytes:hda},{name:'TOOL.hda',bytes:hda}]),/duplicate/);
 const dest=path.join(process.env.TEMP,'qatools-package-validation.zip');fs.writeFileSync(dest,bytes);
});
function setup(options={}){
 const calls=[];
 const db={from(table){calls.push({table});const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:table==='products'?{id:1,slug:'qafit01',product_type:options.bundle?'bundle':'tool',published:!!options.published}:options.existing?{file_path:options.existing}:null,error:null};}};return q;},storage:{async getBucket(){return {data:{public:!!options.publicBucket},error:null};},from(){return {async upload(file,bytes){calls.push({upload:file,bytes});return {error:options.uploadError?{}:null};}};}},async rpc(name,args){calls.push({rpc:name,args});return {data:{ok:!options.mappingFailure},error:null};}};
 const route=load('src/app/api/admin/products/package/route.ts',{'@/lib/requireAdmin':{async requireAdmin(){return options.denied?{response:Response.json({error:'Denied'},{status:403})}:{user:{id:'verified-admin'}};}},'@/lib/activationHttp':{privateJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/houdiniPackage':library});
 const request=(expected='',badJson=false)=>{const form=new FormData();form.set('tool',new File([hda],'qafit01_online.hdalc'));form.set('config',new File([badJson?Buffer.from('{}'):config],'qatools.json'));return new Request('http://localhost/api/admin/products/package?productId=1&expectedPath='+encodeURIComponent(expected),{method:'POST',body:form});};
 return {calls,route,request};
}
test('package upload authorizes before reading bodies or storage',async()=>{const s=setup({denied:true});const response=await s.route.POST(s.request());assert.equal(response.status,403);assert.equal(s.calls.length,0);});
test('published/composed products, stale mapping and invalid JSON never upload',async()=>{
 for(const o of [{published:true},{bundle:true},{existing:'old.zip'},{}]){const s=setup(o),response=await s.route.POST(s.request('',Object.keys(o).length===0));assert.ok([400,409].includes(response.status));assert.ok(!s.calls.some(c=>c.upload));}
});
test('private installer upload uses new paths and verified identity with existing CAS writer',async()=>{
 const s=setup();const response=await s.route.POST(s.request());assert.equal(response.status,200);const upload=s.calls.find(c=>c.upload),rpc=s.calls.find(c=>c.rpc);assert.match(upload.upload,/^1\/[a-f0-9-]+\/qafit01-houdini22.zip$/);assert.equal(entries(upload.bytes).length,7);assert.equal(rpc.rpc,'set_product_download');assert.equal(rpc.args.p_admin_id,'verified-admin');assert.equal(rpc.args.p_expected_path,null);assert.equal(rpc.args.p_enabled,true);
});
test('public buckets and upload failures preserve current mapping; binding failures report failure',async()=>{
 for(const options of [{publicBucket:true},{uploadError:true}]){const s=setup(options);const response=await s.route.POST(s.request());assert.equal(response.status,503);assert.ok(!s.calls.some(c=>c.rpc));}
 const s=setup({mappingFailure:true});assert.equal((await s.route.POST(s.request())).status,409);
});
