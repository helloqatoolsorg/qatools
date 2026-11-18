const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const component={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/ProductDescription.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:component,require:name=>name.endsWith('.css')?{}:require(name)});
const render=text=>renderToStaticMarkup(React.createElement(component.default,{text}));
test('attributes render as inline code while paragraphs and ordinary text stay intact',()=>{
 const html=render('Reads `Cd`, `name` and `sourceprim`.\n\nKeep the original name.');
 assert.equal(html,'<p class="description">Reads <code>Cd</code>, <code>name</code> and <code>sourceprim</code>.\n\nKeep the original name.</p>');
 assert.ok(render('An unmatched ` remains plain.').includes('An unmatched ` remains plain.'));
});
test('inline formatting escapes HTML and cannot create executable markup',()=>{
 const html=render('`<img src=x onerror=alert(1)>` <script>alert(1)</script>');
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
