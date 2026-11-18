const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
  }).outputText, {exports, Buffer, process, Set, Map, Request, Response, URL, ...extra, require: name => name in mocks ? mocks[name] : require(name)});
  return exports;
}
const pack = load('src/lib/houdiniPackage.ts', {'server-only': {}, '../../public/QATools.json': JSON.parse(fs.readFileSync('public/QATools.json'))});
const uploads = load('src/lib/adminDownloadUpload.ts', {'server-only': {}});
const project = load('src/lib/projectArchive.ts', {'server-only': {}, './houdiniPackage': pack, './adminDownloadUpload': uploads});
const manifest = {schema: 1, label: 'Project Name', slug: 'project_name', scene: 'project.hiplc', houdini: '21.0.512', tools: ['qa_tool'], warnings: [{type: 'Sop/vendor', node: '/obj/geo/vendor'}]};
function archive(value = manifest) {
  return pack.makePackageZip([{name: 'project.hiplc', bytes: Buffer.from('scene')}, {name: 'qatools-project.json', bytes: Buffer.from(JSON.stringify(value))}]);
}
function inspection(options = {}) {
  const calls = [];
  const route = load('src/app/api/admin/products/project-inspect/route.ts', {
    '@/lib/adminDownloadUpload': uploads, '@/lib/projectArchive': project,
    '@/lib/requireAdmin': {requireAdmin: async () => options.denied ? {response: new Response(null, {status: 403})} : {user: {id: 'admin'}}},
    '@/lib/activationHttp': {privateJson: (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}})},
    '@/lib/supabaseAdmin': {supabaseAdmin: {from(table) {
      calls.push(table);
      const query = {
        select() {return this;}, eq() {return this;},
        async maybeSingle() {return {data: {project_manifest: manifest}, error: null};},
        async in() {return {data: table === 'products' ? [{id: 7, slug: 'qa_tool'}] : options.missing ? [] : [{product_id: 7, file_path: '7/version/tool.zip'}], error: options.database ? {} : null};},
      };
      return query;
    }}},
  });
  return {calls, route, post: (bytes = archive()) => route.POST(new Request('https://example.test/inspect', {method: 'POST', body: bytes}))};
}
test('project inspection authenticates before reading and resolves only tools with enabled releases', async () => {
  const denied = inspection({denied: true});
  assert.equal((await denied.post()).status, 403);
  assert.deepEqual(denied.calls, []);
  const normal = await inspection().post();
  assert.equal(normal.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await normal.json(), {manifest, toolIds: [7], missing: []});
  assert.deepEqual((await (await inspection({missing: true}).post()).json()).missing, ['qa_tool']);
  assert.equal((await inspection({database: true}).post()).status, 503);
  assert.equal((await inspection().post(Buffer.alloc(project.PROJECT_UPLOAD_LIMIT + 1))).status, 413);
});
test('manifest identity, file references and dependency lists are verified before catalog access', async () => {
  for (const change of [{tools: ['qa_tool', 'qa_tool']}, {scene: 'missing.hiplc'}, {slug: 'wrong'}, {warnings: [{type: '', node: '/node'}]}]) {
    const setup = inspection();
    assert.equal((await setup.post(archive({...manifest, ...change}))).status, 400);
    assert.deepEqual(setup.calls, []);
  }
  const legacy = pack.makePackageZip([{name: 'scene.hiplc', bytes: Buffer.from('scene')}]);
  assert.deepEqual(await (await inspection().post(legacy)).json(), {manifest: null, toolIds: [], missing: []});
});
test('saved project inspection requires admin access and validates product identifiers', async () => {
  const denied = inspection({denied: true});
  assert.equal((await denied.route.GET(new Request('https://example.test/inspect?productId=7'))).status, 403);
  assert.deepEqual(denied.calls, []);
  const setup = inspection();
  assert.equal((await setup.route.GET(new Request('https://example.test/inspect?productId=0'))).status, 400);
  assert.deepEqual(await (await setup.route.GET(new Request('https://example.test/inspect?productId=7'))).json(), {manifest});
});
const tick = () => new Promise(resolve => setImmediate(resolve));
function component(file, mocks) {
  const slots = [], effects = [];
  let cursor = 0;
  const jsx = (type, props) => ({type, props});
  const exported = load(file, {
    react: {useState(value) {const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], next => {slots[index] = typeof next === 'function' ? next(slots[index]) : next;}];}, useEffect(effect) {effects.push(effect);}},
    'react/jsx-runtime': {jsx, jsxs: jsx},
    ...mocks,
  });
  return {render() {cursor = 0; return exported.default({productId: 7});}, async mount() {for (const effect of effects.splice(0)) effect(); await tick(); await tick();}};
}
function descendants(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(descendants);
  return typeof tree === 'object' ? [tree, ...descendants(tree.props?.children)] : [tree];
}
test('customer project displays requirements and installation, and included tools link to their product', async () => {
  const details = component('src/components/ProjectDetails.tsx', {
    '@/lib/supabase': {supabase: {rpc: async () => ({data: {scene: 'project.hiplc', houdini: '21.0.512', dependencies: ['Sop/vendor']}, error: null})}},
  });
  details.render(); await details.mount();
  const nodes = descendants(details.render());
  assert.ok(nodes.includes('project.hiplc'));
  assert.ok(nodes.includes('Sop/vendor'));
  assert.equal(nodes.filter(node => node.type === 'li').length, 3);
  const tools = component('src/components/IncludedTools.tsx', {
    'next/link': {default: 'a', __esModule: true},
    '@/lib/supabase': {supabase: {from(table) {return {
      select() {return this;}, in() {return this;},
      eq() {return table === 'product_members' ? Promise.resolve({data: [{tool_id: 8}], error: null}) : this;},
      async order() {return {data: [{id: 8, name: 'QA Tool', slug: 'qa_tool'}], error: null};},
    };}}},
  });
  tools.render(); await tools.mount();
  assert.equal(descendants(tools.render()).find(node => node.type === 'a').props.href, '/product?id=qa_tool');
});
test('admin upload helper rejects missing tools before staging the project file', async () => {
  const calls = [];
  let missing = ['qa_tool'];
  const helper = load('src/lib/projectUpload.ts', {
    '@/lib/supabase': {supabase: {auth: {getSession: async () => ({data: {session: {access_token: 'test'}}, error: null})}}},
  }, {fetch: async (url, options) => {calls.push({url, options}); return Response.json({manifest, toolIds: [7], missing});}});
  const file = new File([archive()], 'project_name.zip');
  await assert.rejects(helper.inspectProjectFile(file), /Publish these tools/);
  missing = [];
  assert.deepEqual(JSON.parse(JSON.stringify(await helper.inspectProjectFile(file))), {manifest, toolIds: [7], missing: []});
  assert.equal(calls[0].url, '/api/admin/products/project-inspect');
});

test('both installation streams use one extraction and named Project folders, with filtered browse links', () => {
  for (const returning of [false,true]) for (const project of [false,true]) {
    const guide=component('src/components/InstallationGuide.tsx', {
      'next/link': {default:'a',__esModule:true}, './InstallationGuide.css': {},
    });
    const nodes=()=>descendants(guide.render());
    const text=()=>nodes().filter(node=>typeof node==='string').join(' ');
    const click=label=>{
      const button=nodes().find(node=>node.type==='button' && descendants(node.props.children).filter(child=>typeof child==='string').join('')===label);
      assert.ok(button,label+' in '+text());button.props.onClick();
    };
    click(returning?'I’ve already installed QATools →':'I’m installing QATools for the first time →');
    click(project?'Project →':'Tool or Bundle →');
    assert.equal(nodes().find(node=>node.type==='a').props.href,project?'/?type=project':'/?type=tool&type=bundle');
    click(project?'I have downloaded the Project →':'I have downloaded the Tool →');
    click('Houdini 21 →');
    assert.match(text(),/QATools\.json and the QATools folder/);
    if(project)assert.ok(text().includes('Project'));
    click('The files are in the packages folder →');
    if(project){
      assert.match(text(),/Move the folder named after your Project/);
      assert.doesNotMatch(text(),/Extract the ZIP inside/);
      click('The Project is in my working folder →');
    }
    assert.match(text(),returning?/Your existing license/:/Does it show an active license/);
  }
});

test('Shelf Tool guide filters its downloads and opens licensing through Shift-click',()=>{
 const guide=component('src/components/InstallationGuide.tsx',{'next/link':{default:'a',__esModule:true},'./InstallationGuide.css':{}});
 const nodes=()=>descendants(guide.render());const text=()=>nodes().filter(n=>typeof n==='string').join(' ');
 const click=label=>{const button=nodes().find(n=>n.type==='button'&&descendants(n.props.children).filter(c=>typeof c==='string').join('')===label);assert.ok(button,label);button.props.onClick();};
 click('I’m installing QATools for the first time →');click('Shelf Tool →');
 assert.equal(nodes().find(n=>n.type==='a').props.href,'/?type=shelf_tool');
 click('I have downloaded the Shelf Tool →');click('Houdini 22 →');click('The files are in the packages folder →');
 assert.match(text(),/shelf tab named after your Shelf Tool/);assert.match(text(),/Shift-click/);assert.match(text(),/window/);
 click('No, connect my account →');assert.match(text(),/Shelf Tool’s/);click('I have copied my key →');assert.match(text(),/window/);
});
