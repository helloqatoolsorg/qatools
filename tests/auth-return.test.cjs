const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,URL,URLSearchParams,...globals,require:name=>name in mocks?mocks[name]:require(name)});return exports;}
const urls=load('src/lib/authReturn.ts'),origin='https://www.qatools.org';
test('return paths preserve the product, filters and anchor while rejecting external URLs and auth loops',()=>{
 for(const path of ['/product?id=qa_grid','/?type=shelf_tool&type=bundle#products','/cart','/install'])assert.equal(urls.safeAuthReturnTo(path,origin),path);
 for(const path of ['https://evil.example/','//evil.example/','/\\evil.example/','/%2f%2fevil.example','/%5cevil.example','javascript:alert(1)','/user','/user?returnTo=/cart','/reset-password','/%zz'])assert.equal(urls.safeAuthReturnTo(path,origin),null,path);
 const link=urls.authModeLink('signup',origin,'/?type=shelf_tool#products');
 const parsed=new URL(link,origin);assert.equal(parsed.pathname,'/user');assert.equal(parsed.searchParams.get('returnTo'),'/?type=shelf_tool#products');
 const login=new URL(urls.authModeLink('login',origin,link),origin);assert.equal(login.searchParams.get('returnTo'),'/?type=shelf_tool#products');assert.equal(login.searchParams.has('mode'),false);
});

test('plain login links open the popup and successful login does not navigate away',async()=>{
 let index=0;const slots=[],effects=[],events={document:new Map(),window:new Map()},navigations=[];
 const auth={user:null,loading:false,signIn:async()=>({error:null})};
 const react={useState:initial=>{const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef:initial=>{const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect:fn=>effects.push(fn)};
 const surface=name=>({addEventListener:(key,fn)=>events[name].set(key,fn),removeEventListener:key=>events[name].delete(key)});
 const browser={...surface('window'),innerHeight:800,innerWidth:1000,dispatchEvent(){},location:{origin,pathname:'/product',search:'?id=qa_grid',hash:'#details',assign:value=>navigations.push(value),replace:value=>navigations.push(value)}};
 const jsx=(type,props)=>({type,props});const Menu=load('src/components/UserMenu.tsx',{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/context/AuthContext':{useAuth:()=>auth},'@/lib/authReturn':urls},{window:browser,document:surface('document'),Event:class{}}).default;
 const render=()=>{index=0;effects.length=0;const tree=Menu();effects.forEach(fn=>fn());return tree;};
 function nodes(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
 assert.equal(render(),null);
 let prevented=false;const anchor={target:'',hasAttribute:()=>false,getBoundingClientRect:()=>({bottom:100,right:900})};
 events.document.get('click')({button:0,target:{closest:selector=>{assert.ok(selector.includes('a[href="/user"]'));return anchor;}},preventDefault(){prevented=true;},stopPropagation(){}});
 const tree=render();assert.ok(prevented);assert.ok(tree);
 const fields=nodes(tree).filter(n=>n.type==='input');fields.find(n=>n.props.type==='email').props.onChange({target:{value:'customer@example.com'}});fields.find(n=>n.props.type==='password').props.onChange({target:{value:'password'}});
 await nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(navigations,[]);
 const signup=nodes(render()).find(n=>n.type==='a'&&n.props.href.includes('mode=signup'));
 assert.equal(new URL(signup.props.href,origin).searchParams.get('returnTo'),'/product?id=qa_grid#details');
 auth.user={id:'user'};render();assert.equal(render(),null);assert.deepEqual(navigations,[]);
});

test('full-page login returns to its origin and preserves explicit purchase routing',()=>{
 for(const [search,user,loading,expected] of [
  ['?returnTo=%2Fcart',{id:'u',email:'customer@example.com'},false,'/cart'],
  ['?purchase=qa_grid&returnTo=%2Finstall',{id:'u',email:'customer@example.com'},false,'/purchase?tool=qa_grid'],
  ['?returnTo=%2Fcart',null,false,null],
  ['?returnTo=%2Fcart',{id:'u'},true,null],
  ['?returnTo=https%3A%2F%2Fevil.example',{id:'u'},false,null],
 ]){
  const effects=[],navigations=[];const jsx=(type,props)=>({type,props});
  const mocks={react:{useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]},
   'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{},'./dashboard.css':{},
   '@/lib/authReturn':urls,'@/lib/orderedStagger':load('src/lib/orderedStagger.ts'),'@/context/AuthContext':{useAuth:()=>({user,loading})},
   '@/context/QAToolsState':{useQAToolsState:()=>({likedCount:0,cartCount:0})},
   '@/lib/supabase':{supabase:{}},'@/components/AccountProductList':{accountDate:()=>''}};
  for(const component of ['SiteFooter','BrandLogo','OutlineIcon','PasswordForm','AccountActivationKey'])mocks['@/components/'+component]={};
  const Page=load('src/app/user/page.tsx',mocks, {window:{location:{search,origin,replace:value=>navigations.push(value)}}}).default;
  Page();effects[0]();assert.deepEqual(navigations,expected?[expected]:[]);
 }
});
