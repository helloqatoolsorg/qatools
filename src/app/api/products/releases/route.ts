import {releaseProjectDetails} from "@/lib/productRelease";
import {privateJson} from "@/lib/activationHttp";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {requireAccount} from "@/lib/requireAccount";

export async function GET(request:Request) {
  try {
    const raw=new URL(request.url).searchParams.get('productId')??'',id=Number(raw);
    if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(id))return privateJson({error:'Choose a valid product.'},400);
    const product=await supabaseAdmin.from('products').select('published').eq('id',id).maybeSingle();
    if(product.error)return privateJson({error:'Versions are temporarily unavailable.'},503);
    if(!product.data)return privateJson({error:'Product not found.'},404);
    if(!product.data.published) {
      const auth=await requireAccount(request,'view your product versions');if(auth.response)return auth.response;
      const owner=await supabaseAdmin.from('entitlements').select('id').eq('product_id',id).eq('user_id',auth.user.id).eq('status','active').maybeSingle();
      if(owner.error)return privateJson({error:'Versions are temporarily unavailable.'},503);
      if(!owner.data)return privateJson({error:'Product not found.'},404);
    }
    const [releases,current]=await Promise.all([
      supabaseAdmin.from('product_releases').select('id,version,compatibility,notes,published_at,available,file_path,project_manifest').eq('product_id',id).eq('available',true).order('version_number',{ascending:false}),
      supabaseAdmin.from('product_downloads').select('file_path').eq('product_id',id).eq('enabled',true).maybeSingle(),
    ]);
    if(releases.error||current.error)return privateJson({error:'Versions are temporarily unavailable.'},503);
    return privateJson({releases:releases.data.map(({file_path,project_manifest,...release})=>({...release,project:releaseProjectDetails(project_manifest),latest:file_path===current.data?.file_path}))});
  }catch{return privateJson({error:'Versions are temporarily unavailable.'},503);}
}
