const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,process,Set,Map,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
const pack=load('src/lib/houdiniPackage.ts',{'server-only':{},'../../public/qatools.json':JSON.parse(fs.readFileSync('public/qatools.json'))});
const upload=load('src/lib/adminDownloadUpload.ts',{'server-only':{}});
const project=load('src/lib/projectArchive.ts',{'server-only':{},'./houdiniPackage':pack,'./adminDownloadUpload':upload});
const scene={name:'scenes/example.hipnc',bytes:Buffer.from('project scene')};
function zip(entries=[scene]){return pack.makePackageZip(entries);}
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
test('project release preserves original archive and builds one current shared installer',async()=>{
 const original=zip([scene,{name:'geo/test.bgeo',bytes:Buffer.from('geometry')}]);project.validateProjectArchive(original);
 const release=await project.buildProjectPackage('example_project',original,[{name:'one.hda',bytes:Buffer.concat([Buffer.from('INDX'),Buffer.alloc(40)])}]);
 let cursor=central(release);const contents=new Map();for(let i=0;i<release.readUInt16LE(release.length-12);i++){const n=release.readUInt16LE(cursor+28),name=release.subarray(cursor+46,cursor+46+n).toString(),at=release.readUInt32LE(cursor+42),start=at+30+release.readUInt16LE(at+26),len=release.readUInt32LE(cursor+24);contents.set(name,release.subarray(start,start+len));cursor+=46+n;}
 assert.deepEqual(contents.get('project/example_project.zip'),original);assert.ok(contents.has('qatools/otls/one.hda'));assert.equal(contents.get('qatools.json').toString(),JSON.stringify(pack.packageConfig));assert.match(contents.get('PROJECT-README.txt').toString(),/separate working folder/);
 assert.equal([...contents.keys()].filter(n=>n.endsWith('client.py')).length,1);
});
test('project ZIP rejects absent scenes, corrupt contents, hidden credentials and installer files',()=>{
 for(const entries of [[{name:'readme.txt',bytes:Buffer.from('x')}],[{...scene,bytes:Buffer.alloc(0)}],[scene,{name:'.env.local',bytes:Buffer.from('secret')}],[scene,{name:'account-v2.json',bytes:Buffer.from('secret')}],[scene,{name:'qatools.json',bytes:Buffer.from('{}')}],[scene,{name:'tools/one.hda',bytes:Buffer.from('HDA')}],[scene,{name:'qatools_licensing/client.py',bytes:Buffer.from('code')}]])assert.throws(()=>project.validateProjectArchive(zip(entries)));
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
