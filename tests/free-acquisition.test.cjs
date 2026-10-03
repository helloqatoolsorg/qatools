const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function setup(options={}) {
 const calls=[],modules=new Map();
 function load(file){if(modules.has(file))return modules.get(file);const mod={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
   exports:mod.exports,Buffer,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'}},
   require(name){if(name==='server-only')return {};if(name==='next/server')return {NextResponse:{json:Response.json}};
    if(name==='@/lib/requireAccount')return load('src/lib/requireAccount.ts');
    if(name==='@/lib/activationHttp')return load('src/lib/activationHttp.ts');
    if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:{rpc:async(name,args)=>{calls.push({name,args});if(options.throw)throw Error('private details');return {data:options.data??{ok:true,products:[{id:1,slug:'free-item',name:'Free item'}]},error:options.error??null};}}};
    if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:'verified-user',email_confirmed_at:options.unconfirmed?null:'2026-10-03'}},error:options.invalidToken?{}:null})}})};
    throw Error('Unexpected import '+name);}
  });modules.set(file,mod.exports);return mod.exports;}
 return {calls,post(body={productIds:[1]}){return load('src/app/api/account/acquire-free/route.ts').POST(new Request('http://localhost/api/account/acquire-free',{method:'POST',headers:options.noToken?{}:{Authorization:'Bearer synthetic'},body:typeof body==='string'?body:JSON.stringify(body)}));}};
}
for(const [option,status] of [['noToken',401],['invalidToken',401],['unconfirmed',403]])test('free acquisition rejects '+option,async()=>{
 const s=setup({[option]:true}),r=await s.post();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(s.calls.length,0);
});
test('invalid and oversized bodies never reach ownership writes',async()=>{
 for(const body of ['{',[],{}, {productIds:[]},{productIds:[1,1]},{productIds:['1']},{productIds:[true]},{productIds:[null]},{productIds:[0]},{productIds:[-1]},{productIds:[1.5]},{productIds:[Number.MAX_SAFE_INTEGER+1]},{productIds:Array.from({length:51},(_,i)=>i+1)},' '.repeat(4097)]){
  const s=setup();assert.equal((await s.post(body)).status,400);assert.equal(s.calls.length,0);
 }
});
test('verified identity overrides forged user and client price claims',async()=>{
 const s=setup(),r=await s.post({productIds:[1],userId:'victim',price:0,published:true});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(s.calls[0].name,'acquire_free_items');assert.equal(s.calls[0].args.p_user_id,'verified-user');assert.deepEqual(Array.from(s.calls[0].args.p_product_ids),[1]);
 assert.deepEqual(Object.keys(s.calls[0].args).sort(),['p_product_ids','p_user_id']);assert.equal((await r.json()).products[0].slug,'free-item');
});
test('business failures and database failures return safe responses',async()=>{
 for(const [options,status] of [[{data:{ok:false,code:'account_unavailable'}},403],[{data:{ok:false,code:'not_free'}},409],[{data:{ok:false,code:'ownership_inactive'}},409],[{data:{ok:false,code:'invalid_items'}},400],[{error:{message:'private details'}},503],[{throw:true},503],[{error:{code:'P0001',message:'ownership_inactive'}},409]]){
  const r=await setup(options).post();assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.ok(!(await r.text()).includes('private details'));
 }
});
function cart(options={}) {
 const removed=[],requests=[],state=[],products=options.paidOnly?[{id:2,slug:'paid',name:'Paid',price_eur:10}]:[{id:1,slug:'free',name:'Free',price_eur:0},{id:2,slug:'paid',name:'Paid',price_eur:10}];let refreshed=0,index=0;
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/cart/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:mod.exports,fetch:async(url,init)=>{requests.push({url,init});return Response.json(options.failure?{error:'Price changed'}:{products:[{slug:'free'}]},{status:options.failure?409:200});},
  require(name){if(name==='react')return {useState(value){const i=index++;state[i]=value;return [value,v=>state[i]=v];}};
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='@/lib/supabase')return {supabase:{auth:{getSession:async()=>({data:{session:options.loggedOut?null:{access_token:'synthetic'}},error:null})}}};
   if(name==='@/hooks/useCartProducts')return {useCartProducts:()=>({products,total:10,loading:false}),formatCartPrice:String,getCartProductImage:()=>null};
   if(name==='@/context/QAToolsState')return {useQAToolsState:()=>({likedCount:0,cartCount:products.length,purchasedLoading:false,removeFromCart:slug=>removed.push(slug),refreshPurchases:()=>refreshed++})};
   throw Error(name);}
 });
 function find(node){if(!node||typeof node!=='object')return null;if(node.props?.className==='cart-page-checkout')return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child);if(result)return result;}return null;}
 return {button:find(mod.exports.default()),removed,requests,state,get refreshed(){return refreshed;}};
}
test('mixed cart sends only free IDs and refreshes ownership after confirmed success',async()=>{
 const c=cart();await c.button.props.onClick();assert.deepEqual(JSON.parse(c.requests[0].init.body),{productIds:[1]});assert.equal(c.requests[0].init.headers.Authorization,'Bearer synthetic');assert.deepEqual(c.removed,['free']);assert.equal(c.refreshed,1);assert.ok(c.state[1].includes('Refresh your Houdini license'));
});
test('failed acquisition or missing login retains cart and ownership',async()=>{
 for(const options of [{failure:true},{loggedOut:true}]){const c=cart(options);await c.button.props.onClick();assert.deepEqual(c.removed,[]);assert.equal(c.refreshed,0);assert.ok(c.state[2]);assert.equal(c.state[0],false);}
});
test('paid-only checkout is disabled and cannot acquire items',async()=>{const c=cart({paidOnly:true});assert.equal(c.button.props.disabled,true);await c.button.props.onClick();assert.equal(c.requests.length,0);});
test('SQL validates catalog/account atomically and preserves existing ownership',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 const user='00000000-0000-0000-0000-000000000001',unconfirmed='00000000-0000-0000-0000-000000000002',banned='00000000-0000-0000-0000-000000000003';
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
   INSERT INTO auth.users VALUES('${user}',now(),null),('${unconfirmed}',null,null),('${banned}',now(),now()+interval '1 day');
   CREATE TABLE public.products(id bigint PRIMARY KEY,name text,slug text,published boolean,price_eur numeric);
   INSERT INTO public.products VALUES(1,'Free','free',true,0),(2,'Paid','paid',true,10),(3,'Draft','draft',false,0),(4,'Free two','free-two',true,0),(5,'Free three','free-three',true,0);
   CREATE TABLE public.entitlements(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid,product_id bigint REFERENCES public.products,source text CHECK(source IN ('purchase','free','admin')),status text CHECK(status IN ('active','revoked','refunded')),UNIQUE(user_id,product_id));
   ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;`);
  await db.exec(fs.readFileSync(path.resolve('supabase/migrations/20261003050000_free_item_acquisition.sql'),'utf8'));
  for(const role of ['anon','authenticated','service_role']){
   const privileges=(await db.query("SELECT has_function_privilege($1,'public.acquire_free_items(uuid,bigint[])','EXECUTE') AS execute,has_table_privilege($1,'public.entitlements','INSERT,UPDATE,DELETE') AS write",[role])).rows[0];
   assert.equal(privileges.execute,role==='service_role');assert.equal(privileges.write,false);
  }
  await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT public.acquire_free_items($1,$2::bigint[])',[user,[1]]),/permission denied/);await db.exec('RESET ROLE');
  async function acquire(ids,account=user){await db.exec('SET ROLE service_role');try{return (await db.query('SELECT public.acquire_free_items($1,$2::bigint[]) AS result',[account,ids])).rows[0].result;}finally{await db.exec('RESET ROLE');}}
  for(const ids of [null,[],[1,1],[0],[-1],[null],Array.from({length:51},(_,i)=>i+1)])assert.equal((await acquire(ids)).code,'invalid_items');
  for(const ids of [[1,2],[1,3],[1,999]])assert.equal((await acquire(ids)).code,'not_free');
  for(const account of [unconfirmed,banned,'00000000-0000-0000-0000-000000000004'])assert.equal((await acquire([1],account)).code,'account_unavailable');
  assert.equal((await db.query('SELECT * FROM public.entitlements')).rows.length,0);
  assert.equal((await acquire([1])).ok,true);assert.equal((await acquire([1])).ok,true);
  assert.equal((await db.query('SELECT * FROM public.entitlements')).rows.length,1);
  assert.equal((await db.query('SELECT source FROM public.entitlements')).rows[0].source,'free');
  await db.exec(`INSERT INTO public.entitlements(user_id,product_id,source,status) VALUES('${user}',4,'admin','active');`);
  assert.equal((await acquire([1,4])).products.length,2);assert.equal((await db.query('SELECT source FROM public.entitlements WHERE product_id=4')).rows[0].source,'admin');
  for(const status of ['revoked','refunded']){
   await db.query('UPDATE public.entitlements SET status=$1 WHERE product_id=1',[status]);assert.equal((await acquire([1,5])).code,'ownership_inactive');
   assert.equal((await db.query('SELECT * FROM public.entitlements WHERE product_id=5')).rows.length,0);
   assert.equal((await db.query('SELECT status FROM public.entitlements WHERE product_id=1')).rows[0].status,status);
  }
 }finally{await db.close();}
});
