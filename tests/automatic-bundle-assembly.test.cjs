const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,process,Set,Map,Request,Response,FormData,File,URL,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
const pack=load('src/lib/houdiniPackage.ts',{'server-only':{},'../../public/qatools.json':JSON.parse(fs.readFileSync('public/qatools.json'))}),validate=load('src/lib/adminDownloadUpload.ts',{'server-only':{}}),bundle=load('src/lib/bundlePackage.ts',{'server-only':{},'./houdiniPackage':pack,'./adminDownloadUpload':validate});
const hda=Buffer.concat([Buffer.from('INDX'),Buffer.alloc(40)]);
function setup(options={}){
 const calls=[],entries=[1,2].map(id=>({id,slug:id===1?'one':'two',product_type:'tool',published:true,prepared_identity:options.identity ? {file:'wrong.hda',sha256:'a'.repeat(64)}:null}));
 const mappings=entries.filter(t=>!options.missing || t.id!==2).map(t=>({product_id:t.id,enabled:!options.disabled,file_path:t.id+'/source/package.zip'}));
 const db={from(table){let id;const q={select(){return q;},eq(k,v){id=v;return q;},async maybeSingle(){return {data:table==='products'?{id,slug:'bundle',product_type:options.project?'project':'bundle'}:null,error:options.database ? {}:null};},async in(){return {data:table==='products'?entries:mappings,error:null};},then(resolve,reject){return Promise.resolve({data:[{tool_id:1},{tool_id:2}],error:null}).then(resolve,reject);}};return q;},storage:{async getBucket(){return {data:{public:!!options.public},error:null};},from(){return {async download(path){calls.push({download:path});const id=Number(path.split('/')[0]),slug=id===1?'one':'two';return {data:options.unavailable?null:new Blob([options.corrupt?Buffer.from('broken'):pack.makePackageZip([{name:'qatools/otls/'+slug+'.hda',bytes:hda},{name:'qatools.json',bytes:Buffer.from('old config')}])]),error:null};},async upload(path,bytes){calls.push({upload:path,bytes});return {error:options.upload ? {}:null};}};}},async rpc(name,args){calls.push({name,args});return {data:{ok:!options.conflict},error:null};}};
 const route=load('src/app/api/admin/products/assemble/route.ts',{'@/lib/requireAdmin':{requireAdmin:async()=>options.denied?{response:Response.json({error:'denied'},{status:403})}:{user:{id:'trusted-admin'}}},'@/lib/activationHttp':{privateJson:(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}})},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/houdiniPackage':pack,'@/lib/bundlePackage':bundle,'@/lib/projectArchive':load('src/lib/projectArchive.ts',{'server-only':{},'./houdiniPackage':pack,'./adminDownloadUpload':validate})});
 return {calls,post:(body)=>route.POST(new Request('http://localhost/api/admin/products/assemble?productId=10&expectedPath=',{method:'POST',...(body!==undefined?{body}: {})}))};
}
test('assembly reads only selected private installers and writes one independent shared-runtime release',async()=>{
 const s=setup(),r=await s.post();assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(s.calls.filter(c=>c.download).map(c=>c.download),['1/source/package.zip','2/source/package.zip']);
 const saved=s.calls.find(c=>c.name);assert.equal(saved.name,'set_assembled_bundle_download');assert.equal(saved.args.p_admin_id,'trusted-admin');assert.deepEqual(Array.from(saved.args.p_sources,x=>x.tool_id),[1,2]);assert.equal(saved.args.p_expected_path,null);
 const zip=s.calls.find(c=>c.upload).bytes;assert.equal(bundle.bundleTools(zip,[{id:1,slug:'one'},{id:2,slug:'two'}]).length,2);
 // ZIP central directory contains each shared component once.
 const end=zip.length-22;assert.equal(zip.readUInt16LE(end+10),8);assert.ok(zip.includes(Buffer.from(JSON.stringify(pack.packageConfig))));
});
test('failed assembly preserves current mapping and reports the failing precondition',async()=>{
 for(const [option,status] of [['denied',403],['public',503],['project',400],['database',503],['missing',409],['disabled',409],['unavailable',503],['corrupt',409],['identity',409],['upload',503],['conflict',409]]){
  const s=setup({[option]:true});assert.equal((await s.post()).status,status,option);if(!['upload','conflict'].includes(option))assert.ok(!s.calls.some(c=>c.upload),option);if(option!=='conflict')assert.ok(!s.calls.some(c=>c.name),option);
 }
 const s=setup();assert.equal((await s.post('untrusted input')).status,400);assert.equal(s.calls.length,0);
});


test('empty POST stream is accepted, while real payload bytes are rejected before storage access',async()=>{
 const request=new Request('http://localhost',{method:'POST',body:''});assert.notEqual(request.body,null);
 const empty=setup();assert.equal((await empty.post('')).status,200);assert.ok(empty.calls.some(c=>c.name==='set_assembled_bundle_download'));
 for(const payload of [' ', '{}','file bytes']){const s=setup();const response=await s.post(payload);assert.equal(response.status,400);assert.match((await response.json()).error,/uploaded content/);assert.equal(s.calls.length,0);}
});

function projectForm(entries=[{name:'scene.hip',bytes:Buffer.from('test scene')}]){const form=new FormData();form.set('tool',new File([pack.makePackageZip(entries)],'project.zip'));return form;}
test('project assembly validates project resources and commits their fingerprint with the selected private tools',async()=>{
 const s=setup({project:true}),response=await s.post(projectForm());assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const saved=s.calls.find(c=>c.name);assert.equal(saved.name,'set_assembled_project_download');assert.match(saved.args.p_project_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(Array.from(saved.args.p_sources,x=>x.tool_id),[1,2]);
 const zip=s.calls.find(c=>c.upload).bytes;assert.ok(zip.includes(Buffer.from('project/bundle.zip')));assert.ok(zip.includes(Buffer.from('PROJECT-README.txt')));assert.equal(zip.readUInt16LE(zip.length-12),10);
 for(const option of ['public','missing','disabled','unavailable','corrupt','identity','upload','conflict']){const bad=setup({project:true,[option]:true});assert.equal((await bad.post(projectForm())).status,['upload','public','unavailable'].includes(option)?503:409,option);}
 for(const entries of [[{name:'readme.txt',bytes:Buffer.from('no scene')}],[{name:'scene.hip',bytes:Buffer.alloc(0)}],[{name:'qatools/otls/a.hda',bytes:hda},{name:'scene.hip',bytes:Buffer.from('scene')}]] ){
  const bad=setup({project:true});assert.equal((await bad.post(projectForm(entries))).status,400);assert.equal(bad.calls.length,0);
 }
 const denied=setup({project:true,denied:true});assert.equal((await denied.post(projectForm())).status,403);assert.equal(denied.calls.length,0);
 const duplicate=projectForm();duplicate.append('tool',new File(['x'],'other.zip'));assert.equal((await setup({project:true}).post(duplicate)).status,400);
});
