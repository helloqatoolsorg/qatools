const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({loggedIn=false,denied=false}={}) {
 const slots=[],effects=[],events=[],requests=[],links=[],listeners=new Map();let cursor=0,user=loggedIn?{id:'buyer'}:null,session=loggedIn?{access_token:'synthetic'}:null;
 const react={useRef(value){const i=cursor++;return slots[i]??=( {current:value} );},useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/ProductDownload.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
 window:{addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),dispatchEvent:event=>events.push(event)},document:{body:{appendChild(){}},createElement:()=>({click(){links.push(this.href);},remove(){}})},
 fetch:async(url,options)=>{requests.push({url,options});return {ok:!denied,json:async()=>denied?{error:'Confirm your email first.'}:{url:'https://example.invalid/signed-download'}};},
 require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name==='@/context/AuthContext')return {useAuth:()=>({user,loading:false})};if(name==='@/lib/supabase')return {supabase:{auth:{getSession:async()=>({data:{session},error:null})}}};throw Error(name);}
 });
 function render(){cursor=0;effects.length=0;const tree=exports.default({productId:42});for(const effect of effects)effect();return tree;}
 return {render,events,requests,links,cancel(){listeners.get('qatools:login-cancelled')?.();},login(){user={id:'buyer'};session={access_token:'synthetic'};},click(tree){tree.props.children[0].props.onClick();}};
}
test('logged-out download opens login and resumes exactly once after authentication',async()=>{
 const s=setup();s.click(s.render());await tick();assert.equal(s.events[0].type,'qatools:login');assert.equal(s.requests.length,0);
 s.login();s.render();await tick();assert.equal(s.requests.length,1);assert.equal(JSON.parse(s.requests[0].options.body).productId,42);assert.equal(s.requests[0].options.headers.Authorization,'Bearer synthetic');assert.equal(s.links.length,1);
 s.render();await tick();assert.equal(s.requests.length,1);
});
test('download double clicks produce one request and server denials never start a download',async()=>{
 const s=setup({loggedIn:true});const tree=s.render();s.click(tree);s.click(tree);await tick();assert.equal(s.requests.length,1);assert.equal(s.links.length,1);
 const blocked=setup({loggedIn:true,denied:true});blocked.click(blocked.render());await tick();assert.equal(blocked.links.length,0);assert.equal(blocked.render().props.children[1].props.role,'alert');
});
test('cancelling login cancels the queued download',async()=>{
 const s=setup();s.click(s.render());await tick();s.cancel();s.login();s.render();await tick();assert.equal(s.requests.length,0);
});
