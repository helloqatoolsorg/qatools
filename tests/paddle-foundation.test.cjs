const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,env={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,Buffer,process:{env},require(name){if(name==='server-only')return {};if(name==='node:crypto')return crypto;throw Error(name);}});return mod.exports;}
const verifier=load('src/lib/paddleWebhook.ts'),now=1791000000,secret='synthetic-test-secret-only',body=Buffer.from('{"message":"qatools € ✓","data":{"id":"synthetic"}}');
const signature=(bytes=body,key=secret,time=now)=>`ts=${time};h1=${crypto.createHmac('sha256',key).update(String(time)+':').update(bytes).digest('hex')}`;
test('raw Unicode bytes verify and whitespace/order transformations do not',()=>{
 assert.doesNotThrow(()=>verifier.verifyPaddleSignature(body,signature(),secret,now));
 for(const bytes of [Buffer.concat([body,Buffer.from(' ')]),Buffer.from('{"data":{"id":"synthetic"},"message":"qatools € ✓"}'),Buffer.from('{}')])assert.throws(()=>verifier.verifyPaddleSignature(bytes,signature(),secret,now));
 assert.throws(()=>verifier.verifyPaddleSignature(body,signature(body,'another-secret'),secret,now));
});
test('timestamp window rejects old/future signatures and accepts exact boundaries',()=>{
 for(const delta of [-5,0,5])assert.doesNotThrow(()=>verifier.verifyPaddleSignature(body,signature(body,secret,now+delta),secret,now));
 for(const delta of [-6,6,-1000,1000])assert.throws(()=>verifier.verifyPaddleSignature(body,signature(body,secret,now+delta),secret,now));
});
test('multiple rotation signatures accept any correct h1; malformed headers reject',()=>{
 const valid=signature(),bad='0'.repeat(64);assert.doesNotThrow(()=>verifier.verifyPaddleSignature(body,valid+';h1='+bad,secret,now));assert.doesNotThrow(()=>verifier.verifyPaddleSignature(body,`ts=${now};h1=${bad};`+valid.split(';')[1],secret,now));
 for(const header of [null,'','ts=NaN;h1='+bad,'ts=-1;h1='+bad,'ts=01;h1='+bad,valid+';ts='+now,valid+';h1=x',valid+';h2='+bad,'ts='+now,'h1='+bad,valid+';','x'.repeat(2049),valid+';'+Array(8).fill('h1='+bad).join(';')])assert.throws(()=>verifier.verifyPaddleSignature(body,header,secret,now));
});
test('configuration failures and signature errors disclose neither secrets nor payload',()=>{
 for(const config of ['',secret+' ', 'x'.repeat(513)])assert.throws(()=>verifier.verifyPaddleSignature(body,signature(),config,now),error=>!error.message.includes(secret)&&!error.message.includes('synthetic'));
 assert.throws(()=>verifier.verifyPaddleSignature(Buffer.alloc(0),signature(),secret,now));assert.throws(()=>verifier.verifyPaddleSignature(Buffer.alloc(verifier.MAX_PADDLE_WEBHOOK_BYTES+1),signature(),secret,now));
});
test('streamed reads preserve raw bytes, enforce size despite false Content-Length, and release locks',async()=>{
 const request=new Request('http://localhost/test',{method:'POST',body,headers:{'Content-Length':'1'}});const read=await verifier.readPaddleBody(request);assert.deepEqual(read,body);assert.equal(request.body.locked,false);
 let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(verifier.MAX_PADDLE_WEBHOOK_BYTES));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
 const overflow=new Request('http://localhost/test',{method:'POST',body:stream,duplex:'half',headers:{'Content-Length':'1'}});await assert.rejects(verifier.readPaddleBody(overflow));assert.equal(cancelled,true);assert.equal(overflow.body.locked,false);
 await assert.rejects(verifier.readPaddleBody(new Request('http://localhost/test')));
});
const config={PADDLE_ENVIRONMENT:'sandbox',PADDLE_API_KEY:'pdl_sdbx_apikey_synthetic',PADDLE_WEBHOOK_SECRET:secret,NEXT_PUBLIC_PADDLE_CLIENT_TOKEN:'test_synthetic'};
test('sandbox config returns only the fixed sandbox API host',()=>{const result=load('src/lib/paddleSandbox.ts',config).paddleSandboxConfig();assert.equal(result.environment,'sandbox');assert.equal(result.apiBase,'https://sandbox-api.paddle.com');});
test('missing, mixed/live and whitespace credentials fail closed',()=>{
 for(const name of Object.keys(config))assert.throws(()=>load('src/lib/paddleSandbox.ts',{...config,[name]:''}).paddleSandboxConfig());
 for(const patch of [{PADDLE_ENVIRONMENT:'live'},{PADDLE_API_KEY:'pdl_live_apikey_synthetic'},{NEXT_PUBLIC_PADDLE_CLIENT_TOKEN:'live_synthetic'},{PADDLE_API_KEY:config.PADDLE_API_KEY+' '},{PADDLE_WEBHOOK_SECRET:secret+'\n'}])assert.throws(()=>load('src/lib/paddleSandbox.ts',{...config,...patch}).paddleSandboxConfig(),error=>!error.message.includes(secret)&&!error.message.includes('synthetic'));
});
