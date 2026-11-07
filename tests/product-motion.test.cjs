const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks,globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...globals,require:name=>name in mocks?mocks[name]:require(name)});return exports;
}
const gesture=load('src/lib/galleryGesture.ts',{});
test('swiping navigates horizontally, without treating taps or vertical scrolling as navigation',()=>{
 const swipe=gesture.gallerySwipeDirection,start={x:100,y:100};
 assert.equal(swipe(start,{x:20,y:105}),1);assert.equal(swipe(start,{x:180,y:95}),-1);
 for(const end of [{x:70,y:102},{x:60,y:220},{x:100,y:100},{x:150,y:150}])assert.equal(swipe(start,end),0);
});
function walk(node){if(!node)return [];if(Array.isArray(node))return node.flatMap(walk);if(typeof node!=='object')return [];return [node,...walk(node.props?.children)];}
function gallery(){
 const slots=[];let cursor=0;
 const react={useRef:v=>{const n=cursor++;return slots[n]??={current:v};},useState:v=>{const n=cursor++;if(!(n in slots))slots[n]=v;return [slots[n],next=>{slots[n]=typeof next==='function'?next(slots[n]):next;}];}};
 const component=load('src/components/ProductGallery.tsx',{'react':react,'./ProductGallery.css':{},'@/lib/galleryGesture':gesture,'react/jsx-runtime':{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key})}}).default;
 const images=[1,2,3].map(id=>({id,src:`/preview-${id}.gif`}));
 return {render(){cursor=0;return component({images,name:'Test tool'});},pointer(x,y,options={}){return {pointerType:'touch',isPrimary:true,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null},currentTarget:{setPointerCapture(){}},...options};}};
}
function selected(tree){return walk(tree).find(node=>node.props?.id==='productImage').props.src;}
function stage(tree){return walk(tree).find(node=>node.props?.className==='product-media product-gallery-stage');}
test('gallery keeps GIF sources and keys stable while rapid navigation wraps correctly',()=>{
 const s=gallery(),first=s.render();
 const layers=tree=>walk(tree).filter(node=>node.type==='img'&&node.props.className?.includes('product-gallery-image')).map(node=>[node.key,node.props.src]);
 const root=first;let prevented=0;
 root.props.onKeyDown({key:'ArrowRight',preventDefault(){prevented++;}});root.props.onKeyDown({key:'ArrowRight',preventDefault(){prevented++;}});
 const next=s.render();assert.equal(selected(next),'/preview-3.gif');assert.deepEqual(layers(next),layers(first));assert.equal(prevented,2);
 root.props.onKeyDown({key:'ArrowRight',preventDefault(){}});assert.equal(selected(s.render()),'/preview-1.gif');
 assert.equal(walk(s.render()).filter(node=>node.props?.id==='productImage').length,1);
});
test('gallery touch cancellation, multiple fingers and arrow taps never produce an accidental swipe',()=>{
 const s=gallery(),pane=stage(s.render()).props;
 pane.onPointerDown(s.pointer(180,100));pane.onPointerUp(s.pointer(60,110));assert.equal(selected(s.render()),'/preview-2.gif');
 pane.onPointerDown(s.pointer(180,100));pane.onPointerCancel();pane.onPointerUp(s.pointer(60,110));assert.equal(selected(s.render()),'/preview-2.gif');
 pane.onPointerDown(s.pointer(180,100));pane.onPointerDown(s.pointer(170,100,{pointerId:2,isPrimary:false}));pane.onPointerUp(s.pointer(60,110));assert.equal(selected(s.render()),'/preview-2.gif');
 pane.onPointerDown(s.pointer(180,100,{target:{closest:()=>({})}}));pane.onPointerUp(s.pointer(60,110));assert.equal(selected(s.render()),'/preview-2.gif');
});
function gridHarness(reduced=false){
 const slots=[],layouts=[],effects=[],listeners=new Map(),calls=[];let cursor=0,mounted=false,cleanup;
 const react={useRef:v=>{const n=cursor++;return slots[n]??={current:v};},useLayoutEffect:fn=>layouts.push(fn),useEffect:fn=>effects.push(fn)};
 const window={scrollX:0,scrollY:400,matchMedia:()=>({matches:reduced}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const hook=load('src/hooks/useProductGridMotion.ts',{'react':react},{window}).useProductGridMotion;
 function card(id,left,top,animated=true){const value={id,dataset:{id:String(id)},getBoundingClientRect:()=>({left,top})};if(animated)value.animate=(frames,options)=>{const result={cancelled:false,cancel(){this.cancelled=true;}};calls.push({id,frames,options,result});return result;};return value;}
 return {calls,listeners,card,render(cards){cursor=0;layouts.length=0;effects.length=0;const ref=hook(cards);ref.current={querySelectorAll:()=>cards};layouts.forEach(fn=>fn());if(!mounted){cleanup=effects[0]();mounted=true;}},close(){cleanup();},window};
}
test('filtered grids animate retained/new cards, leave the initial view still, and cancel obsolete animations',()=>{
 const s=gridHarness();s.render([s.card(1,0,0),s.card(2,200,0)]);assert.equal(s.calls.length,0);
 s.render([s.card(2,0,0),s.card(3,200,0)]);assert.equal(s.calls.length,2);assert.equal(s.calls[0].id,2);assert.match(s.calls[0].frames[0].transform,/200px/);assert.equal(s.calls[1].frames[0].opacity,0);
 s.render([s.card(3,0,0)]);assert.equal(s.calls[0].result.cancelled,true);assert.equal(s.calls[1].result.cancelled,true);
 s.close();assert.equal(s.calls.at(-1).result.cancelled,true);assert.equal(s.listeners.size,0);
});
test('reduced-motion and older browsers keep filters functional without animations or scroll changes',()=>{
 for(const reduced of [false,true]){const s=gridHarness(reduced);s.render([s.card(1,0,0,!reduced?false:true)]);s.render([s.card(2,0,0,!reduced?false:true)]);assert.equal(s.calls.length,0);assert.equal(s.window.scrollY,400);s.close();}
});
test('resizing cancels movement and refreshes measured positions',()=>{
 const s=gridHarness();s.render([s.card(1,0,0),s.card(2,200,0)]);s.render([s.card(2,0,0)]);assert.equal(s.calls.length,1);
 s.listeners.get('resize')();assert.equal(s.calls[0].result.cancelled,true);s.close();
});
