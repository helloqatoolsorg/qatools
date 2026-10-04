const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('confirmed order numbers survive retries, rollback, refunds and separate test purchases',
  { skip: !process.env.PGLITE_TEST_MODULE }, async () => {
  const { PGlite } = require(process.env.PGLITE_TEST_MODULE);
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.orders(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        provider text NOT NULL, provider_transaction_id text UNIQUE, status text NOT NULL,
        created_at timestamptz DEFAULT now());
      INSERT INTO public.orders(provider,provider_transaction_id,status,created_at) VALUES
        ('development','legacy','paid','2026-10-01'),('paddle_sandbox','sandbox','paid','2026-10-04');
      GRANT SELECT ON public.orders TO authenticated,service_role;`);
    await db.exec(fs.readFileSync('supabase/migrations/20261004120000_customer_order_numbers.sql', 'utf8'));
    const refs = async () => (await db.query('SELECT order_number FROM public.orders ORDER BY id')).rows.map(r => r.order_number);
    assert.deepEqual(await refs(), ['development-000001','sandbox-000001']);
    await db.exec(`INSERT INTO public.orders(provider,provider_transaction_id,status) VALUES
      ('paddle','first','paid'),('paddle','pending','pending');`);
    assert.deepEqual((await refs()).slice(2), ['000001',null]);
    await db.exec(`INSERT INTO public.orders(provider,provider_transaction_id,status)
      VALUES('paddle','first','paid') ON CONFLICT DO NOTHING;`);
    await assert.rejects(db.exec(`INSERT INTO public.orders(provider,provider_transaction_id,status)
      VALUES('paddle','first','paid');`), /unique/);
    await db.exec('BEGIN');
    await db.exec(`INSERT INTO public.orders(provider,provider_transaction_id,status) VALUES('paddle','rolled-back','paid')`);
    await db.exec('ROLLBACK');
    await db.exec(`UPDATE public.orders SET status='paid' WHERE provider_transaction_id='pending'`);
    assert.deepEqual((await refs()).slice(2), ['000001','000002']);
    await db.exec(`UPDATE public.orders SET status='refunded' WHERE provider_transaction_id='first';
      UPDATE public.orders SET status='cancelled' WHERE provider_transaction_id='pending';
      INSERT INTO public.orders(provider,provider_transaction_id,status) VALUES('paddle_sandbox','second-sandbox','paid');`);
    assert.deepEqual((await refs()).slice(2), ['000001','000002','sandbox-000002']);
    for (const sql of [
      "UPDATE public.orders SET order_number='changed' WHERE provider_transaction_id='first'",
      "UPDATE public.orders SET order_number=null WHERE provider_transaction_id='first'",
      "UPDATE public.orders SET provider='development' WHERE provider_transaction_id='first'",
      "DELETE FROM public.orders WHERE provider_transaction_id='first'",
      "TRUNCATE public.orders",
      "INSERT INTO public.orders(provider,status,order_number) VALUES('paddle','paid','fake')",
      "INSERT INTO public.orders(provider,status) VALUES('unknown','paid')"
    ]) await assert.rejects(db.exec(sql));
    // A later operation failing in the same purchase transaction must undo the allocation too.
    await db.exec('BEGIN');
    await db.exec(`INSERT INTO public.orders(provider,provider_transaction_id,status) VALUES('paddle','failed-fulfillment','paid')`);
    await assert.rejects(db.exec('SELECT 1/0'));
    await db.exec('ROLLBACK');
    await db.exec(`INSERT INTO public.orders(provider,provider_transaction_id,status) VALUES('paddle','third','paid')`);
    assert.equal((await refs()).at(-1), '000003');
    for (const role of ['anon','authenticated','service_role']) {
      const p = (await db.query(`SELECT has_table_privilege($1,'public.order_number_counters','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS counter,
        has_function_privilege($1,'public.assign_customer_order_number()','EXECUTE') AS execute`, [role])).rows[0];
      assert.equal(p.counter,false); assert.equal(p.execute,false);
    }
    await db.exec(`SET ROLE authenticated`);
    assert.equal((await db.query('SELECT order_number FROM public.orders')).rows.length,6);
    await assert.rejects(db.exec(`UPDATE public.orders SET order_number='fake'`), /permission denied/);
    await db.exec('RESET ROLE');
    // Padding must not truncate a seven-digit number.
    await db.exec("UPDATE public.order_number_counters SET last_number=999999 WHERE scope='development'");
    await db.exec("INSERT INTO public.orders(provider,status) VALUES('development','paid')");
    assert.equal((await refs()).at(-1),'development-1000000');
  } finally { await db.close(); }
});
