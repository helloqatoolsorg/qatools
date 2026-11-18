const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,process,Set,Map,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
const pack=load('src/lib/houdiniPackage.ts',{'server-only':{},'../../public/QATools.json':JSON.parse(fs.readFileSync('public/QATools.json'))});
const upload=load('src/lib/adminDownloadUpload.ts',{'server-only':{}});
const project=load('src/lib/projectArchive.ts',{'server-only':{},'./houdiniPackage':pack,'./adminDownloadUpload':upload});
const scene={name:'scenes/example.hipnc',bytes:Buffer.from('project scene')};
function zip(entries=[scene],root){return pack.makePackageZip(entries,root);}
function central(bytes){return bytes.readUInt32LE(bytes.length-6);}
function renamed(name){const bytes=zip([{...scene,name:'scene.hip'}]);const c=central(bytes),value=Buffer.from(name);assert.equal(value.length,9);value.copy(bytes,30);value.copy(bytes,c+46);return bytes;}
function deflated(descriptor=false){
 const raw=zip(),c=central(raw),start=30+raw.readUInt16LE(26),header=Buffer.from(raw.subarray(0,start)),directory=Buffer.from(raw.subarray(c,raw.length-22)),end=Buffer.from(raw.subarray(raw.length-22));
 const compressed=require('node:zlib').deflateRawSync(scene.bytes),flags=0x802|(descriptor?8:0);header.writeUInt16LE(flags,6);header.writeUInt16LE(8,8);header.writeUInt32LE(compressed.length,18);directory.writeUInt16LE(flags,8);directory.writeUInt16LE(8,10);directory.writeUInt32LE(compressed.length,20);
 const trailer=Buffer.alloc(descriptor?16:0);if(descriptor){header.fill(0,14,26);trailer.writeUInt32LE(0x08074b50);trailer.writeUInt32LE(pack.crc32(scene.bytes),4);trailer.writeUInt32LE(compressed.length,8);trailer.writeUInt32LE(scene.bytes.length,12);}
 end.writeUInt32LE(header.length+compressed.length+trailer.length,16);return Buffer.concat([header,compressed,trailer,directory,end]);
}
test('ordinary compressed ZIPs and streaming descriptors are verified, while broken descriptors fail',()=>{
 for(const descriptor of [false,true]){const bytes=deflated(descriptor);project.validateProjectArchive(bytes);const bad=Buffer.from(bytes);bad[30+bad.readUInt16LE(26)]^=1;assert.throws(()=>project.validateProjectArchive(bad));}
 const bytes=deflated(true),at=central(bytes)-16;bytes[at+4]^=1;assert.throws(()=>project.validateProjectArchive(bytes));
});
function contents(bytes) {
 const files=new Map();let cursor=central(bytes);
 for(let i=0;i<bytes.readUInt16LE(bytes.length-12);i++){
  const nameLength=bytes.readUInt16LE(cursor+28),name=bytes.subarray(cursor+46,cursor+46+nameLength).toString();
  const at=bytes.readUInt32LE(cursor+42),start=at+30+bytes.readUInt16LE(at+26)+bytes.readUInt16LE(at+28);
  const payload=bytes.subarray(start,start+bytes.readUInt32LE(cursor+20));
  const data=bytes.readUInt16LE(cursor+10)===8?require('node:zlib').inflateRawSync(payload):payload;
  assert.equal(data.length,bytes.readUInt32LE(cursor+24));assert.equal(pack.crc32(data),bytes.readUInt32LE(cursor+16));
  files.set(name,data);cursor+=46+nameLength+bytes.readUInt16LE(cursor+30)+bytes.readUInt16LE(cursor+32);
 }
 return files;
}
const tool={name:'one.hda',bytes:Buffer.concat([Buffer.from('INDX'),Buffer.alloc(40)])};
test('project release contains scene and resources directly in its named Project folder',async()=>{
 const original=zip([scene,{name:'geo/test.bgeo',bytes:Buffer.from('geometry')}]);
 const release=await project.buildProjectPackage('example_project',original,[tool]);
 const files=contents(release);
 assert.deepEqual(files.get('Project/Example Project/scenes/example.hipnc'),scene.bytes);
 assert.equal(files.get('Project/Example Project/geo/test.bgeo').toString(),'geometry');
 assert.ok(files.has('QATools/otls/one.hda'));
 assert.equal(files.get('QATools.json').toString(),JSON.stringify(pack.packageConfig));
 assert.match(files.get('PROJECT-README.txt').toString(),/Project\/Example Project/);
 assert.equal([...files.keys()].filter(name=>name.endsWith('client.py')).length,1);
 assert.ok(![...files.keys()].some(name=>name.endsWith('.zip')));
});
test('prepared uploads use the folder identity, preserve resources, and omit upload metadata from the customer download',async()=>{
 const identity={schema:1,label:'Project Name',slug:'project_name',scene:'scene.hiplc',houdini:'21.0.512',tools:['one'],warnings:[]};
 const entries=[{name:'scene.hiplc',bytes:Buffer.from('source scene')},{name:'textures/wood.png',bytes:Buffer.from('texture')},{name:'qatools-project.json',bytes:Buffer.from(JSON.stringify(identity))}];
 const files=contents(await project.buildProjectPackage('project_name',zip(entries),[tool],'Other display name'));
 assert.equal(files.get('Project/Project Name/scene.hiplc').toString(),'source scene');
 assert.equal(files.get('Project/Project Name/textures/wood.png').toString(),'texture');
 assert.ok(![...files.keys()].some(name=>name.endsWith('qatools-project.json')));
 await assert.rejects(project.buildProjectPackage('other_project',zip(entries),[tool]),/another project/);
});
test('older source ZIPs, compressed entries and data descriptors build into the new layout',async()=>{
 for(const descriptor of [false,true]){
  const files=contents(await project.buildProjectPackage('old_project',deflated(descriptor),[tool],'Old Project'));
  assert.deepEqual(files.get('Project/Old Project/scenes/example.hipnc'),scene.bytes);
 }
});
test('project resources support spaces, unicode, empty folders and more than the tool-only entry limit',async()=>{
 const resources=Array.from({length:130},(_,i)=>({name:'Project/Source/cache/frame_'+i+'.bgeo',bytes:Buffer.from('geometry')}));
 resources.push({name:'Project/Source/wood é texture.png',bytes:Buffer.from('texture')},{name:'Project/Source/empty/',bytes:Buffer.alloc(0)});
 const source=zip([scene,...resources],'Project/Source/');
 const files=contents(await project.buildProjectPackage('large_project',source,[tool]));
 assert.equal(files.get('Project/Large Project/Project/Source/wood é texture.png').toString(),'texture');
 assert.ok(files.has('Project/Large Project/Project/Source/empty/'));
 assert.equal(files.get('Project/Large Project/Project/Source/cache/frame_129.bgeo').toString(),'geometry');
 assert.throws(()=>pack.makePackageZip([{name:'QATools/escape file.py',bytes:Buffer.from('x')}],'Project/Safe/'));
 for(const name of ['Project/Safe/../escape','Project/Safe/CON','Project/Safe/a?.png']){
  assert.throws(()=>pack.makePackageZip([{name,bytes:Buffer.from('x')}],'Project/Safe/'));
 }
 await assert.rejects(project.buildProjectPackage('safe',zip(),[tool],'../Escape'),/valid Project name/);
 await assert.rejects(project.buildProjectPackage('safe',zip(),[tool],'Con'),/valid Project name/);
});
test('project ZIP rejects absent scenes, corrupt contents, hidden credentials and installer files',()=>{
 for(const entries of [[{name:'readme.txt',bytes:Buffer.from('x')}],[{...scene,bytes:Buffer.alloc(0)}],[scene,{name:'.env.local',bytes:Buffer.from('secret')}],[scene,{name:'account-v2.json',bytes:Buffer.from('secret')}],[scene,{name:'QATools.json',bytes:Buffer.from('{}')}],[scene,{name:'tools/one.hda',bytes:Buffer.from('HDA')}],[scene,{name:'qatools_licensing/client.py',bytes:Buffer.from('code')}]])assert.throws(()=>project.validateProjectArchive(zip(entries)));
 const corrupt=zip();corrupt[50]^=1;assert.throws(()=>project.validateProjectArchive(corrupt));
 const privateKey=zip([scene,{name:'signer-private.pem',bytes:Buffer.from('secret')}]);assert.throws(()=>project.validateProjectArchive(privateKey));
 assert.throws(()=>project.validateProjectArchive(Buffer.from('not ZIP')));
});
test('project ZIP rejects path traversal, reserved Windows paths, duplicates and symlinks',()=>{
 for(const name of ['../a.hipx','C:/a.hipx','nul.a.hip','a?.a.hipx'])assert.throws(()=>project.validateProjectArchive(renamed(name)));
 assert.throws(()=>project.validateProjectArchive(zip([scene,{...scene,name:'SCENES/EXAMPLE.HIPNC'}])));
 const symlink=zip(),c=central(symlink);symlink.writeUInt32LE((0xa000<<16)>>>0,c+38);assert.throws(()=>project.validateProjectArchive(symlink));
});
test('project ZIP rejects encryption, unsupported compression and declared expansion limits',()=>{
 for(const [field,value] of [[8,1],[10,99],[24,21*1024*1024]]){const bytes=zip(),c=central(bytes);if(field===24)bytes.writeUInt32LE(value,c+field);else bytes.writeUInt16LE(value,c+field);assert.throws(()=>project.validateProjectArchive(bytes));}
 assert.throws(()=>project.validateProjectArchive(zip([{...scene,bytes:Buffer.alloc(4*1024*1024)}])));
});

test('a maximum-size source listing remains inspectable after adding the shared installer',async()=>{
 const entries=[scene,...Array.from({length:999},(_,i)=>({name:'Project/Source/resources/'+i+'.bin',bytes:Buffer.from('resource')}))];
 const source=zip(entries,'Project/Source/');
 const release=await project.buildProjectPackage('many_files',source,[tool]);
 const inspector=load('src/lib/installerContents.ts',{'server-only':{},'./adminDownloadUpload':upload});
 assert.ok(inspector.installerContents(release).length>1000);
 const extra=zip([...entries,{name:'extra.bin',bytes:Buffer.from('extra')}],'Project/Source/');
 assert.throws(()=>project.validateProjectArchive(extra));
});
