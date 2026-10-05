import { requireAdmin } from "@/lib/requireAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { paddleCartDatabase } from "@/lib/paddleCartDatabase";
import { verifyCatalogPrice } from "@/lib/paddleCartCatalog";
import { privateJson } from "@/lib/activationHttp";
export async function GET(request: Request) {
 try {
  const auth=await requireAdmin(request);if(auth.response){auth.response.headers.set("Cache-Control","no-store");return auth.response;}
  const raw=new URL(request.url).searchParams.get("productId")??"";
  if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(Number(raw)))return privateJson({error:"Choose a saved draft."},400);
  const result=await supabaseAdmin.rpc("product_publication_checks",{p_admin_id:auth.user.id,p_product_id:Number(raw)});
  if(result.error||!result.data)return privateJson({error:"Unable to check publication readiness."},503);
  if(result.data.ready){
   const product=await supabaseAdmin.from("products").select("id,slug,price_eur,published").eq("id",Number(raw)).maybeSingle();
   if(product.error||!product.data)return privateJson({error:"Unable to verify product."},503);
   if(Number(product.data.price_eur)>0){
    const mapping=await paddleCartDatabase.from("sandbox_product_prices").select("product_id,price_id,paddle_product_id,enabled").eq("product_id",Number(raw)).maybeSingle();
    try{if(mapping.error||!mapping.data)throw new Error("Unavailable");await verifyCatalogPrice(product.data,mapping.data);}catch{return privateJson({...result.data,ready:false,missing:["Paddle price matching the current draft"]});}
   }
  }
  return privateJson(result.data);
 }catch{return privateJson({error:"Unable to check publication readiness."},503);}
}
