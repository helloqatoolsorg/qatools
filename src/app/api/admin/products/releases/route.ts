import {requireAdmin} from "@/lib/requireAdmin";
import {privateJson,readActivationBody} from "@/lib/activationHttp";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {releaseUuid} from "@/lib/productRelease";
export async function GET(request:Request) {
  try {
    const auth=await requireAdmin(request);if(auth.response)return auth.response;
    const raw=new URL(request.url).searchParams.get('productId')??'',id=Number(raw);
    if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(id))return privateJson({error:'Choose a saved product.'},400);
    const [releases,current]=await Promise.all([
      supabaseAdmin.from('product_releases').select('id,version,compatibility,notes,published_at,available,file_path,file_name').eq('product_id',id).order('version_number',{ascending:false}),
      supabaseAdmin.from('product_downloads').select('file_path,file_name').eq('product_id',id).maybeSingle(),
    ]);
    if(releases.error||current.error)return privateJson({error:'Unable to load release history. Check the release-history migration.'},503);
    return privateJson({releases:releases.data.map(({file_path,...r})=>({...r,latest:file_path===current.data?.file_path})),download:current.data});
  }catch{return privateJson({error:'Unable to load release history.'},503);}
}
export async function PATCH(request:Request) {
  try {
    const auth=await requireAdmin(request);if(auth.response)return auth.response;
    const body=await readActivationBody(request);
    if(!body||typeof body.releaseId!=='string'||!releaseUuid.test(body.releaseId)||typeof body.available!=='boolean'||Object.keys(body).length!==2)return privateJson({error:'Choose a valid release.'},400);
    const result=await supabaseAdmin.rpc('set_product_release_available',{p_admin_id:auth.user.id,p_release_id:body.releaseId,p_available:body.available});
    if(result.error||result.data!==true)return privateJson({error:'The latest release cannot be withdrawn. Reload and try again.'},409);
    return privateJson({ok:true});
  }catch{return privateJson({error:'Unable to update release availability.'},503);}
}
