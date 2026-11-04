const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function setup(fail=false){
 const calls=[],q={select:v=>(calls.push(['select',v]),q),eq:(...v)=>(calls.push(['eq',...v]),q),limit:async v=>(calls.push(['limit',v]),{error:fail?{message:'private database diagnostic'}:null,data:[{id:1,product_downloads:{enabled:true,file_path:'private.zip'}},{id:2,product_downloads:[{enabled:false}]},{id:3,product_downloads:null}]})};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/catalog/download-availability/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>{
  if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:{from:table=>(calls.push(['table',table]),q)}};
  if(name==='@/lib/activationHttp')return {privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})};
  throw Error(name);
 }});return {get:exports.GET,calls};
}
test('public download readiness exposes published IDs and booleans, never private paths',async()=>{
 const s=setup(),r=await s.get();assert.equal(r.status,200);assert.deepEqual(await r.json(),{products:[{id:1,available:true},{id:2,available:false},{id:3,available:false}]});assert.ok(s.calls.some(v=>v[0]==='eq'&&v[1]==='published'&&v[2]===true));assert.equal(s.calls.find(v=>v[0]==='select')[1],'id,product_downloads(enabled)');
});
test('readiness failures do not leak database details or falsely mark everything unavailable',async()=>{
 const r=await setup(true).get();assert.equal(r.status,503);const body=await r.text();assert.ok(!body.includes('private database diagnostic'));assert.ok(!body.includes('products'));
});
