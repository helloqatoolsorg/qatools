const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const id='00000000-0000-4000-8000-000000000099',machine='0123456789ABCDEF',token='a'.repeat(64);
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,URL,Response,Request,Error,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
function setup(options={}){
 const calls=[];
 const connectionDatabase={async rpc(name,args){calls.push({name,args});return {data:options.sqlError?null:options.expired?{ok:false,code:'connection_expired'}:args.p_action==='claim'?(options.pending?{ok:true,pending:true}:{ok:true,activation:{id:17,credential_id:id,machine_id:machine}}):{ok:true,machineName:'Computer',displayCode:'123456',machineId:machine},error:options.sqlError?{}:null};}};
 const shared={'@/lib/houdiniConnection':{connectionDatabase,validConnectionId:v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)},'@/lib/licensingRequestLimit':{licensingNetworkLimit:async()=>options.limited?Response.json({}, {status:429}):null,licensingRequestLimit:async()=>null},'@/lib/activationHttp':{readActivationBody:async r=>{try{return await r.json();}catch{return null;}},privateJson:(b,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'no-store'}}),activationFailure:()=>Response.json({error:'Unavailable'},{status:503})},'@/lib/signedLicense':{signingConfiguration(){if(options.noSigning)throw Error('secret signing failure');}},'@/lib/trialActivation':{trialRenewal:async(...args)=>{calls.push({signed:args});return Response.json({license:{signed:true}});}}};
 const device=load('src/app/api/licensing/connect/route.ts',shared);
 const admin={from(){calls.push({readCredential:true});return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:options.noCredential?null:{id},error:null})};},rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};}};
 const browser=load('src/app/api/account/houdini-connect/route.ts',{...shared,'@/lib/requireAccount':{requireAccount:async()=>options.denied?{response:Response.json({}, {status:401})}:{user:{id:'verified-user'}}},'@/lib/supabaseAdmin':{supabaseAdmin:admin},'@/lib/activationCredentials':{createActivationKey:()=>({key:'synthetic',hash:'b'.repeat(64),prefix:'synthetic'})},'@/lib/activationKeyEncryption':{encryptActivationKey:()=>{calls.push({encrypt:true});return 'encrypted';}}});
 const req=(b)=>new Request('http://localhost',{method:'POST',body:JSON.stringify(b)});
 return {calls,start:(patch={})=>device.POST(req({action:'start',machineId:machine,machineName:'Computer',...patch})),claim:(patch={})=>device.POST(req({action:'claim',id,token,machineId:machine,...patch})),browser:(approve)=>browser[approve?'POST':'GET'](approve?req({id,userId:'attacker'}):new Request('http://localhost?id='+id))};
}
test('device start stores only token hash and returns no browser credentials',async()=>{
 const s=setup(),r=await s.start();assert.equal(r.status,200);const body=await r.json();assert.match(body.token,/^[a-f0-9]{64}$/);assert.match(body.displayCode,/^[0-9]{6}$/);assert.equal(body.expiresIn,300);
 assert.equal(s.calls[0].args.p_secret_hash,crypto.createHash('sha256').update(body.token).digest('hex'));assert.ok(!JSON.stringify(s.calls).includes(body.token));assert.equal(r.headers.get('cache-control'),'no-store');
});
test('rate limits, malformed input and missing signing configuration cannot create or claim assignments',async()=>{
 for(const options of [{limited:true},{noSigning:true}]){const s=setup(options);assert.ok((await s.start()).status>=400);assert.equal(s.calls.length,0);}
 const s=setup();assert.equal((await s.start({machineId:'bad'})).status,400);assert.equal((await s.claim({token:'bad'})).status,400);assert.equal(s.calls.length,0);
});
test('claim waits for approval, signs only the trusted assignment and fails closed on expired requests',async()=>{
 const p=setup({pending:true});assert.equal((await p.claim()).status,202);assert.ok(!p.calls.some(c=>c.signed));
 const s=setup();assert.equal((await s.claim()).status,200);assert.deepEqual(s.calls.find(c=>c.signed).signed.slice(0,3),[17,id,machine]);assert.equal(s.calls[0].args.p_secret_hash,crypto.createHash('sha256').update(token).digest('hex'));
 const current=setup();assert.equal((await current.claim({licenseVersion:4})).status,200);assert.equal(current.calls.find(c=>c.signed).signed[5],true);
 const e=setup({expired:true});assert.equal((await e.claim()).status,410);assert.ok(!e.calls.some(c=>c.signed));
});
test('browser requires a confirmed session and explicit approval, preserves existing keys and never exposes secrets',async()=>{
 const denied=setup({denied:true});assert.equal((await denied.browser(true)).status,401);assert.equal(denied.calls.length,0);
 const view=setup();assert.equal((await view.browser(false)).status,200);assert.equal(view.calls.length,1);assert.equal(view.calls[0].args.p_action,'inspect');
 const existing=setup();assert.equal((await existing.browser(true)).status,200);assert.ok(!existing.calls.some(c=>c.name==='set_account_activation_credential'));assert.equal(existing.calls.at(-1).args.p_user_id,'verified-user');
 const fresh=setup({noCredential:true});const r=await fresh.browser(true);assert.equal(r.status,200);assert.equal(fresh.calls.find(c=>c.name==='set_account_activation_credential').args.p_expected_id,null);assert.ok(!JSON.stringify(await r.json()).includes('encrypted'));
 const expired=setup({expired:true,noCredential:true});assert.equal((await expired.browser(true)).status,410);assert.ok(!expired.calls.some(c=>c.encrypt||c.readCredential));
});
