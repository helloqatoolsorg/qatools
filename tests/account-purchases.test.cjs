const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function setup(options={}){
 const calls=[],exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/account/purchases/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Request,Response,require(name){
  if(name==='@/lib/requireAccount')return {requireAccount:async()=>options.denied?{response:Response.json({error:'Log in'},{status:401})}:{user:{id:'verified-user'}}};
  if(name==='@/lib/activationHttp')return {privateJson:(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})};
  if(name==='@/lib/supabaseAdmin')return {supabaseAdmin:{async rpc(name,args){calls.push({name,args});return {data:options.inactive?{ok:false}:{ok:true,entitlements:[],machines:[]},error:options.error?{message:'private sql'}:null};}}};throw Error(name);
 }});return {calls,get:()=>exports.GET(new Request('http://localhost/api/account/purchases?userId=another-user'))};
}
test('account purchases use authenticated identity, private responses and safe failures',async()=>{
 const denied=setup({denied:true});assert.equal((await denied.get()).status,401);assert.equal(denied.calls.length,0);
 const s=setup(),response=await s.get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'read_account_purchases');assert.equal(s.calls[0].args.p_user_id,'verified-user');
 for(const option of ['inactive','error']){const failed=await setup({[option]:true}).get();assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private sql'));}
});

test("dashboard records only valid downloads and isolates history by account",
  { skip: !process.env.PGLITE_TEST_MODULE }, async () => {
    const { PGlite } = require(process.env.PGLITE_TEST_MODULE);
    const db = new PGlite();
    const owner = "00000000-0000-0000-0000-000000000001";
    const other = "00000000-0000-0000-0000-000000000002";
    const request = "00000000-0000-0000-0000-000000000003";
    const repeat = "00000000-0000-0000-0000-000000000004";
    const snapshot = async user => (await db.query("SELECT public.read_account_purchases($1) AS account", [user])).rows[0].account;
    const record = async (id, path) => (await db.query(
      "SELECT public.record_product_download($1,$2,1,$3) AS ok", [id, owner, path]
    )).rows[0].ok;

    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE SCHEMA auth;
        CREATE TABLE auth.users (id uuid PRIMARY KEY, email_confirmed_at timestamptz, banned_until timestamptz);
        CREATE TABLE public.category (id bigint PRIMARY KEY, name text);
        CREATE TABLE public.products (id bigint PRIMARY KEY, name text, slug text, subtitle text,
          current_version text, product_type text, category_id bigint, published boolean, price_eur numeric);
        CREATE TABLE public.product_downloads (product_id bigint, enabled boolean, file_path text);
        CREATE TABLE public.product_download_events (id uuid PRIMARY KEY, product_id bigint, source text);
        CREATE TABLE public.entitlements (id bigint PRIMARY KEY, user_id uuid, product_id bigint,
          order_item_id bigint, status text, source text, granted_at timestamptz);
        CREATE TABLE public.entitlement_origins (root_id bigint, tool_id bigint, status text);
        CREATE TABLE public.order_items (id bigint PRIMARY KEY, order_id bigint);
        CREATE TABLE public.orders (id bigint PRIMARY KEY, user_id uuid, provider_created_at timestamptz);
        CREATE TABLE public.account_activations (id bigint PRIMARY KEY, user_id uuid, machine_id text, status text, activated_at timestamptz);
        CREATE TABLE public.account_tool_trials (user_id uuid, product_id bigint, ends_at timestamptz);
        INSERT INTO auth.users VALUES ('${owner}', now(), null), ('${other}', now(), null);
        INSERT INTO public.products VALUES (1, 'Trial tool', 'trial-tool', null, null, 'tool', null, true, 30);
        INSERT INTO public.product_downloads VALUES (1, true, 'package.zip');
        INSERT INTO public.account_tool_trials VALUES ('${owner}', 1, '2026-11-14T12:00:00Z');
      `);
      await db.exec(fs.readFileSync("supabase/migrations/20261107120000_account_dashboard_downloads.sql", "utf8"));
      assert.equal(await record(request, "wrong.zip"), false);
      assert.deepEqual((await snapshot(owner)).downloads, []);
      assert.equal(await record(request, "package.zip"), true);
      const first = await snapshot(owner);
      assert.equal(first.downloads[0].products.id, 1);
      assert.equal(first.downloads[0].products.price_eur, 30);
      assert.ok(Number.isFinite(Date.parse(first.downloads[0].downloaded_at)));
      assert.deepEqual(first.entitlements, []);
      assert.equal(Date.parse(first.trial_ends["1"]), Date.parse("2026-11-14T12:00:00Z"));

      assert.equal(await record(request, "package.zip"), true);
      assert.equal((await snapshot(owner)).downloads[0].downloaded_at, first.downloads[0].downloaded_at);
      assert.equal(await record(repeat, "package.zip"), true);
      const latest = (await snapshot(owner)).downloads;
      assert.equal(latest.length, 1);
      assert.ok(Date.parse(latest[0].downloaded_at) >= Date.parse(first.downloads[0].downloaded_at));
      assert.deepEqual((await snapshot(other)).downloads, []);
      assert.deepEqual((await snapshot(other)).trial_ends, {});
      const privileges = await db.query(`
        SELECT has_table_privilege('authenticated','public.account_product_downloads','SELECT') AS can_read,
          has_table_privilege('authenticated','public.account_product_downloads','INSERT') AS can_write,
          has_function_privilege('authenticated','public.read_account_purchases(uuid)','EXECUTE') AS can_call,
          has_function_privilege('service_role','public.read_account_purchases(uuid)','EXECUTE') AS service_can_call
      `);
      assert.deepEqual(privileges.rows[0], { can_read: false, can_write: false, can_call: false, service_can_call: true });
    } finally {
      await db.close();
    }
  });
