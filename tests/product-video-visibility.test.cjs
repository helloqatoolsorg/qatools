const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n in mocks?mocks[n]:require(n),...globals});return exports;}
function observerHarness(fallback=false){const observers=[],listeners=new Map(),frames=new Map();let sequence=0;
 class Observer{constructor(fn,options){this.fn=fn;this.options=options;this.targets=new Set();observers.push(this);}observe(v){this.targets.add(v);}unobserve(v){this.targets.delete(v);}disconnect(){this.disconnected=true;this.targets.clear();}}
 const window={innerHeight:1080,innerWidth:1920,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)};
 const helper=load('src/components/productVideoVisibility.ts',{}, {window,IntersectionObserver:fallback?undefined:Observer});return {helper,observers,listeners,frames,flush(){for(const [id,fn]of frames){frames.delete(id);fn();}}};
}
test('50 previews share two observers; only near/visible targets receive loading/playback callbacks',()=>{
 const s=observerHarness(),loaded=[],visible=[],videos=Array.from({length:50},(_,id)=>({id})),stop=videos.map(video=>s.helper.observeProductVideo(video,{near:()=>loaded.push(video.id),visible:value=>visible.push([video.id,value])}));
 assert.equal(s.observers.length,2);assert.equal(s.observers[0].options.rootMargin,'600px 0px');assert.equal(s.observers[0].targets.size,50);assert.equal(s.listeners.size,0);
 s.observers[0].fn(videos.slice(0,9).map(target=>({target,isIntersecting:true})));s.observers[1].fn(videos.slice(0,6).map(target=>({target,isIntersecting:true,intersectionRatio:1})));
 assert.deepEqual(loaded,[0,1,2,3,4,5,6,7,8]);assert.equal(visible.length,6);assert.equal(s.observers[0].targets.size,41);
 stop[0]();s.observers[1].fn([{target:videos[0],isIntersecting:true,intersectionRatio:1}]);assert.equal(visible.length,6);stop.slice(1).forEach(fn=>fn());assert.ok(s.observers.every(o=>o.disconnected));
});
test('older browsers use one shared, frame-throttled fallback and remove its listeners on cleanup',()=>{
 const s=observerHarness(true),loaded=[],visible=[],stops=[];let scroll=0;
 for(let id=0;id<50;id++){const video={getBoundingClientRect:()=>({top:Math.floor(id/3)*550-scroll,bottom:Math.floor(id/3)*550+350-scroll,left:id%3*600,right:id%3*600+580})};stops.push(s.helper.observeProductVideo(video,{near:()=>loaded.push(id),visible:value=>{if(value)visible.push(id);}}));}
 assert.equal(s.frames.size,1);assert.equal(s.listeners.size,2);s.flush();assert.ok(loaded.length<15);assert.equal(visible.length,6);loaded.length=0;visible.length=0;scroll=2500;s.listeners.get('scroll')();s.listeners.get('scroll')();assert.equal(s.frames.size,1);s.flush();assert.ok(visible.every(id=>id>=12));stops.forEach(fn=>fn());assert.equal(s.listeners.size,0);assert.equal(s.frames.size,0);
});
function component({lazy=true,src='/clip.webm',deny=false,external=false}={}){
 const effects=[],events=new Map(),docEvents=new Map(),attributes=new Map(),calls={loads:0,plays:0,pauses:0,stopped:0};let callbacks;
 const video={paused:true,preload:'none',getAttribute:k=>attributes.get(k)??null,removeAttribute:k=>attributes.delete(k),set src(value){attributes.set('src',value);},load(){calls.loads++;},play(){calls.plays++;if(!deny)this.paused=false;return deny?Promise.reject(Error('Autoplay blocked')):Promise.resolve();},pause(){calls.pauses++;this.paused=true;},addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k)};
 const document={visibilityState:'visible',addEventListener:(k,fn)=>docEvents.set(k,fn),removeEventListener:k=>docEvents.delete(k)};
 const ref={current:null};const Component=load('src/components/LoopingProductVideo.tsx',{react:{useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)},'./productVideoVisibility':{observeProductVideo:(element,handlers)=>{assert.equal(element,video);callbacks=handlers;return()=>{calls.stopped++;};}},'react/jsx-runtime':{jsx:(type,props)=>({type,props})}},{document}).default;
 const tree=Component({lazy,src:external?undefined:src,ref:external?element=>{element.src='blob:recovery';}:ref});tree.props.ref(video);const cleanup=effects[0]();
 return {tree,video,calls,ref,callbacks,events,docEvents,cleanup,visibility(value){document.visibilityState=value;docEvents.get('visibilitychange')();}};
}
test('lazy source stays detached until nearby, loads once and only plays while visible in an active tab',async()=>{
 const s=component();assert.equal(s.tree.props.src,undefined);assert.equal(s.tree.props.autoPlay,false);assert.equal(s.tree.props.preload,'none');assert.equal(s.calls.loads,0);assert.equal(s.ref.current,s.video);
 s.callbacks.near();s.callbacks.near();assert.equal(s.calls.loads,1);assert.equal(s.video.getAttribute('src'),'/clip.webm');assert.equal(s.calls.plays,0);
 s.callbacks.visible(true);assert.equal(s.calls.plays,1);s.visibility('hidden');assert.equal(s.video.paused,true);s.visibility('visible');assert.equal(s.calls.plays,2);s.callbacks.visible(false);assert.equal(s.video.paused,true);s.callbacks.visible(true);assert.equal(s.calls.loads,1);assert.equal(s.calls.plays,3);
 s.cleanup();assert.equal(s.calls.stopped,1);assert.equal(s.video.getAttribute('src'),null);assert.equal(s.docEvents.size,0);assert.equal(s.events.size,0);s.callbacks.visible(true);assert.equal(s.calls.plays,3);
});
test('eager previews load promptly but still wait for visibility; rejected autoplay does not become a file error',async()=>{
 const eager=component({lazy:false});assert.equal(eager.calls.loads,1);assert.equal(eager.calls.plays,0);eager.callbacks.visible(true);assert.equal(eager.calls.plays,1);eager.cleanup();
 const denied=component({deny:true});denied.callbacks.near();denied.callbacks.visible(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(denied.video.getAttribute('src'),'/clip.webm');denied.cleanup();
});
test('externally managed recovery blob sources keep their ref-owned lifetime',()=>{const s=component({external:true});assert.equal(s.calls.loads,0);s.callbacks.visible(true);assert.equal(s.calls.plays,1);s.cleanup();assert.equal(s.video.getAttribute('src'),'blob:recovery');});
