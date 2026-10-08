const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
function load(file,mocks,globals={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,URL,Response,process:{env:globals.env ?? {}},...globals,require:n=>n in mocks?mocks[n]:require(n)});return exports;
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
function iconRoute(options={}){
 let reads=0;
 const client={from(table){assert.equal(table,'site_branding');return {select(){return this;},eq(){return this;},async single(){reads++;if(options.reject)throw Error('private failure');return {data:{logo_path:options.path ?? null},error:options.error?{}:null};}};},storage:{from(bucket){assert.equal(bucket,'product-media');return {getPublicUrl(path){return {data:{publicUrl:'https://storage.test/'+path}};}};}}};
 return {route:load('src/app/api/site-icon/route.ts',{'@supabase/supabase-js':{createClient:()=>client}},{env:options.noEnv?{}:{NEXT_PUBLIC_SUPABASE_URL:'https://storage.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-key'}}),reads:()=>reads};
}
test('public tab icon follows only the allowed logo path and is not cached as an old redirect',async()=>{
 const path='branding/logos/11111111-1111-4111-8111-111111111111.png',s=iconRoute({path}),res=await s.route.GET(new Request('https://www.qatools.org/api/site-icon'));
 assert.equal(res.status,302);assert.equal(res.headers.get('location'),'https://storage.test/'+path);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(s.reads(),1);
});
test('default, malformed paths and settings outages safely use the packaged tab icon',async()=>{
 for(const options of [{},{path:'https://untrusted.test/icon.svg'},{error:true},{reject:true},{noEnv:true}]){
  const s=iconRoute(options),res=await s.route.GET(new Request('https://www.qatools.org/api/site-icon'));
  assert.equal(res.headers.get('location'),'https://www.qatools.org/assets/qatools_logo.png');
 }
});
