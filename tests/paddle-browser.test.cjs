const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const txn='txn_'+'a'.repeat(26),price='pri_01m41bkp4f0fxgb9cfm37n5p4b';
function load(file,context){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:mod.exports,...context});return mod.exports;}
const matching={name:'checkout.loaded',data:{transaction_id:txn,currency_code:'EUR',totals:{total:5,discount:0,credit:0},items:[{price_id:price,quantity:1}]}};
test('displayed checkout must retain the transaction, EUR5 total and quantity one',()=>{
 const {checkoutMatchesExpectedPrice:check}=load('src/lib/paddleBrowser.ts',{});
 assert.equal(check(matching,txn),true);
 for(const data of [{...matching.data,transaction_id:'other'},{...matching.data,currency_code:'USD'},{...matching.data,totals:{total:6,discount:0,credit:0}},{...matching.data,totals:{total:5,discount:1,credit:0}},{...matching.data,totals:{total:5,discount:0,credit:1}},{...matching.data,items:[{price_id:price,quantity:2}]},{...matching.data,items:[]},{}])assert.equal(check({data},txn),false);
});
test('SDK initializes once in sandbox and stops notifying removed listeners',async()=>{
 let initializes=0,callback,environment;
 const paddle={Environment:{set:value=>environment=value},Initialize:opts=>{initializes++;callback=opts.eventCallback;},Checkout:{}};
 const api=load('src/lib/paddleBrowser.ts',{window:{Paddle:paddle}});
 await assert.rejects(api.loadSandboxPaddle('live_invalid'));assert.equal(initializes,0);
 await Promise.all([api.loadSandboxPaddle('test_synthetic'),api.loadSandboxPaddle('test_synthetic')]);assert.equal(initializes,1);assert.equal(environment,'sandbox');
 let events=0;const remove=api.subscribeCheckout(()=>events++);callback(matching);assert.equal(events,1);remove();callback(matching);assert.equal(events,1);
 await assert.rejects(api.loadSandboxPaddle('test_other'));assert.equal(initializes,1);
});
function component(){const refs=[],effects=[],states=[],writes=[];let callback,refreshes=0,closed=0;
 const react={useRef:value=>{const r={current:value};refs.push(r);return r;},useState:value=>{const index=states.length;states.push(value);return [value,next=>{states[index]=next;}];},useEffect:fn=>effects.push(fn)};
 const mod=load('src/components/SandboxCheckout.tsx',{AbortSignal,require:name=>{
  if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>typeof type==='function'?type(props):null,jsxs:()=>null};
  if(name==='@/context/AuthContext')return {useAuth:()=>({user:{id:'owner'}})};
  if(name==='@/context/QAToolsState')return {useQAToolsState:()=>({refreshPurchases:()=>refreshes++,purchasedItems:[],removeFromCart:()=>writes.push('cart'),toggleCart:()=>writes.push('cart')})};
  if(name==='@/lib/supabase')return {supabase:{}};
  if(name==='@/lib/paddleBrowser')return {subscribeCheckout:fn=>{callback=fn;return ()=>{};},checkoutMatchesExpectedPrice:(e,id)=>e.data?.transaction_id===id&&e.data?.totals?.total===5};
  throw Error(name);
 }});
 mod.default({products:[{id:1,slug:'qafit01',price_eur:5}],disabled:false});
 refs[0].current=txn;refs[2].current='owner';refs[4].current={Checkout:{close:()=>closed++}};effects[1]();
 return {event:e=>callback(e),refs,states,writes,get refreshes(){return refreshes;},get closed(){return closed;}};
}
test('browser completion only requests ownership refresh and ignores other transactions/accounts',()=>{
 const c=component();c.event({name:'checkout.completed',data:{transaction_id:'other'}});assert.equal(c.refreshes,0);
 c.event({name:'checkout.completed',data:{transaction_id:txn}});assert.equal(c.refreshes,1);assert.equal(c.states[2],true);assert.deepEqual(c.writes,[]);
 c.refs[3].current='different-account';c.event({name:'checkout.completed',data:{transaction_id:txn}});assert.equal(c.refreshes,1);
});
test('changed display total closes checkout without starting fulfillment or altering ownership',()=>{
 const c=component();c.event({...matching,data:{...matching.data,totals:{total:6}}});assert.equal(c.closed,1);assert.equal(c.refs[0].current,null);assert.equal(c.refreshes,0);assert.deepEqual(c.writes,[]);assert.match(c.states[4],/price changed/);
});
