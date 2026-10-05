import type { DraftInput } from "./productDraft";
export type AdminMedia={id:number;file_path:string|null;role:string;sort_order:number};
export type AdminProduct=DraftInput & {id:number;slug:string;published:boolean;updated_at:string;product_media:AdminMedia[]};
export type AdminLookup={id:number;name:string;active:boolean};
export type AdminCatalog={products:AdminProduct[];categories:AdminLookup[];complexities:AdminLookup[]};
export function catalogProducts(products:AdminProduct[],states:string[],types:string[],query:string,sort="updated-desc"){
  const time=(p:AdminProduct)=>Date.parse(p.updated_at)||0;
  return products.filter(p=>(!states.length||states.includes(p.published?"published":"unpublished"))&&(!types.length||types.includes(p.product_type))&&(p.name+" "+p.slug+" "+p.subtitle).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>{
    const order=sort==="updated-asc"?time(a)-time(b):sort==="name"?a.name.localeCompare(b.name):time(b)-time(a);
    return order || b.id-a.id;
  });
}
export function productLabels(product:AdminProduct,catalog:AdminCatalog){return [catalog.categories.find(c=>c.id===product.category_id)?.name,catalog.complexities.find(c=>c.id===product.complexity_id)?.name,product.product_type].filter((v):v is string=>!!v);}
