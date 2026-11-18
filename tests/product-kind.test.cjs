const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const kind={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/productKind.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:kind});
test('shelf display type comes from prepared metadata while retaining the Tool commerce type',()=>{
 const shelf={product_type:'tool',prepared_identity:{schema:2}};
 assert.equal(kind.productKind(shelf),'shelf_tool');assert.equal(kind.productKindLabel(shelf),'Shelf Tool');
 assert.equal(shelf.product_type,'tool');
 assert.equal(kind.productKind({product_type:'tool',prepared_identity:{schema:1}}),'tool');
 assert.equal(kind.productKind({product_type:'tool'}),'tool');
 assert.equal(kind.productKind({product_type:'tool',tool_kind:'shelf'}),'shelf_tool');
 assert.equal(kind.productKind({product_type:'bundle',prepared_identity:{schema:2}}),'bundle');
 assert.equal(kind.productKind({product_type:'project',tool_kind:'shelf'}),'project');
 assert.equal(kind.catalogProductTypes.length,4);
});
