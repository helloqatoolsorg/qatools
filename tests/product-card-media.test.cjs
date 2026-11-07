const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,...globals,require:n=>n in mocks?mocks[n]:require(n)});return exports;}
function walk(node){if(!node)return [];if(Array.isArray(node))return node.flatMap(walk);if(typeof node!=='object')return [];return [node,...walk(node.props?.children)];}
function setup(){
 let frame;const components=new Map();
 const react={useState(initial){const {slots}=frame,n=frame.cursor++;if(!(n in slots))slots[n]=initial;return [slots[n],value=>{slots[n]=typeof value==='function'?value(slots[n]):value;}];},useCallback:fn=>fn};
 function render(type,props,key){
  if(typeof type!=='function')return {type,props,key};
  if(!components.has(type))components.set(type,new Map());const keys=components.get(type);
  if(!keys.has(key))keys.set(key,[]);const previous=frame;frame={slots:keys.get(key),cursor:0};
  try{return type(props);}finally{frame=previous;}
 }
 const Media=load('src/components/ProductCardMedia.tsx',{'react':react,'next/image':{__esModule:true,default:props=>({type:'img',props})},'./ProductCardMedia.css':{},'react/jsx-runtime':{jsx:render,jsxs:render}}).default;
 return {render:(props={})=>render(Media,{src:'/tool.gif',name:'Test tool',...props},'root')};
}
test('card preview reserves its frame and shows loading until the image succeeds',()=>{
 const s=setup(),initial=s.render({eager:true}),nodes=walk(initial),image=nodes.find(n=>n.type==='img');
 assert.match(initial.props.className,/media-frame product-card-media/);
 assert.ok(nodes.some(n=>n.props?.className==='product-card-media-placeholder'));
 assert.equal(nodes.find(n=>n.props?.['data-state']).props['aria-busy'],true);
 assert.equal(image.props.loading,'eager');assert.equal(image.props.unoptimized,true);assert.equal(image.props.src,'/tool.gif');
 image.props.onLoad();const ready=s.render();assert.equal(walk(ready).find(n=>n.props?.['data-state']).props['aria-busy'],false);
 assert.ok(!walk(ready).some(n=>n.props?.className==='product-card-media-placeholder'));
 assert.equal(walk(ready).find(n=>n.type==='img').props.src,'/tool.gif');
});
test('missing or failed previews have a readable fallback with no broken image element',()=>{
 const missing=setup().render({src:null});assert.ok(!walk(missing).some(n=>n.type==='img'));
 assert.equal(walk(missing).find(n=>n.props?.role==='img').props['aria-label'],'Test tool preview unavailable');
 const s=setup(),image=walk(s.render()).find(n=>n.type==='img');image.props.onError();
 const failed=s.render();assert.ok(!walk(failed).some(n=>n.type==='img'));assert.ok(walk(failed).some(n=>n.props?.role==='img'));
 const changed=s.render({src:'/new-tool.gif'});assert.equal(walk(changed).find(n=>n.props?.['data-state']).props['data-state'],'loading');
 assert.equal(walk(changed).find(n=>n.type==='img').props.src,'/new-tool.gif');
});
test('already cached success and failure are detected even if the load event happened before hydration',()=>{
 for(const width of [640,0]){
  const s=setup(),image=walk(s.render()).find(n=>n.type==='img');image.props.ref({complete:true,naturalWidth:width});
  const nodes=walk(s.render());assert.equal(nodes.some(n=>n.type==='img'),width>0);
  assert.ok(!nodes.some(n=>n.props?.className==='product-card-media-placeholder'));
 }
});
test('unready card images never launch a broken flying-cart preview',()=>{
 const animate=load('src/lib/cartAnimation.ts',{}, {window:{matchMedia:()=>({matches:false})},document:{getElementById:()=>({})}}).animateToCart;
 for(const image of [null,{complete:false,naturalWidth:640},{complete:true,naturalWidth:0}])assert.doesNotThrow(()=>animate(image));
});
