const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
function load(file,mocks,globals={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,URL,Response,Buffer,AbortSignal,process:{env:globals.env ?? {},cwd:()=>process.cwd()},...globals,require:n=>n in mocks?mocks[n]:require(n)});return exports;
}
test('brand never renders the default image before the saved logo resolves',()=>{
 for(const url of [null,'https://storage.test/current-logo.png']){
  const Brand=load('src/components/BrandLogo.tsx',{'@/context/SiteBranding':{defaultLogo:'/assets/qatools_logo.png',useSiteBranding:()=>({url})},'next/image':function Image({unoptimized,...props}){return React.createElement('img',props);}}).default;
  const html=renderToStaticMarkup(React.createElement(Brand));
  if(!url){assert.match(html,/brand-logo-placeholder/);assert.ok(!html.includes('<img'));}
  else{assert.match(html,/src="https:\/\/storage.test\/current-logo.png"/);assert.ok(!html.includes('/assets/qatools_logo.png'));}
 }
});
test('all heart states use the shared vector outline; logged-in account alone is green',()=>{
 for(const signedIn of [false,true]){
  const Icon=load('src/components/OutlineIcon.tsx',{'@/context/AuthContext':{useAuth:()=>({user:signedIn?{id:'user'}:null})}}).default;
  const heart=renderToStaticMarkup(React.createElement(Icon,{kind:'heart'}));assert.match(heart,/<svg/);assert.match(heart,/<path/);assert.match(heart,/fill="none"/);assert.ok(!heart.includes('account-signed-in'));
  const account=renderToStaticMarkup(React.createElement(Icon,{kind:'account'}));assert.equal(account.includes('account-signed-in'),signedIn);
 }
});
const sharp=require('sharp');
const wide=sharp({create:{width:200,height:100,channels:4,background:'white'}}).composite([{input:Buffer.from('<svg width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'),left:80,top:30}]).png().toBuffer();
function iconRoute(options={}){
 let reads=0,fetches=0;
 const client={from(table){assert.equal(table,'site_branding');return {select(){return this;},eq(){return this;},async single(){reads++;if(options.reject)throw Error('private failure');return {data:{logo_path:options.path ?? null},error:options.error?{}:null};}};},storage:{from(bucket){assert.equal(bucket,'product-media');return {getPublicUrl(path){return {data:{publicUrl:'https://storage.test/'+path}};}};}}};
 return {route:load('src/app/api/site-icon/route.ts',{'@supabase/supabase-js':{createClient:()=>client},'node:fs/promises':{readFile:async()=>{if(options.missingDefault)throw Error('missing');return await wide;}}},{env:options.noEnv?{}:{NEXT_PUBLIC_SUPABASE_URL:'https://storage.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-key'},fetch:async()=>{fetches++;if(options.fetchFailure)throw Error('network');return new Response(await wide);}}),reads:()=>reads,fetches:()=>fetches};
}
async function assertSquare(response){
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'no-store');
 const bytes=Buffer.from(await response.arrayBuffer()),metadata=await sharp(bytes).metadata();assert.equal(metadata.width,64);assert.equal(metadata.height,64);
 const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});let minX=64,maxX=-1,minY=64,maxY=-1;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*info.channels;if(data[i]>200 && data[i+1]<40 && data[i+2]<40){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
 // A square in the wide source must stay square: a stretched icon would make it a tall rectangle.
 assert.ok(maxX>=minX);assert.ok(Math.abs((maxX-minX)-(maxY-minY))<=1);
}
test('tab icon crops to a square while preserving geometry and refreshes without stale caching',async()=>{
 const path='branding/logos/11111111-1111-4111-8111-111111111111.png',s=iconRoute({path});
 await assertSquare(await s.route.GET());assert.equal(s.reads(),1);assert.equal(s.fetches(),1);
});
test('default, malformed paths and outages also produce a proportional square icon',async()=>{
 for(const options of [{},{path:'https://untrusted.test/icon.svg'},{error:true},{reject:true},{noEnv:true},{path:'branding/logos/11111111-1111-4111-8111-111111111111.png',fetchFailure:true}]){
  const s=iconRoute(options);await assertSquare(await s.route.GET());
  if(options.path==='https://untrusted.test/icon.svg')assert.equal(s.fetches(),0);
 }
 assert.equal((await iconRoute({noEnv:true,missingDefault:true}).route.GET()).status,503);
});
