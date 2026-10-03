const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, env = {}, fetchImpl) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: mod.exports, process: { env }, AbortSignal, fetch: fetchImpl,
    require(name) {
      if (name === 'server-only') return {};
      if (name === './paddleSandbox') return load('src/lib/paddleSandbox.ts', env);
      throw Error(name);
    },
  });
  return mod.exports;
}
const product = { id: 1, slug: 'qafit01', price_eur: 5, published: true };
const price = {
  id: 'pri_01m41bkp4f0fxgb9cfm37n5p4b', product_id: 'pro_01m41bf7cprd18e5aebzyp1rzw',
  status: 'active', type: 'standard', billing_cycle: null, trial_period: null, tax_mode: 'internal',
  unit_price: { amount: '500', currency_code: 'EUR' }, quantity: { minimum: 1, maximum: 1 }, unit_price_overrides: [],
  product: { id: 'pro_01m41bf7cprd18e5aebzyp1rzw', name: 'qafit01', status: 'active', tax_category: 'standard' },
};
test('only the published paid item at the approved price is mapped', () => {
  const catalog = load('src/lib/paddleCatalog.ts');
  assert.equal(catalog.validateSandboxPrice(product, price).paddlePriceId, price.id);
  for (const patch of [{ id: 2 }, { slug: 'qanoise01' }, { price_eur: 0 }, { price_eur: 6 }, { published: false }])
    assert.throws(() => catalog.sandboxPriceForProduct({ ...product, ...patch }));
});
test('wrong IDs, tax, currency, amount, recurring/trial, quantity and catalog drift fail closed', () => {
  const catalog = load('src/lib/paddleCatalog.ts');
  for (const patch of [{ id: 'wrong' }, { product_id: 'wrong' }, { status: 'archived' }, { type: 'custom' },
    { billing_cycle: { interval: 'month' } }, { trial_period: {} }, { tax_mode: 'external' },
    { unit_price: { amount: '500', currency_code: 'USD' } }, { unit_price: { amount: '600', currency_code: 'EUR' } },
    { quantity: { minimum: 1, maximum: 2 } }, { unit_price_overrides: [{}] }, { product: { ...price.product, status: 'archived' } },
    { product: { ...price.product, tax_category: 'saas' } }, { product: { ...price.product, id: 'wrong' } },
    { product: { ...price.product, name: 'other' } }, { product: undefined }])
    assert.throws(() => catalog.validateSandboxPrice(product, { ...price, ...patch }));
  assert.throws(() => catalog.validateSandboxPrice(product, null));
});
test('catalog lookup uses fixed sandbox host, no cache and no redirects without a webhook secret', async () => {
  let calls = 0;
  const env = { PADDLE_ENVIRONMENT: 'sandbox', PADDLE_API_KEY: 'pdl_sdbx_apikey_synthetic' };
  const catalog = load('src/lib/paddleCatalog.ts', env, async (url, options) => {
    calls++;
    assert.equal(url, `https://sandbox-api.paddle.com/prices/${price.id}?include=product`);
    assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${env.PADDLE_API_KEY}`);
    return { ok: true, json: async () => ({ data: price }) };
  });
  await catalog.fetchValidatedSandboxPrice(product); assert.equal(calls, 1);
  await assert.rejects(catalog.fetchValidatedSandboxPrice({ ...product, price_eur: 0 })); assert.equal(calls, 1);
  await assert.rejects(load('src/lib/paddleCatalog.ts', { ...env, PADDLE_ENVIRONMENT: 'live' }).fetchValidatedSandboxPrice(product));
  await assert.rejects(load('src/lib/paddleCatalog.ts', env, async () => ({ ok: false })).fetchValidatedSandboxPrice(product), /Unable to verify/);
});
module.exports = { load };
