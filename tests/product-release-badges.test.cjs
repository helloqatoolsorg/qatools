const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsForTest={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/productReleaseBadge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsForTest});
const badge=exportsForTest.productReleaseBadge,day=86400000,now=Date.parse('2026-11-18T12:00:00Z'),ago=n=>new Date(now-n*day).toISOString();
test('release badges expire at 30 days and recent updates take priority',()=>{
 assert.equal(badge(ago(0),null,now),'NEW');assert.equal(badge(ago(29),null,now),'NEW');assert.equal(badge(ago(30),null,now),null);
 assert.equal(badge(ago(100),ago(1),now),'updated');assert.equal(badge(ago(5),ago(1),now),'updated');assert.equal(badge(ago(100),ago(30),now),null);
 for(const date of [undefined,null,'invalid',ago(-1)])assert.equal(badge(date,null,now),null);
 assert.equal(badge(ago(100),ago(-1),now),null);assert.equal(badge(ago(2),ago(3),now),'NEW');
});
test('database timestamps follow published releases and ignore cosmetic edits',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 try{
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE products(id bigint PRIMARY KEY,published boolean,initial_release_date date,current_version text,description text); CREATE TABLE product_downloads(product_id bigint REFERENCES products(id),file_path text,enabled boolean); INSERT INTO products VALUES(1,false,NULL,'1','Draft'),(2,true,'2026-11-01','1','Released'); INSERT INTO product_downloads VALUES(1,'draft.zip',true),(2,'old.zip',true);");
  await db.exec(fs.readFileSync('supabase/migrations/20261118110000_product_release_badges.sql','utf8'));
  await db.exec("UPDATE products SET description='New description'; UPDATE product_downloads SET file_path='draft-new.zip' WHERE product_id=1; UPDATE products SET current_version='2' WHERE id=1;");
  assert.ok((await db.query('SELECT last_release_update_at FROM products')).rows.every(r=>r.last_release_update_at===null));
  await db.exec("UPDATE products SET published=true,initial_release_date=current_date WHERE id=1;");
  assert.equal((await db.query('SELECT last_release_update_at FROM products WHERE id=1')).rows[0].last_release_update_at,null);
  await db.exec("UPDATE product_downloads SET file_path='new.zip' WHERE product_id=2;");
  const first=(await db.query('SELECT last_release_update_at::text AS stamp FROM products WHERE id=2')).rows[0].stamp;assert.ok(first);
  await db.exec("UPDATE products SET description='Cosmetic edit' WHERE id=2; UPDATE product_downloads SET file_path=file_path WHERE product_id=2;");
  assert.equal((await db.query('SELECT last_release_update_at::text AS stamp FROM products WHERE id=2')).rows[0].stamp,first);
  await db.exec("UPDATE products SET current_version='2' WHERE id=2;");
  assert.ok((await db.query('SELECT last_release_update_at::text AS stamp FROM products WHERE id=2')).rows[0].stamp>=first);
 }finally{await db.close();}
});
