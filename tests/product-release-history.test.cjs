const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const admin='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const read=file=>fs.readFileSync('supabase/migrations/'+file,'utf8');
function definition(file,name){const source=read(file);const start=source.search(new RegExp('CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\('));assert.ok(start>=0,name);const end=source.indexOf('END $$;',start);return source.slice(start,end+7);}
const path=(id,n=1)=>id+'/'+String(n).padStart(8,'0')+'-0000-4000-8000-000000000001/QA_Tool.zip';
async function setup(){
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE),db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
 INSERT INTO auth.users VALUES('${admin}',now(),null),('${other}',now(),null);
 CREATE TABLE admin_users(user_id uuid PRIMARY KEY);INSERT INTO admin_users VALUES('${admin}');
 CREATE TABLE products(id bigint PRIMARY KEY,name text DEFAULT 'Tool',slug text DEFAULT 'qa_tool',product_type text DEFAULT 'tool',published boolean DEFAULT false,current_version text DEFAULT '',compatibility text DEFAULT 'Houdini 21 and newer',initial_release_date date,release_date date,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),last_release_update_at timestamptz,prepared_identity jsonb,description text DEFAULT 'Description');
 CREATE TABLE product_downloads(product_id bigint PRIMARY KEY REFERENCES products(id),file_path text UNIQUE,file_name text,enabled boolean);
 CREATE TABLE bundle_releases(product_id bigint PRIMARY KEY,file_path text,tool_ids bigint[],project_sha256 text,project_manifest jsonb);
 CREATE TABLE product_members(product_id bigint,tool_id bigint);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);INSERT INTO storage.buckets VALUES('qatools-downloads',false);
 CREATE TABLE storage.objects(bucket_id text,name text);
 CREATE TABLE entitlements(id bigint PRIMARY KEY,user_id uuid,product_id bigint,status text,source text);
 CREATE TABLE entitlement_origins(root_id bigint,tool_id bigint,status text);
 CREATE TABLE product_download_events(id uuid PRIMARY KEY,product_id bigint,source text);
 CREATE TABLE account_product_downloads(user_id uuid,product_id bigint,last_downloaded_at timestamptz,PRIMARY KEY(user_id,product_id));
 INSERT INTO products(id,published,current_version,initial_release_date,release_date) VALUES(1,true,'1.0','2026-11-01','2026-11-01');
 INSERT INTO product_downloads VALUES(1,'${path(1)}','QA_Tool.zip',true);INSERT INTO storage.objects VALUES('qatools-downloads','${path(1)}');`);
 for(const [file,name] of [
  ['20261007230000_project_delivery.sql','set_product_download'],['20261007230000_project_delivery.sql','set_bundle_download'],
  ['20261104100000_prepared_export_filenames.sql','replace_prepared_tool_download'],['20261005170000_automatic_bundle_assembly.sql','set_assembled_bundle_download'],
  ['20261117110000_prepared_project_details.sql','set_assembled_project_download'],['20261117110000_prepared_project_details.sql','set_prepared_project_download'],
 ])await db.exec(definition(file,name));
 await db.exec(read('20261119110000_product_release_history.sql'));
 return db;
}
async function publish(db,{product=1,expected,request=1,number=2,who=admin,identity=null,sources=null,manifest=null,compat='Houdini 22 and newer',notes='Bug fix',fingerprint='a'.repeat(64)}={}){
 const releaseId=expected??(await db.query('SELECT id FROM product_releases WHERE product_id=$1 ORDER BY version_number DESC LIMIT 1',[product])).rows[0].id;
 const filename=path(product,number);await db.query("INSERT INTO storage.objects VALUES('qatools-downloads',$1)",[filename]);
 return (await db.query('SELECT publish_product_update($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result',[who,product,releaseId,String(request).padStart(8,'0')+'-0000-4000-8000-000000000002',fingerprint,filename,'QA_Tool.zip',compat,notes,identity,sources,manifest?'b'.repeat(64):null,manifest])).rows[0].result;
}
const sql={skip:!process.env.PGLITE_TEST_MODULE};
test('first publication and controlled updates allocate automatic versions without changing cosmetic edits',sql,async()=>{
 const db=await setup();try{
  let product=(await db.query('SELECT * FROM products WHERE id=1')).rows[0];assert.equal(product.current_version,'1.00');assert.equal(product.last_release_update_at,null);
  await db.exec("UPDATE products SET description='New text',updated_at=now() WHERE id=1");
  await assert.rejects(db.exec("UPDATE products SET current_version='2.00' WHERE id=1"),/Publish update/);
  await assert.rejects(db.exec("UPDATE products SET compatibility='Houdini 22 and newer' WHERE id=1"),/Publish update/);
  await assert.rejects(db.exec("UPDATE product_downloads SET file_path='other.zip' WHERE product_id=1"),/Publish update/);
  const initial=(await db.query('SELECT * FROM product_releases')).rows[0];assert.equal(initial.version,'1.00');
  const update=await publish(db);assert.equal(update.version,'1.01');
  product=(await db.query('SELECT * FROM products WHERE id=1')).rows[0];assert.equal(product.current_version,'1.01');assert.equal(product.compatibility,'Houdini 22 and newer');assert.ok(product.last_release_update_at);
  const releases=(await db.query('SELECT version,compatibility,notes,file_path FROM product_releases ORDER BY version_number')).rows;
  assert.deepEqual(releases.map(r=>r.version),['1.00','1.01']);assert.equal(releases[0].compatibility,'Houdini 21 and newer');assert.equal(releases[0].file_path,path(1));
  await db.exec("INSERT INTO products(id,current_version) VALUES(2,'999'); INSERT INTO product_downloads VALUES(2,'"+path(2)+"','QA_Tool.zip',true);UPDATE products SET published=true,initial_release_date=current_date WHERE id=2;");
  assert.equal((await db.query('SELECT version FROM product_releases WHERE product_id=2')).rows[0].version,'1.00');
 }finally{await db.close();}
});
test('retries are idempotent, stale publishers fail, and transactional failure preserves the old release',sql,async()=>{
 const db=await setup();try{
  const initial=(await db.query('SELECT id FROM product_releases')).rows[0].id;
  await assert.rejects(publish(db,{who:other}),/Admin access/);
  const first=await publish(db,{expected:initial});const repeat=await publish(db,{expected:initial});assert.equal(first.id,repeat.id);assert.equal(repeat.duplicate,true);
  await assert.rejects(publish(db,{expected:initial,request:2,number:3}),/Release changed/);
  await assert.rejects(publish(db,{expected:initial,notes:'Changed request',fingerprint:'c'.repeat(64)}),/request changed/);
  const before=(await db.query('SELECT file_path FROM product_downloads WHERE product_id=1')).rows[0].file_path;
  await db.exec("CREATE FUNCTION fail_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version_number=102 THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_release BEFORE INSERT ON product_releases FOR EACH ROW EXECUTE FUNCTION fail_release();");
  await assert.rejects(publish(db,{request:3,number:4}),/forced failure/);
  assert.equal((await db.query('SELECT file_path FROM product_downloads WHERE product_id=1')).rows[0].file_path,before);
  assert.equal((await db.query('SELECT count(*)::int n FROM product_releases')).rows[0].n,2);
  await assert.rejects(db.exec("UPDATE product_downloads SET enabled=false WHERE product_id=1"),/Publish update/);
 }finally{await db.close();}
});
test('historical downloads retain authorization and withdrawn versions cannot be recorded',sql,async()=>{
 const db=await setup();try{
  const initial=(await db.query('SELECT id FROM product_releases')).rows[0].id;await publish(db);
  const record=async(who,p)=> (await db.query('SELECT record_product_download(gen_random_uuid(),$1,1,$2) ok',[who,p])).rows[0].ok;
  assert.equal(await record(other,path(1)),true); // Published Tool trial downloads remain available.
  await db.exec("UPDATE products SET published=false WHERE id=1");assert.equal(await record(other,path(1)),false);
  await db.query("INSERT INTO entitlements VALUES(1,$1,1,'active','purchase')",[other]);assert.equal(await record(other,path(1)),true);
  assert.equal((await db.query('SELECT set_product_release_available($1,$2,false) ok',[admin,initial])).rows[0].ok,true);assert.equal(await record(other,path(1)),false);
  const latest=(await db.query('SELECT id FROM product_releases ORDER BY version_number DESC LIMIT 1')).rows[0].id;
  assert.equal((await db.query('SELECT set_product_release_available($1,$2,false) ok',[admin,latest])).rows[0].ok,false);
  const permissions=(await db.query("SELECT has_table_privilege('authenticated','product_releases','SELECT,INSERT,UPDATE,DELETE') data,has_function_privilege('authenticated','publish_product_update(uuid,bigint,uuid,uuid,text,text,text,text,text,jsonb,jsonb,text,jsonb)','EXECUTE') publish")).rows[0];
  assert.deepEqual(permissions,{data:false,publish:false});
 }finally{await db.close();}
});
test('prepared identity and schema remain stable across releases; only the asset hash changes',sql,async()=>{
 const db=await setup();try{
  const identity={schema:1,label:'QA Tool',internal_name:'QA_Tool',slug:'qa_tool',file:'QA_Tool.hdalc',sha256:'a'.repeat(64)};
  await db.query("INSERT INTO products(id,prepared_identity) VALUES(2,$1)",[identity]);
  await db.query("INSERT INTO product_downloads VALUES(2,$1,'QA_Tool.zip',true)",[path(2)]);await db.exec('UPDATE products SET published=true WHERE id=2');
  const changed={...identity,sha256:'b'.repeat(64)};await publish(db,{product:2,identity:changed});
  assert.deepEqual((await db.query('SELECT prepared_identity FROM product_releases WHERE product_id=2 ORDER BY version_number')).rows.map(r=>r.prepared_identity),[identity,changed]);
  for(const field of ['schema','label','slug','file','internal_name'])await assert.rejects(publish(db,{product:2,request:2,number:3,identity:{...changed,[field]:field==='schema'?2:'Other'}}),/identity/);
 }finally{await db.close();}
});
test('Bundle and Project releases pin source snapshots and Project requirements; stale sources roll back',sql,async()=>{
 const db=await setup();try{
  const oldManifest={schema:1,slug:'qa_project',tools:['qa_tool'],warnings:[],scene:'old.hiplc',houdini:'21.0'};
  await db.exec("INSERT INTO products(id,slug,product_type) VALUES(3,'qa_bundle','bundle'),(4,'qa_project','project');INSERT INTO product_members VALUES(3,1),(4,1);");
  for(const id of [3,4]){await db.query("INSERT INTO product_downloads VALUES($1,$2,'QA_Tool.zip',true)",[id,path(id)]);await db.query("INSERT INTO bundle_releases VALUES($1,$2,ARRAY[1],$3,$4)",[id,path(id),id===4?'a'.repeat(64):null,id===4?oldManifest:null]);await db.query('UPDATE products SET published=true WHERE id=$1',[id]);}
  const sources=[{tool_id:1,file_path:path(1)}];await publish(db,{product:3,sources});
  const newManifest={...oldManifest,scene:'fixed.hiplc',houdini:'22.0',warnings:[{type:'Some Renderer'}]};await publish(db,{product:4,request:2,sources,manifest:newManifest});
  const project=(await db.query('SELECT project_manifest FROM product_releases WHERE product_id=4 ORDER BY version_number')).rows;
  assert.deepEqual(project.map(r=>r.project_manifest),[oldManifest,newManifest]);assert.deepEqual((await db.query('SELECT sources FROM product_releases WHERE product_id=3 ORDER BY version_number DESC LIMIT 1')).rows[0].sources,sources);
  await publish(db,{request:3});
  await assert.rejects(publish(db,{product:3,request:4,number:3,sources}),/inputs changed/);
  assert.equal((await db.query('SELECT count(*)::int n FROM product_releases WHERE product_id=3')).rows[0].n,2);
  assert.equal((await db.query('SELECT file_path FROM bundle_releases WHERE product_id=3')).rows[0].file_path,path(3,2));
  const record=async()=> (await db.query('SELECT record_product_download(gen_random_uuid(),$1,4,$2) ok',[other,path(4)])).rows[0].ok;
  assert.equal(await record(),false);await db.query("INSERT INTO entitlements VALUES(1,$1,4,'active','purchase')",[other]);assert.equal(await record(),true);
 }finally{await db.close();}
});
