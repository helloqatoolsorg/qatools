const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function setup(options={}){
 const calls=[],exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/account/purchases/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Request,Response,require(name){
  if(name==='@/lib/requireAccount')return {requireAccount:async()=>options.denied?{response:Response.json({error:'Log in'},{status:401})}:{user:{id:'verified-user'}}};
  if(name==='@/lib/activationHttp')return {privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})};
  if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:{async rpc(name,args){calls.push({name,args});return {data:options.inactive?{ok:false}:{ok:true,entitlements:[],machines:[]},error:options.error?{message:'private sql'}:null};}}};throw Error(name);
 }});return {calls,get:()=>exports.GET(new Request('http://localhost/api/account/purchases?userId=another-user'))};
}
test('account purchases use authenticated identity, private responses and safe failures',async()=>{
 const denied=setup({denied:true});assert.equal((await denied.get()).status,401);assert.equal(denied.calls.length,0);
 const s=setup(),response=await s.get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'read_account_purchases');assert.equal(s.calls[0].args.p_user_id,'verified-user');
 for(const option of ['inactive','error']){const failed=await setup({[option]:true}).get();assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private sql'));}
});
