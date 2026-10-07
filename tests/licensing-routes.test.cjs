const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const testSigner=crypto.generateKeyPairSync('ed25519');
const signingKey=testSigner.privateKey.export({type:'pkcs8',format:'der'}).toString('base64');
const renewRoute='src/app/api/licensing/renew/route.ts';
const keyRoute = 'src/app/api/account/activation-key/route.ts';
const revealRoute = 'src/app/api/account/activation-key/reveal/route.ts';
const activateRoute = 'src/app/api/licensing/activate/route.ts';
const credentialId = '00000000-0000-4000-8000-000000000001';
const testKey = 'QA_' + 'a'.repeat(43); // synthetic, never sent to a real service

function setup(options = {}) {
  const limitCalls = [];
  const calls = [], modules = new Map();
  const metadata = { id: credentialId, key_prefix: 'QA_abcdefgh', created_at: '2026-10-03', updated_at: '2026-10-03', reveal_available: true };
  const db = {
    auth:{admin:{getUserById:async id=>{calls.push({identityUser:id});return {data:{user:{email:options.identityFailure?null:"owner@example.com"}},error:null};}}},
    from(table) {
      calls.push({ table });
      const q = {
        select(columns) { calls.push({ columns }); return q; },
        eq(column,value) { calls.push({ column,value }); return q; },
        maybeSingle: async () => ({ data: options.noKey ? null : table === "account_activation_credentials" ? {...metadata,user_id:"credential-owner"} : metadata, error: options.databaseError ? { message: 'sensitive database diagnostic' } : null }),
      };
      return q;
    },
    rpc: async (name,args) => {
      if(name === 'consume_licensing_request') {
        limitCalls.push(args);
        return {data: options.limitMalformed ? {allowed:true,retryAfter:0} : {allowed: !(options.limitScope === args.p_scope),retryAfter:45}, error:options.limitError ? {message:'private diagnostic'}:null};
      }
      calls.push({ rpc:name, args });
      if (name === 'get_account_activation_secret') {
        const iv = Buffer.alloc(12, 3);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), iv);
        cipher.setAAD(Buffer.from('qatools:activation-key:v1:' + (options.wrongOwner ? 'another-user' : 'verified-user')));
        const encrypted = Buffer.concat([cipher.update(testKey),cipher.final()]);
        if (options.tampered) encrypted[0] ^= 1;
        return { data: options.code ? {ok:false,code:options.code} : {
          ok:true, encrypted_key:['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.'),
          secret_hash:options.hashMismatch ? '0'.repeat(64) : crypto.createHash('sha256').update(testKey).digest('hex'),
        }, error: options.databaseError ? {} : null };
      }
      return { data: options.code ? { ok:false, code:options.code } : {
        ok:true, credential:metadata, activation:{id:1,machine_id:'0123456789ABCDEF',credential_id:credentialId,activated_at:'2026-10-01T12:00:00Z'},
        products:[{id:1,slug:'tool-a',name:'Tool A'},{id:2,slug:'tool-b',name:'Tool B'}],
      }, error:options.databaseError ? {message:'sensitive database diagnostic'}:null };
    },
  };
  function load(file) {
    if(modules.has(file)) return modules.get(file);
    const module={exports:{}};
    const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText;
    vm.runInNewContext(source,{
      exports:module.exports,Buffer,console,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test',QATOOLS_ACTIVATION_ENCRYPTION_KEY:options.encryptionKey ?? Buffer.alloc(32,7).toString('base64'), QATOOLS_LICENSE_SIGNING_KEY:options.signingKey ?? signingKey, QATOOLS_LICENSE_SIGNING_KEY_ID:'test-v2', SUPABASE_SERVICE_ROLE_KEY:'synthetic-limiter-secret', VERCEL: options.vercel, NODE_ENV: options.nodeEnv}},
      require(name) {
        if(name==='server-only') return {};
        if(name==='node:crypto') return crypto;
        if(name==='node:net') return require('node:net');
        if(name==='next/server') return {NextResponse:{json:(body,init)=>Response.json(body,init)}};
        if(name==='@/lib/supabaseAdmin'||name==='./supabaseAdmin') return {supabaseAdmin:db};
        if(name.startsWith('@/lib/')) return load(name.replace('@/','src/')+'.ts');
        if(name==='@supabase/supabase-js') return {createClient:()=>({auth:{getUser:async token=>{
          calls.push({verifiedToken:token});
          return {data:{user:options.invalidToken?null:{id:'verified-user',email_confirmed_at:options.unconfirmed?null:'2026-10-03'}},error:options.invalidToken?{}:null};
        }}})};
        throw Error('Unexpected module '+name);
      },
    });
    modules.set(file,module.exports); return module.exports;
  }
  function request(body={expectedCredentialId:null},token='session-token',method='POST') {
    return new Request('http://localhost/api?userId=forged',{
      method, headers:token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{},
      ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
    });
  }
  return {load,calls,limitCalls,request};
}

for(const method of ['GET','POST']) {
  for(const [name,options,token,expected] of [
    ['missing session',{},null,401],['invalid session',{invalidToken:true},'bad',401],['unconfirmed email',{unconfirmed:true},'session',403],
  ]) test(`credential ${method} rejects ${name} before database access`,async()=>{
    const s=setup(options), response=await s.load(keyRoute)[method](s.request(undefined,token,method));
    assert.equal(response.status,expected);
    assert.ok(!s.calls.some(c=>c.table||c.rpc));
    assert.equal(response.headers.get('cache-control'),'no-store');
  });
}

test('credential GET reads only safe metadata for the verified user',async()=>{
  const s=setup(); const response=await s.load(keyRoute).GET(s.request(undefined,'session','GET'));
  assert.equal(response.status,200);
  const columns=s.calls.find(c=>c.columns).columns;
  assert.equal(columns.includes('secret'),false);
  assert.equal(s.calls.find(c=>c.column).value,'verified-user');
  assert.equal((await response.json()).key,undefined);
});

test('creation stores only a hash and encrypted envelope, and defaults to masked metadata',async()=>{
  const s=setup(); const response=await s.load(keyRoute).POST(s.request({expectedCredentialId:null,userId:'forged'}));
  assert.equal(response.status,201);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const result=await response.json(); assert.equal(result.key,undefined);
  assert.equal(result.credential.reveal_available,true);
  const rpc=s.calls.find(c=>c.rpc);
  assert.equal(rpc.args.p_user_id,'verified-user');
  const secret=s.load('src/lib/activationKeyEncryption.ts').decryptActivationKey(rpc.args.p_encrypted_key,'verified-user',rpc.args.p_secret_hash);
  assert.match(secret,/^QA_[A-Za-z0-9_-]{43}$/);
  assert.equal(rpc.args.p_key_prefix,secret.slice(0,11));
  assert.ok(!JSON.stringify(rpc).includes(secret));
  const second=setup(); await second.load(keyRoute).POST(second.request());
  assert.notEqual(second.calls.find(c=>c.rpc).args.p_secret_hash,rpc.args.p_secret_hash);
});

test('replacement requires an explicit credential generation',async()=>{
  const s=setup(); const response=await s.load(keyRoute).POST(s.request({expectedCredentialId:credentialId}));
  assert.equal(response.status,200);
  assert.equal(s.calls.find(c=>c.rpc).args.p_expected_id,credentialId);
  const stale=setup({code:'credential_changed'});
  const conflict=await stale.load(keyRoute).POST(stale.request());
  assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).key,undefined);
});

test('bad or oversized credential requests do not call SQL',async()=>{
  for(const body of ['{','null','[]',{}, {expectedCredentialId:'nope'}, {expectedCredentialId:true},' '.repeat(1025)]) {
    const s=setup();
    assert.equal((await s.load(keyRoute).POST(s.request(body))).status,400);
    assert.ok(!s.calls.some(c=>c.rpc));
  }
});

test('activation validates credential and machine ID before database work',async()=>{
  for(const [key,body,expected] of [[null,{machineId:'0123456789ABCDEF'},401],['bad',{machineId:'0123456789ABCDEF'},401],[testKey,{},400],[testKey,{machineId:'Houdini21'},400],[testKey,{machineId:'0123456789abcdef'},400],[testKey,'{',400],[testKey,' '.repeat(1025),400]]) {
    const s=setup();
    assert.equal((await s.load(activateRoute).POST(s.request(body,key))).status,expected);
    assert.equal(s.calls.length,0);
  }
});

test('one activation returns owned products and does not bind Houdini version or trust requested products',async()=>{
  for(const version of ['20.5','21','22']) {
    const s=setup(); const response=await s.load(activateRoute).POST(s.request({machineId:'0123456789ABCDEF',houdiniVersion:version,products:['ALL'],userId:'forged'},testKey));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const result=await response.json();
    assert.deepEqual(result.products.map(p=>p.id),[1,2]);
    assert.equal(result.signedLicenseAvailable,true);
    assert.deepEqual(Array.from(s.load("src/lib/signedLicense.ts").verifyLicense(result.license).products),["tool-a","tool-b"]);
    assert.deepEqual(Object.keys(s.calls[0].args).sort(),['p_machine_id','p_secret_hash']);
    assert.equal(JSON.stringify(result).includes(testKey),false);
  }
});

for(const [code,status] of [['invalid_credential',401],['no_entitlements',403],['machine_in_use',409]]) {
  test(`activation maps ${code} to a safe failure`,async()=>{
    const s=setup({code}); const response=await s.load(activateRoute).POST(s.request({machineId:'0123456789ABCDEF'},testKey));
    assert.equal(response.status,status); assert.equal((await response.json()).activation,undefined);
  });
}

test('database failures expose neither SQL diagnostics nor a generated key',async()=>{
  for(const [file,body,token] of [[keyRoute,{expectedCredentialId:null},'session'],[activateRoute,{machineId:'0123456789ABCDEF'},testKey]]) {
    const s=setup({databaseError:true}); const response=await s.load(file).POST(s.request(body,token));
    assert.equal(response.status,503); const result=await response.json();
    assert.equal(result.key,undefined); assert.equal(JSON.stringify(result).includes('sensitive'),false);
  }
});

for(const [name,options,token,status] of [['missing session',{},null,401],['invalid session',{invalidToken:true},'bad',401],['unconfirmed email',{unconfirmed:true},'session',403]]) {
  test('reveal rejects '+name+' before retrieving any secret',async()=>{
    const s=setup(options); const response=await s.load(revealRoute).POST(s.request({credentialId},token));
    assert.equal(response.status,status);
    assert.ok(!s.calls.some(c=>c.rpc||c.table));
  });
}
test('reveal and repeated retrieval return the same key for the verified account with no cache',async()=>{
  const s=setup();
  for(let i=0;i<2;i++) {
    const response=await s.load(revealRoute).POST(s.request({credentialId,userId:'forged'}));
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    const result=await response.json(); assert.equal(result.key,testKey);
    assert.equal(result.encrypted_key,undefined);assert.equal(result.secret_hash,undefined);
  }
  assert.ok(s.calls.filter(c=>c.rpc).every(c=>c.rpc==='get_account_activation_secret'&&c.args.p_user_id==='verified-user'&&c.args.p_expected_id===credentialId));
});
test('reveal rejects malformed requests without querying credentials',async()=>{
  for(const body of [null,{},[],{credentialId:'bad'},' '.repeat(1025)]) {
    const s=setup(); assert.equal((await s.load(revealRoute).POST(s.request(body))).status,400);
    assert.ok(!s.calls.some(c=>c.rpc));
  }
});
test('legacy and stale keys give explicit non-secret responses',async()=>{
  for(const code of ['legacy_key','credential_changed']) {
    const s=setup({code});const response=await s.load(revealRoute).POST(s.request({credentialId}));
    assert.equal(response.status,409);assert.equal((await response.json()).key,undefined);
  }
});
test('reveal fails closed for tampering, another account ciphertext, wrong hash, and missing encryption configuration',async()=>{
  for(const options of [{tampered:true},{wrongOwner:true},{hashMismatch:true},{encryptionKey:''},{encryptionKey:Buffer.alloc(32,8).toString('base64')},{databaseError:true}]) {
    const s=setup(options); const response=await s.load(revealRoute).POST(s.request({credentialId}));
    assert.equal(response.status,503); assert.equal((await response.json()).key,undefined);
  }
});
test('missing encryption configuration prevents creating an unrecoverable credential',async()=>{
  const s=setup({encryptionKey:''});const response=await s.load(keyRoute).POST(s.request());
  assert.equal(response.status,503);assert.ok(!s.calls.some(c=>c.rpc));
});
test('encryption uses independent nonces and rejects malformed or substituted data',()=>{
  const helper=setup().load('src/lib/activationKeyEncryption.ts');
  const a=helper.encryptActivationKey(testKey,'user-a'), b=helper.encryptActivationKey(testKey,'user-a');
  const hash=crypto.createHash('sha256').update(testKey).digest('hex');
  assert.notEqual(a,b);assert.equal(a.includes(testKey),false);
  assert.equal(helper.decryptActivationKey(a,'user-a',hash),testKey);
  assert.throws(()=>helper.decryptActivationKey(a,'user-b',hash));
  assert.throws(()=>helper.decryptActivationKey('v1.bad','user-a',hash));
  assert.throws(()=>helper.encryptActivationKey('not-a-key','user-a'));
});

test('missing signing configuration blocks activation before any machine mutation',async()=>{
  const s=setup({signingKey:''});const response=await s.load(activateRoute).POST(s.request({machineId:'0123456789ABCDEF'},testKey));
  assert.equal(response.status,503); assert.equal(s.calls.length,0);
});
function renewalProof(s,issuedAt) {
  return s.load('src/lib/signedLicense.ts').issueLicense({id:1,machine_id:'0123456789ABCDEF',credential_id:credentialId},[{slug:'tool-a'},{slug:'tool-b'}],issuedAt);
}
function renewalBody(proof,overrides={}) {return {license:proof,machineId:'0123456789ABCDEF',nonce:'a'.repeat(32),offlineDays:7,...overrides};}
test('renewal accepts expired genuine proof and uses only its signed assignment identity',async()=>{
  const s=setup();const helper=s.load('src/lib/signedLicense.ts');
  const proof=renewalProof(s,Math.floor(Date.now()/1000)-helper.OFFLINE_SECONDS-10);
  assert.throws(()=>helper.verifyLicense(proof));
  const response=await s.load(renewRoute).POST(s.request(renewalBody(proof,{activationId:99,products:['ALL']}),null));
  assert.equal(response.status,200);const next=helper.verifyLicense((await response.json()).license);
  assert.equal(next.expiresAt-next.issuedAt,7*86400);
  const rpc=s.calls.find(c=>c.rpc);assert.equal(rpc.rpc,'renew_account_license');
  assert.equal(rpc.args.p_activation_id,1);assert.equal(rpc.args.p_credential_id,credentialId);
  assert.ok(!s.calls.some(c=>c.rpc==='activate_account_machine'));
});
test('invalid renewal proof, machine, nonce and bodies cannot reach the database',async()=>{
  const s=setup();const proof=renewalProof(s);
  for(const [body,status] of [[renewalBody({...proof,signature:'a'.repeat(86)}),401],[renewalBody(proof,{machineId:'FEDCBA9876543210'}),401],[renewalBody(proof,{nonce:'bad'}),400],[null,400],[' '.repeat(131073),400]]) {
    const before=s.calls.length;const response=await s.load(renewRoute).POST(s.request(body,null));
    assert.equal(response.status,status);assert.equal(s.calls.length,before);
  }
});
test('released/revoked account failures produce signed denial bound to proof and request nonce',async()=>{
  for(const code of ['assignment_inactive','credential_changed','account_unavailable','no_entitlements']) {
    const s=setup({code});const helper=s.load('src/lib/signedLicense.ts');const proof=renewalProof(s);
    const response=await s.load(renewRoute).POST(s.request(renewalBody(proof),null));
    assert.equal(response.status,403);const result=await response.json();
    const bytes=Buffer.from(result.denial.payload,'base64url');
    assert.ok(crypto.verify(null,bytes,testSigner.publicKey,Buffer.from(result.denial.signature,'base64url')));
    const denial=JSON.parse(bytes);assert.equal(denial.kind,'denial');assert.equal(denial.reason,code);
    assert.equal(denial.nonce,'a'.repeat(32));assert.equal(denial.licenseDigest,helper.licenseDigest(proof));
    assert.equal(result.license,undefined);assert.ok(!s.calls.some(c=>c.rpc==='activate_account_machine'));
  }
});
test('database outages are unsigned temporary failures, never revocations',async()=>{
  const s=setup({databaseError:true});const response=await s.load(renewRoute).POST(s.request(renewalBody(renewalProof(s)),null));
  assert.equal(response.status,503);assert.equal((await response.json()).denial,undefined);
});
test('signed license has explicit product scope, exact 7-day duration, and tamper/expiry checks',()=>{
  const s=setup(),helper=s.load('src/lib/signedLicense.ts'),now=Math.floor(Date.now()/1000);
  const proof=renewalProof(s,now),payload=helper.verifyLicense(proof,false,now);
  assert.equal(payload.version,2);assert.equal(payload.expiresAt-now,7*86400);
  assert.equal(payload.houdiniVersion,undefined);assert.ok(!JSON.stringify(payload).includes(testKey));
  assert.throws(()=>helper.verifyLicense(proof,false,payload.expiresAt));
  assert.throws(()=>helper.verifyLicense({...proof,payload:Buffer.from('{}').toString('base64url')}));
  assert.throws(()=>helper.verifyLicense({payload:proof.payload+'=',signature:proof.signature}));
  assert.throws(()=>helper.verifyLicense(helper.issueDenial(proof,'a'.repeat(32),'assignment_inactive')));
  assert.throws(()=>helper.issueLicense({id:1,machine_id:'0123456789ABCDEF',credential_id:credentialId},[{slug:'ALL'}]));
});

const houdiniPython = process.env.HOUDINI_PYTHON || 'C:/Program Files/Side Effects Software/Houdini 22.0.459/python313/python.exe';
test('website-signed bytes verify with the actual Houdini Python client', {skip: !fs.existsSync(houdiniPython)},()=>{
  const s=setup(); const proof=renewalProof(s);
  const payload=JSON.parse(Buffer.from(proof.payload,'base64url'));
  const fixture={license:proof,keyId:payload.keyId,publicKey:testSigner.publicKey.export({type:'spki',format:'pem'}),machineId:'0123456789ABCDEF'};
  const result=require('node:child_process').spawnSync(houdiniPython,[path.resolve('tests/verify_node_license.py')],{
    input:JSON.stringify(fixture),encoding:'utf8',env:{...process.env,PYTHONPATH:path.resolve('houdini/python'),PYTHONDONTWRITEBYTECODE:'1'}
  });
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{products:['tool-a','tool-b'],duration:7*86400});
});

test('signed identity comes from the credential account and ignores supplied email',async()=>{
 const s=setup(),response=await s.load(activateRoute).POST(s.request({machineId:'0123456789ABCDEF',email:'forged@example.com'},testKey));assert.equal(response.status,200);
 const payload=s.load('src/lib/signedLicense.ts').verifyLicense((await response.json()).license);assert.equal(payload.accountEmail,'owner@example.com');assert.equal(payload.activatedAt,Date.parse('2026-10-01T12:00:00Z')/1000);assert.equal(s.calls.find(c=>c.identityUser).identityUser,'credential-owner');
 const unavailable=setup({identityFailure:true});assert.equal((await unavailable.load(activateRoute).POST(unavailable.request({machineId:'0123456789ABCDEF'},testKey))).status,503);
});


test('network limits precede parsing/signing and all ownership work; keys and proofs are never stored',async()=>{
  for(const [route,scope] of [[activateRoute,'activate-ip'],[renewRoute,'renew-ip']]) {
    const s=setup({limitScope:scope,signingKey:''});
    const response=await s.load(route).POST(s.request('invalid JSON',testKey));
    assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'45');
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(s.calls.length,0);assert.equal(s.limitCalls.length,1);
    assert.match(s.limitCalls[0].p_subject_hash,/^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(s.limitCalls).includes(testKey));
    assert.equal((await response.json()).denial,undefined);
  }
});

test('key and signed-assignment throttles block mutations and return unsigned temporary failures',async()=>{
  const a=setup({limitScope:'activate-key'});
  assert.equal((await a.load(activateRoute).POST(a.request({machineId:'0123456789ABCDEF',offlineDays:7},testKey))).status,429);
  assert.equal(a.calls.length,0);assert.equal(a.limitCalls.length,2);
  const b=setup({limitScope:'renew-assignment'});
  const response=await b.load(renewRoute).POST(b.request(renewalBody(renewalProof(b)),null));
  assert.equal(response.status,429);assert.equal(b.calls.length,0);
  assert.equal((await response.json()).denial,undefined);
});

test('limiter errors and malformed responses fail closed without diagnostics',async()=>{
  for(const options of [{limitError:true},{limitMalformed:true}]) {
    const s=setup(options);const response=await s.load(activateRoute).POST(s.request({},testKey));
    assert.equal(response.status,503);assert.equal(s.calls.length,0);
    assert.ok(!JSON.stringify(await response.json()).includes('diagnostic'));
  }
});

test('only Vercel forwarding is trusted; local spoofed headers share one bucket',async()=>{
  const local=setup(),h=local.load('src/lib/licensingRequestLimit.ts');
  for(const ip of ['192.0.2.1','198.51.100.2']) await h.licensingNetworkLimit(new Request('http://localhost',{headers:{'x-forwarded-for':ip}}),'activate');
  assert.equal(local.limitCalls[0].p_subject_hash,local.limitCalls[1].p_subject_hash);
  const v=setup({vercel:'1'}),vh=v.load('src/lib/licensingRequestLimit.ts');
  for(const ip of ['', 'not-an-ip','192.0.2.1, 198.51.100.2']) {
    assert.equal((await vh.licensingNetworkLimit(new Request('http://localhost',{headers:{'x-forwarded-for':ip}}),'renew')).status,503);
  }
  assert.equal(v.limitCalls.length,0);
  for(const ip of ['192.0.2.1','198.51.100.2']) assert.equal(await vh.licensingNetworkLimit(new Request('http://localhost',{headers:{'x-forwarded-for':ip}}),'renew'),null);
  assert.notEqual(v.limitCalls[0].p_subject_hash,v.limitCalls[1].p_subject_hash);
  const prod=setup({nodeEnv:'production'});
  assert.equal((await prod.load('src/lib/licensingRequestLimit.ts').licensingNetworkLimit(new Request('http://localhost'),'activate')).status,503);
});

test('updated clients get seven days; legacy proofs renew during installer transition',async()=>{
  const s=setup(),helper=s.load('src/lib/signedLicense.ts'),now=Math.floor(Date.now()/1000);
  const old=helper.issueLicense({id:1,machine_id:'0123456789ABCDEF',credential_id:credentialId},[{slug:'tool-a'}],now,{},helper.LEGACY_OFFLINE_SECONDS);
  assert.equal(helper.verifyLicense(old).expiresAt-now,30*86400);
  const updated=await s.load(renewRoute).POST(s.request(renewalBody(old),null));
  const next=helper.verifyLicense((await updated.json()).license);
  assert.equal(next.expiresAt-next.issuedAt,7*86400);
  const legacy=await s.load(renewRoute).POST(s.request(renewalBody(old,{offlineDays:undefined}),null));
  const retained=helper.verifyLicense((await legacy.json()).license);
  assert.equal(retained.expiresAt-retained.issuedAt,30*86400);
  const activation=await s.load(activateRoute).POST(s.request({machineId:'0123456789ABCDEF',offlineDays:7},testKey));
  const active=helper.verifyLicense((await activation.json()).license);
  assert.equal(active.expiresAt-active.issuedAt,7*86400);
  for(const duration of [0,8*86400,31*86400]) assert.throws(()=>helper.issueLicense({id:1,machine_id:'0123456789ABCDEF',credential_id:credentialId},[{slug:'tool-a'}],now,{},duration));
});
