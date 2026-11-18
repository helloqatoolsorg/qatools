const {test}=require("node:test");
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
const legacy={id:1,name:"Legacy Scene Project",slug:"legacy_scene_project",subtitle:"Legacy Project",product_type:"project",
  price_eur:25,release_date:"2026-10-08",product_media:[],category:null,complexity:null};
const products=[legacy,{...legacy,id:2,name:"Tool",slug:"tool",product_type:"tool",price_eur:5,release_date:"2026-11-17"},
  {...legacy,id:3,name:"Bundle",slug:"bundle",product_type:"bundle",price_eur:15,release_date:"2026-11-16"}];
function nodes(value){
  if(Array.isArray(value))return value.flatMap(nodes);
  if(value==null||typeof value==="boolean")return [];
  return typeof value==="object"?[value,...nodes(value.props?.children)]:[value];
}
function setup(initial="",items=products){
  let search=initial,cursor=0,fiber,pending=[];
  const home={hooks:[]},filter={hooks:[]};
  const react={Suspense:"suspense",useMemo:fn=>fn(),useRef:value=>({current:value}),
    useCallback(fn,deps){
      const slots=fiber.hooks,index=cursor++,old=slots[index];
      if(!old||deps.some((value,i)=>value!==old.deps[i]))slots[index]={fn,deps};
      return slots[index].fn;
    },
    useState(initial){
      const slots=fiber.hooks,index=cursor++;
      if(!(index in slots))slots[index]={value:typeof initial==="function"?initial():initial};
      slots[index].set??=next=>{slots[index].value=typeof next==="function"?next(slots[index].value):next;};
      return [slots[index].value,slots[index].set];
    },
    useEffect(fn,deps){
      const slots=fiber.hooks,index=cursor++,old=slots[index];
      if(!old||deps.some((value,i)=>value!==old.deps[i]))pending.push({owner:fiber,fn});
      slots[index]={deps};
    },
  };
  const exports={},jsx=(type,props)=>({type,props});
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/page.tsx","utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},
  }).outputText,{exports,Map,Set,URLSearchParams,window:{location:{get search(){return search;}},scrollTo(){}},
    require(name){
      if(name==="@/lib/productKind"){
        const kind={};vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/productKind.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:kind});return kind;
      }
      if(name==="react")return react;
      if(name==="react/jsx-runtime")return {jsx,jsxs:jsx};
      if(name==="next/navigation")return {useSearchParams:()=>new URLSearchParams(search),useRouter:()=>({push(){}})};
      if(name==="@/lib/supabase")return {supabase:{from:table=>({
        select(){return this;},order(){return this;},
        then(resolve,reject){return Promise.resolve({data:table==="products"?items:[],error:null}).then(resolve,reject);},
      })}};
      if(name==="@/context/QAToolsState")return {useQAToolsState:()=>({
        likedCount:0,cartCount:0,isLiked:()=>false,isInCart:()=>false,isPurchased:()=>false,toggleLike(){},toggleCart(){},
      })};
      if(name==="@/hooks/useProductGridMotion")return {useProductGridMotion:()=>({current:null})};
      if(name==="@/lib/cartAnimation")return {animateToCart(){}};
      return {default:name};
    },
  });
  function render(){
    fiber=home;cursor=0;pending=[];
    const tree=nodes(exports.default());
    const component=tree.find(node=>typeof node.type==="function"&&node.type.name==="CatalogTypeFilter");
    if(component){fiber=filter;cursor=0;component.type(component.props);}
    return tree;
  }
  async function run(initial=false){
    render();const tasks=pending.filter(item=>item.owner===filter);
    if(initial){const load=pending.find(item=>item.owner===home);if(load)tasks.unshift(load);}
    tasks.forEach(item=>item.fn());
    await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
    return render();
  }
  return {
    start:()=>run(true),async navigate(value){search=value;return run();},render,
    slugs:()=>render().filter(node=>node.type==="article"&&node.props.className==="product-card").map(node=>node.props["data-id"]),
    sort(key){const button=render().find(node=>node.type==="button"&&node.props.className?.startsWith("sort-option")&&nodes(node.props.children).includes(key));assert.ok(button);button.props.onClick();},
    clear(){render().find(node=>node.props?.id==="clearFilters").props.onClick();},
    search(value){
      render().find(node=>node.props?.id==="searchInput").props.onChange({target:{value}});
      render().find(node=>node.props?.id==="searchInput").props.onKeyDown({key:"Enter",preventDefault(){}});
    },
  };
}
test("direct Project links show older Project records without prepared-project metadata",async()=>{
  const page=setup("?type=project");await page.start();assert.deepEqual(page.slugs(),["legacy_scene_project"]);
});
test("URL navigation updates product types while preserving the selected sorting",async()=>{
  const page=setup();await page.start();assert.deepEqual(page.slugs(),["tool","bundle","legacy_scene_project"]);
  page.sort("price");page.sort("price");await page.navigate("?type=project");
  assert.deepEqual(page.slugs(),["legacy_scene_project"]);
  const selected=page.render().find(node=>node.type==="button"&&node.props.className==="sort-option selected");
  assert.ok(nodes(selected).includes("price"));assert.ok(nodes(selected).includes("↓"));
  await page.navigate("?type=tool&type=bundle");assert.deepEqual(page.slugs(),["bundle","tool"]);
});
test("manual clearing persists until the URL type filter changes",async()=>{
  const page=setup("?type=project");await page.start();page.clear();assert.equal(page.slugs().length,3);
  await page.navigate("?type=project&other=value");assert.equal(page.slugs().length,3);
  await page.navigate("?type=bundle");assert.deepEqual(page.slugs(),["bundle"]);
  await page.navigate("");assert.equal(page.slugs().length,3);
});

test("a catalogue link clears a leftover search that would hide the requested Project",async()=>{
  const page=setup();await page.start();page.search("missing project text");
  assert.deepEqual(page.slugs(),[]);
  await page.navigate("?type=project");
  assert.deepEqual(page.slugs(),["legacy_scene_project"]);
});

test("Shelf Tool links and filters distinguish HDA tools while allowing combined selections",async()=>{
 const shelf={...products[1],id:4,name:"Shelf",slug:"shelf",prepared_identity:{schema:2}};
 const page=setup("?type=shelf_tool",[...products,shelf]);await page.start();assert.deepEqual(page.slugs(),["shelf"]);
 await page.navigate("?type=tool");assert.deepEqual(page.slugs(),["tool"]);
 await page.navigate("?type=tool&type=shelf_tool&type=bundle");assert.deepEqual(new Set(page.slugs()),new Set(["tool","shelf","bundle"]));
 assert.ok(page.render().some(n=>n.type==="button"&&nodes(n.props.children).includes("SHELF TOOL")));
});
