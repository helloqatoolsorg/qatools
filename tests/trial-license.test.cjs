const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),crypto=require('crypto');
const keys=crypto.generateKeyPairSync('ed25519'),modules={};
function load(name){if(modules[name])return modules[name];const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,process:{env:{QATOOLS_LICENSE_SIGNING_KEY:keys.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),QATOOLS_LICENSE_SIGNING_KEY_ID:'test'}},require:n=>n==='server-only'?{}:n==='./signedLicense'?load('signedLicense'):require(n)});return modules[name]=exports;}
const lib=load('signedTrialLicense'),start=1791000000,week=604800;
const input={activationId:'1',credentialId:'00000000-0000-4000-8000-000000000001',machineId:'0123456789ABCDEF',purchased:['owned'],free:['free'],trial:['demo','owned'],trialStartedAt:start,trialEndsAt:start+week,issuedAt:start+6*86400};
test('day-six renewal cannot extend trial; purchased and free access survive trial expiry',()=>{
 const proof=lib.issueTrialLicense(input),p=lib.verifyTrialLicense(proof,input.issuedAt);
 assert.equal(lib.trialAccess(p,'demo',start+week-1),'trial');assert.equal(lib.trialAccess(p,'demo',start+week),'inactive');
 assert.equal(lib.trialAccess(p,'owned',start+week),'purchased');assert.equal(lib.trialAccess(p,'free',start+week),'free');
 assert.equal(lib.trialAccess(p,'owned',p.expiresAt),'inactive');assert.throws(()=>lib.verifyTrialLicense(proof,p.expiresAt));
 assert.equal(lib.verifyTrialLicense(proof,p.expiresAt,true).trialEndsAt,input.trialEndsAt);
});
test('tampered dates, invalid windows and legacy verification fail closed',()=>{
 const proof=lib.issueTrialLicense(input),p=JSON.parse(Buffer.from(proof.payload,'base64url'));p.trialEndsAt+=week;
 assert.throws(()=>lib.verifyTrialLicense({...proof,payload:Buffer.from(JSON.stringify(p)).toString('base64url')},input.issuedAt));
 assert.throws(()=>lib.issueTrialLicense({...input,trialEndsAt:input.trialEndsAt+1}));
 assert.throws(()=>load('signedLicense').verifyLicense(proof,false,input.issuedAt));
});
