const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
test('actual branding database denies browser writes and preserves revision comparisons',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync('supabase/migrations/20261008110000_site_logo.sql','utf8'));
  for(const role of ['anon','authenticated']){
   await db.exec(`SET ROLE ${role}`);
   assert.equal((await db.query('SELECT count(*)::int n FROM site_branding')).rows[0].n,1);
   await assert.rejects(db.query('UPDATE site_branding SET logo_path=null'),/permission denied/);
   await assert.rejects(db.query('DELETE FROM site_branding'),/permission denied/);
   await assert.rejects(db.query('INSERT INTO site_branding(id) VALUES(1)'),/permission denied/);
   for(const priv of ['TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query("SELECT has_table_privilege(current_user,'site_branding',$1) allowed",[priv])).rows[0].allowed,false);
   await db.exec('RESET ROLE');
  }
  const rev=(await db.query('SELECT revision FROM site_branding')).rows[0].revision;
  await db.exec('SET ROLE service_role');
  await assert.rejects(db.query("UPDATE site_branding SET logo_path='https://evil.test/x.svg'"),/check constraint/);
  const path='branding/logos/11111111-1111-4111-8111-111111111111.png';
  assert.equal((await db.query('UPDATE site_branding SET logo_path=$1,revision=gen_random_uuid() WHERE id=1 AND revision=$2 RETURNING *',[path,rev])).rows.length,1);
  assert.equal((await db.query('UPDATE site_branding SET logo_path=null WHERE id=1 AND revision=$1 RETURNING *',[rev])).rows.length,0);
  assert.equal((await db.query('SELECT logo_path FROM site_branding')).rows[0].logo_path,path);
 }finally{await db.close();}
});
