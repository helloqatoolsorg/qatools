const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Set,...globals,require:name=>name in mocks?mocks[name]:require(name)});return exports;}
const reconcile=load('src/lib/cartReconciliation.ts');
function hooks(){
 let cursor=0,dirty=true,renderFunction,result;const slots=[],pending=[];
 const changed=(old,deps)=>!old||deps.some((value,i)=>!Object.is(value,old.deps[i]));
 const react={createContext:()=>({Provider:'provider'}),useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};const slot=slots[i];slot.set??=value=>{const next=typeof value==='function'?value(slot.value):value;if(!Object.is(next,slot.value)){slot.value=next;dirty=true;}};return [slot.value,slot.set];},
  useMemo(fn,deps){const i=cursor++;if(changed(slots[i],deps))slots[i]={value:fn(),deps};return slots[i].value;},
  useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
  useEffect(fn,deps){const i=cursor++;if(changed(slots[i],deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
 return {react,mark(){dirty=true;},setRender(fn){renderFunction=fn;},get value(){return result;},async flush(){for(let i=0;i<30;i++){if(dirty){dirty=false;cursor=0;result=renderFunction();while(pending.length)pending.shift()();}await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!pending.length)return;}throw Error('Render did not settle');}};
}
const product=slug=>({id:1,slug,name:slug,subtitle:'',price_eur:10,category:null,complexity:null,product_media:[]});
function cart(initial){
 const h=hooks(),requests=[],pending=[],events={window:new Map(),document:new Map()},calls=[];
 const state={cartItems:initial,reconcileCart(checked,valid){calls.push({checked,valid});const next=reconcile.reconcileCartItems(state.cartItems,checked,valid);if(next!==state.cartItems){state.cartItems=next;h.mark();}}};
 const surface=name=>({addEventListener:(nameOfEvent,fn)=>events[name].set(nameOfEvent,fn),removeEventListener:nameOfEvent=>events[name].delete(nameOfEvent)});
 const db={from(table){assert.equal(table,'products');const request={};return {select(fields,options){assert.equal(options.count,'exact');return this;},in(key,slugs){request.slugs=[...slugs];return this;},eq(key,value){assert.equal(key,'published');assert.equal(value,true);return this;},then(resolve,reject){requests.push(request);return new Promise((done,fail)=>pending.push({done,fail})).then(resolve,reject);}};}};
 const hook=load('src/hooks/useCartProducts.ts',{'react':h.react,'@/lib/supabase':{supabase:db},'@/context/QAToolsState':{useQAToolsState:()=>state}},{window:surface('window'),document:{...surface('document'),visibilityState:'visible'}}).useCartProducts;
 h.setRender(hook);
 return {h,state,requests,calls,async reply(data,count=data.length){pending.shift().done({data,error:null,count});await h.flush();},async fail(){pending.shift().fail(Error('offline'));await h.flush();},async change(items){state.cartItems=items;h.mark();await h.flush();},async focus(){events.window.get('focus')();await h.flush();}};
}

test('restored duplicates and deleted products are repaired in shared state and local storage',async()=>{
 const h=hooks(),stored=new Map([['qatools_cart',JSON.stringify(['deleted','valid','valid'])]]),events=new Map();
 const Provider=load('src/context/QAToolsState.tsx',{'react':h.react,'react/jsx-runtime':{jsx:(type,props)=>({type,props})},'@/context/AuthContext':{useAuth:()=>({user:null,loading:false})},'@/lib/supabase':{supabase:{}},'@/lib/cartReconciliation':reconcile},{localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},window:{addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)}}).QAToolsStateProvider;
 h.setRender(()=>Provider({children:null}));await h.flush();assert.equal(h.value.props.value.cartCount,2);
 h.value.props.value.reconcileCart(['deleted','valid'],['valid']);await h.flush();assert.equal(h.value.props.value.cartCount,1);assert.deepEqual(JSON.parse(stored.get('qatools_cart')),['valid']);
 stored.set('qatools_cart',JSON.stringify(['deleted-again','valid']));events.get('storage')({key:'qatools_cart'});await h.flush();
 h.value.props.value.addToCart('new-addition');await h.flush();h.value.props.value.reconcileCart(['deleted-again','valid'],['valid']);await h.flush();
 assert.deepEqual(JSON.parse(stored.get('qatools_cart')),['valid','new-addition']);
});

test('successful catalogue reads remove ghost slugs and keep cart products/count aligned',async()=>{
 const s=cart(['deleted','valid']);await s.h.flush();await s.reply([product('valid')]);
 assert.deepEqual(Array.from(s.state.cartItems),['valid']);assert.equal(s.h.value.products.length,1);assert.equal(s.h.value.total,10);
 const empty=cart(['deleted']);await empty.h.flush();await empty.reply([]);assert.equal(empty.state.cartItems.length,0);assert.equal(empty.h.value.products.length,0);assert.equal(empty.h.value.total,0);
});

test('network failures and incomplete result sets never erase saved items',async()=>{
 const failed=cart(['valid']);await failed.h.flush();await failed.fail();assert.deepEqual(failed.state.cartItems,['valid']);assert.equal(failed.calls.length,0);assert.ok(failed.h.value.error);
 const partial=cart(['one','two']);await partial.h.flush();await partial.reply([product('one')],2);assert.deepEqual(partial.state.cartItems,['one','two']);assert.equal(partial.calls.length,0);assert.ok(partial.h.value.error);
});

test('late results cannot restore removed items or erase additions from newer cart state',async()=>{
 const s=cart(['old']);await s.h.flush();await s.change(['new']);await s.reply([]);
 assert.deepEqual(s.state.cartItems,['new']);assert.equal(s.calls.length,0);
 await s.reply([product('new')]);assert.deepEqual(s.state.cartItems,['new']);assert.equal(s.h.value.products[0].slug,'new');
 await s.change([]);assert.equal(s.h.value.products.length,0);
});

test('returning to the tab revalidates products removed while the page was open',async()=>{
 const s=cart(['valid']);await s.h.flush();await s.reply([product('valid')]);await s.focus();await s.reply([]);
 assert.equal(s.state.cartItems.length,0);assert.equal(s.h.value.products.length,0);
});
