const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,process,Set,Map,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
const pack=load('src/lib/houdiniPackage.ts',{'server-only':{},'../../public/QATools.json':JSON.parse(fs.readFileSync('public/QATools.json'))});
const valid=load('src/lib/adminDownloadUpload.ts',{'server-only':{}}),hda=Buffer.concat([Buffer.from('INDX'),Buffer.alloc(70,42)]);
const entries=[{name:'QATools/otls/QA_Tool.hdalc',bytes:hda},{name:'QATools.json',bytes:Buffer.from('old JSON')},{name:'QATools/scripts/python/qatools_licensing/client.py',bytes:Buffer.from('old runtime')},{name:'Project/My Project/scene.hiplc',bytes:Buffer.from('unchanged scene')},{name:'Project/My Project/geo/cache.bgeo.sc',bytes:Buffer.from('unchanged cache')},{name:'PROJECT-README.txt',bytes:Buffer.from('unchanged readme')}];
const archive=pack.makePackageZip(entries,'Project/My Project/');
function setup(o={}){const calls=[],objects=new Map();const store={async exists(path){calls.push({exists:path});return o.headFailure?{data:false,error:{status:503}}:{data:objects.has(path),error:objects.has(path)?null:{status:404}};},async download(path){calls.push({download:path});return {data:o.archiveFailure?null:new Blob([archive]),error:null};},async upload(path,bytes,options){calls.push({upload:path,bytes,options});if(!o.uploadFailure||o.race)objects.set(path,bytes);return {error:o.uploadFailure?{}:null};}};
 const lib=load('src/lib/releaseDelivery.ts',{'server-only':{},'@/lib/supabaseAdmin':{supabaseAdmin:{storage:{from:()=>store}}},'./adminDownloadUpload':valid,'./houdiniPackage':pack});
 return {calls,lib,objects,release:{id:'00000000-0000-4000-8000-000000000001',file_path:'1/original/QA_Tool.zip',file_name:'QA_Tool.zip',compatibility:'Houdini 21 and newer'}};
}
test('delivery keeps exact tool and Project bytes and replaces only shared licensing/config files',async()=>{
 const s=setup();const path=await s.lib.releaseDelivery(1,s.release);const upload=s.calls.find(c=>c.upload),parsed=s.lib.releasePayload(upload.bytes);
 for(const entry of entries.filter(e=>e.name.includes('/otls/')||e.name.startsWith('Project/')||e.name==='PROJECT-README.txt'))assert.deepEqual(Buffer.from(parsed.entries.find(e=>e.name===entry.name).bytes),entry.bytes);
 assert.ok(!upload.bytes.includes(Buffer.from('old runtime')));assert.ok(!upload.bytes.includes(Buffer.from('old JSON')));assert.ok(upload.bytes.includes(fs.readFileSync('houdini/python/qatools_licensing/client.py')));
 assert.match(path,/^1\/releases\/[^/]+\/[a-f0-9]{64}\/QA_Tool.zip$/);assert.equal(upload.options.upsert,false);
 await s.lib.releaseDelivery(1,s.release);assert.equal(s.calls.filter(c=>c.download).length,1);assert.equal(s.calls.filter(c=>c.upload).length,1);assert.equal(s.calls.find(c=>c.download).download,s.release.file_path);
});
test('missing-cache SDK responses build safely; storage outages, failed writes and unsupported compatibility fail closed',async()=>{
 for(const option of ['headFailure','archiveFailure','uploadFailure']){const s=setup({[option]:true});await assert.rejects(s.lib.releaseDelivery(1,s.release));assert.equal(s.calls.filter(c=>c.upload).length,option==='uploadFailure'?1:0);}
 const race=setup({uploadFailure:true,race:true});await race.lib.releaseDelivery(1,race.release);
 const unsupported=setup();await assert.rejects(unsupported.lib.releaseDelivery(1,{...unsupported.release,compatibility:'Houdini 20 and newer'}));assert.equal(unsupported.calls.length,0);
});
test('invalid, unexpected, corrupt and mismatched-case release payloads never become delivery packages',()=>{
 const {lib}=setup();for(const archive of [Buffer.from('invalid'),pack.makePackageZip([{name:'QATools/otls/QA_Tool.hdalc',bytes:hda},{name:'unexpected.py',bytes:Buffer.from('bad')}]),pack.makePackageZip([{name:'qatools/otls/QA_Tool.hdalc',bytes:hda}])])assert.throws(()=>lib.releasePayload(archive));
 const corrupt=Buffer.from(pack.makePackageZip([{name:'QATools/otls/QA_Tool.hdalc',bytes:hda}]));corrupt[75]^=1;assert.throws(()=>lib.releasePayload(corrupt));
});
