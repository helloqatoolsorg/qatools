const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const repo = process.cwd();
const pro = 'pro_' + 'a'.repeat(26), pri = 'pri_' + 'b'.repeat(26);
const admin = '00000000-0000-4000-8000-000000000001', attempt = '00000000-0000-4000-8000-000000000002';
function setup(options = {}) {
  const network = [], calls = [], cache = new Map();
  const tool = { id: 2, slug: 'synthetic-tool', price_eur: options.free ? 0 : 7, published: !options.unpublished };
  const mapping = { product_id: 2, paddle_product_id: pro, price_id: pri, enabled: true };
  const providerProduct = { id: pro, name: tool.slug, type: 'standard', status: 'active', tax_category: 'standard', prices: options.existingPrice ? [{ id: pri }] : [] };
  let reservation = false;
  const db = {
    from(table) { const q = { select() { return q; }, eq() { return q; }, async maybeSingle() {
      calls.push(table);
      return { error: options.dbError ? {} : null, data: table === 'products' ? tool : table === 'admin_users' ? (options.nonAdmin ? null : { user_id: admin }) : table === 'sandbox_product_prices' ? (options.mapped ? mapping : null) : (options.prior ? { status: 'price_creating', paddle_product_id: pro, price_id: null } : null) };
    } }; return q; },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'reserve_sandbox_catalog_setup') {
        const created = !reservation && !options.concurrent; reservation = true;
        return { error: null, data: { ok: true, created, job: { attempt_id: attempt } } };
      }
      return { error: null, data: options.advanceError && name === 'advance_sandbox_catalog_setup' ? false : options.completeError && name === 'complete_sandbox_catalog_setup' ? false : true };
    },
  };
  async function remote(url, config) {
    network.push({ url, config });
    if (options.transport && url.includes('/prices/') && config.method !== 'POST') throw Error('private transport');
    if (options.timeout && config.method === 'POST') throw Error('private timeout');
    if (options.permissions) return { ok: false, status: 403 };
    if (url.includes('/products?')) return { ok: true, status: 200, json: async () => ({ data: options.existingProduct || options.existingPrice ? (options.duplicates ? [providerProduct, providerProduct] : [providerProduct]) : [], meta: { pagination: { has_more: !!options.incomplete } } }) };
    if (url.endsWith('/products')) return { ok: true, status: 201, json: async () => ({ data: providerProduct }) };
    if (url.endsWith('/prices')) return { ok: true, status: 201, json: async () => ({ data: { id: pri, product_id: pro } }) };
    return { ok: true, status: 200, json: async () => ({ data: { id: pri, product_id: pro, status: 'active', type: 'standard', billing_cycle: null, trial_period: null,
      tax_mode: options.mismatch ? 'external' : 'internal', unit_price: { amount: '700', currency_code: 'EUR' }, quantity: { minimum: 1, maximum: 1 }, unit_price_overrides: [], product: providerProduct } }) };
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const mod = { exports: {} }; cache.set(file, mod.exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(repo, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: mod.exports, URL, Request, Response, Buffer, AbortSignal, fetch: remote,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic' } },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'next/server') return { NextResponse: { json: Response.json } };
        if (name === '@supabase/supabase-js') return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: options.invalidToken ? null : { id: admin } }, error: null }) } }) };
        if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: db };
        if (name.endsWith('paddleCartDatabase')) return { paddleCartDatabase: db };
        if (name.endsWith('paddleSandbox')) return { paddleSandboxApiConfig: () => ({ apiBase: 'https://sandbox-api.paddle.com', apiKey: 'synthetic-private' }) };
        if (name.startsWith('@/lib/')) return load('src/lib/' + name.slice(6) + '.ts');
        if (name.startsWith('./')) return load('src/lib/' + name.slice(2) + '.ts');
        throw Error(name);
      },
    }); return mod.exports;
  }
  const route = load('src/app/api/admin/prices/create/route.ts');
  return { calls, network, async post(body = { productId: 2, expectedSlug: tool.slug, expectedAmount: 700 }) {
    return route.POST(new Request('https://example.invalid/api/admin/prices/create', { method: 'POST', headers: options.noToken ? {} : { Authorization: 'Bearer synthetic' }, body: JSON.stringify(body) }));
  }, async get(id = '2') { return route.GET(new Request('https://example.invalid/api/admin/prices/create?productId=' + id, { headers: options.noToken ? {} : { Authorization: 'Bearer synthetic' } })); } };
}
for (const [option, status] of [['noToken', 401], ['invalidToken', 401], ['nonAdmin', 403]]) test('catalog authorization: ' + option, async () => {
  const s = setup({ [option]: true }); assert.equal((await s.post()).status, status); assert.equal((await s.get()).status, status); assert.equal(s.network.length, 0); assert.ok(!s.calls.some(c => c.name));
});
test('catalog rejects forged values and changed, unpublished or free tools before provider calls', async () => {
  for (const body of [{ productId: '2' }, { productId: 2, expectedSlug: 'wrong', expectedAmount: 700 }, { productId: 2, expectedSlug: 'synthetic-tool', expectedAmount: 1 }, { productId: 2, expectedSlug: 'synthetic-tool', expectedAmount: 700, apiKey: 'forged' }]) {
    const s = setup(); assert.ok((await s.post(body)).status >= 400); assert.equal(s.network.length, 0);
  }
  for (const option of ['free', 'unpublished', 'mapped', 'prior']) { const s = setup({ [option]: true }); assert.ok((await s.post()).status >= 400); assert.equal(s.network.length, 0); }
});
test('catalog creates one sandbox product and price using trusted settings and persisted stages', async () => {
  const s = setup(), r = await s.post(); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const posts = s.network.filter(n => n.config.method === 'POST'); assert.equal(posts.length, 2);
  const product = JSON.parse(posts[0].config.body), price = JSON.parse(posts[1].config.body);
  assert.equal(product.name, 'synthetic-tool'); assert.equal(product.tax_category, 'standard'); assert.equal(product.custom_data.qatools_setup_id, attempt);
  assert.equal(price.unit_price.amount, '700'); assert.equal(price.tax_mode, 'internal'); assert.equal(price.billing_cycle, null); assert.deepEqual(price.quantity, { minimum: 1, maximum: 1 });
  assert.ok(s.network.every(n => n.url.startsWith('https://sandbox-api.paddle.com/')));
  assert.equal(s.calls.filter(c => c.name === 'advance_sandbox_catalog_setup').length, 4);
  assert.ok(s.calls.some(c => c.name === 'complete_sandbox_catalog_setup' && c.args.p_admin_id === admin));
});
test('catalog reuses manually created matching product and price without any provider POST', async () => {
  const s = setup({ existingPrice: true }); assert.equal((await s.post()).status, 200); assert.equal(s.network.filter(n => n.config.method === 'POST').length, 0);
});
test('existing product needs only one new price', async () => {
  const s = setup({ existingProduct: true }); assert.equal((await s.post()).status, 200); const posts = s.network.filter(n => n.config.method === 'POST'); assert.equal(posts.length, 1); assert.ok(posts[0].url.endsWith('/prices'));
});
test('catalog duplicate names, unreadable prices, denied permissions and incomplete pagination fail before writes', async () => {
  for (const opts of [{ existingProduct: true, duplicates: true }, { existingPrice: true, transport: true }, { permissions: true }, { existingProduct: true, incomplete: true }]) {
    const s = setup(opts), r = await s.post(); assert.ok(r.status >= 400); assert.equal(s.network.filter(n => n.config.method === 'POST').length, 0); assert.ok(!(await r.text()).includes('synthetic-private'));
  }
});
test('reservation races and recording failures prevent provider POST', async () => {
  for (const option of ['concurrent', 'advanceError']) { const s = setup({ [option]: true }); assert.ok((await s.post()).status >= 400); assert.equal(s.network.filter(n => n.config.method === 'POST').length, 0); }
});
test('timeout never retries a provider write, and verified mismatch cannot enable checkout', async () => {
  const s = setup({ timeout: true }); assert.equal((await s.post()).status, 503); assert.equal(s.network.filter(n => n.config.method === 'POST').length, 1);
  const mismatch = setup({ mismatch: true }); assert.equal((await mismatch.post()).status, 503); assert.ok(!mismatch.calls.some(c => c.name === 'complete_sandbox_catalog_setup'));
  assert.equal((await setup({ completeError: true }).post()).status, 503);
});
test('catalog preview returns only tool settings and recovery IDs to authorized admins', async () => {
  const s = setup({ prior: true }), r = await s.get(); assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.product.price_eur, 7); assert.equal(b.setup.paddle_product_id, pro); assert.equal(s.network.length, 0); assert.equal((await s.get('bad')).status, 400);
});

test('real SQL guards catalog attempts, immutable snapshots, stages, mapping and browser privileges', async () => {
  assert.ok(process.env.PGLITE_TEST_MODULE, 'PGLITE_TEST_MODULE is required for SQL verification.');
  const { PGlite } = require(process.env.PGLITE_TEST_MODULE), db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz); CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users); CREATE TABLE public.products(id bigint PRIMARY KEY,slug text,published boolean,price_eur numeric); CREATE TABLE public.sandbox_product_prices(product_id bigint PRIMARY KEY REFERENCES public.products,price_id text UNIQUE,paddle_product_id text UNIQUE,enabled boolean);');
    const original = fs.readFileSync(path.join(repo, 'supabase/migrations/20261004180000_sandbox_cart_checkout.sql'), 'utf8');
    await db.exec(original.slice(original.indexOf('CREATE FUNCTION public.set_sandbox_product_price'), original.indexOf('CREATE FUNCTION public.reserve_sandbox_cart')));
    await db.exec(fs.readFileSync(path.join(repo, 'supabase/migrations/20261004190000_admin_paddle_catalog_setup.sql'), 'utf8'));
    await db.query('INSERT INTO auth.users VALUES($1,now(),null),($2,now(),null)', [admin, attempt]); await db.query('INSERT INTO public.admin_users VALUES($1)', [admin]);
    await db.exec("INSERT INTO public.products VALUES(2,'synthetic-tool',true,7),(3,'another-tool',true,9)");
    async function reserve(who = admin, id = 2, slug = 'synthetic-tool', amount = 700) { return (await db.query('SELECT public.reserve_sandbox_catalog_setup($1,$2,$3,$4) AS r', [who, id, slug, amount])).rows[0].r; }
    assert.equal((await reserve(attempt)).ok, false);
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1", [admin]); assert.equal((await reserve()).ok, false); await db.query('UPDATE auth.users SET banned_until=null,email_confirmed_at=null WHERE id=$1', [admin]); assert.equal((await reserve()).ok, false); await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [admin]);
    assert.equal((await reserve(admin, 2, 'forged')).ok, false); assert.equal((await reserve(admin, 2, 'synthetic-tool', 1)).ok, false);
    const first = await reserve(), job = first.job.attempt_id; assert.equal(first.created, true); assert.equal((await reserve()).created, false); assert.equal((await reserve()).job.attempt_id, job);
    async function advance(from, to, product = null, price = null, who = admin) { return (await db.query('SELECT public.advance_sandbox_catalog_setup($1,$2,$3,$4,$5,$6) AS r', [who, job, from, to, product, price])).rows[0].r; }
    async function complete() { return (await db.query('SELECT public.complete_sandbox_catalog_setup($1,$2) AS r', [admin, job])).rows[0].r; }
    assert.equal(await complete(), false); assert.equal(await advance('reserved', 'price_ready', pro, pri), false); assert.equal(await advance('reserved', 'product_creating', null, null, attempt), false);
    assert.equal(await advance('reserved', 'product_creating'), true); assert.equal(await advance('reserved', 'product_creating'), false); assert.equal((await reserve()).created, false);
    assert.equal(await advance('product_creating', 'product_ready', 'bad'), false); assert.equal(await advance('product_creating', 'product_ready', pro), true);
    assert.equal(await advance('product_ready', 'price_creating', pro), true); assert.equal(await advance('price_creating', 'price_ready', 'pro_' + 'c'.repeat(26), pri), false); assert.equal(await advance('price_creating', 'price_ready', pro, pri), true);
    await db.exec('UPDATE public.products SET price_eur=8 WHERE id=2'); assert.equal(await complete(), false); assert.equal((await db.query('SELECT count(*) AS n FROM public.sandbox_product_prices')).rows[0].n, 0);
    await db.exec('UPDATE public.products SET price_eur=7 WHERE id=2'); assert.equal(await complete(), true); assert.equal(await complete(), false); assert.equal((await reserve()).ok, false);
    const mapped = (await db.query('SELECT * FROM public.sandbox_product_prices')).rows[0]; assert.equal(mapped.price_id, pri); assert.equal(mapped.enabled, true);
    for (const role of ['anon','authenticated','service_role']) {
      const privilege = (await db.query("SELECT has_function_privilege($1,'public.reserve_sandbox_catalog_setup(uuid,bigint,text,integer)','EXECUTE') AS execute,has_table_privilege($1,'public.sandbox_catalog_setups','INSERT,UPDATE,DELETE,TRUNCATE') AS writes,has_table_privilege($1,'public.sandbox_catalog_setups','SELECT') AS reads", [role])).rows[0];
      assert.equal(privilege.execute, role === 'service_role'); assert.equal(privilege.writes, false); assert.equal(privilege.reads, role === 'service_role');
    }
  } finally { await db.close(); }
});
