export const productTypes = ["tool", "bundle", "project"] as const;
export type ProductType = typeof productTypes[number];
export type DraftInput = { name: string; slug?: string; product_type: ProductType; subtitle: string; description: string; price_eur: number | null; compatibility: string; current_version: string; release_date: string | null; category_id: number; complexity_id: number; tool_ids: number[] };
export function draftValidationErrors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Draft information is invalid."];
  const d=value as Record<string,unknown>, errors:string[]=[];
  if(d.slug!==undefined && (typeof d.slug!=="string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(d.slug)))errors.push("Invalid product slug.");
  const fields=["slug","name","product_type","subtitle","description","price_eur","compatibility","current_version","release_date","category_id","complexity_id","tool_ids"];
  if(Object.keys(d).some(k=>!fields.includes(k)))errors.push("Unsupported draft fields.");
  if(typeof d.name!=="string" || !(d.slug && d.product_type==="tool" ? (/^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$/.test(d.name) || /^[a-z0-9][a-z0-9_-]{0,79}$/.test(d.name)) && d.name.length<=80 && typeof d.slug==="string" && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(d.slug) : /^[a-z0-9][a-z0-9_-]{0,79}$/.test(d.name)))errors.push(d.product_type==="tool" && d.slug ? "Use the Asset Label from the prepared tool." : "Title must use lowercase letters, numbers, underscores or hyphens.");
  if(!productTypes.includes(d.product_type as ProductType))errors.push("Choose a product type.");
  for(const [key,max] of [["subtitle",200],["description",20000],["compatibility",200],["current_version",40]] as const){if(typeof d[key]!=="string"||(d[key] as string).length>max)errors.push(key+" exceeds its allowed length or has an invalid value.");}
  if(d.price_eur!==null && (typeof d.price_eur!=="number"||!Number.isFinite(d.price_eur)||d.price_eur<0||d.price_eur>999999.99||Math.abs(d.price_eur*100-Math.round(d.price_eur*100))>=1e-7))errors.push("Price must be between 0 and 999999.99 with at most two decimal places.");
  for(const key of ["category_id","complexity_id"]){if(!Number.isSafeInteger(d[key])||(d[key] as number)<0)errors.push("Invalid "+key.replace("_id","")+" selection.");}
  if(d.release_date!==null && (typeof d.release_date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(d.release_date)||!Number.isFinite(Date.parse(d.release_date))||new Date(d.release_date).toISOString().slice(0,10)!==d.release_date))errors.push("Invalid release date.");
  if(!Array.isArray(d.tool_ids)||d.tool_ids.length>100||new Set(d.tool_ids).size!==d.tool_ids.length||d.tool_ids.some(id=>!Number.isSafeInteger(id)||id<=0))errors.push("Included tools selection is invalid.");
  else if(d.product_type==="tool"&&d.tool_ids.length)errors.push("Individual tools cannot include other tools.");
  return errors;
}
export function validDraft(value:unknown):value is DraftInput{return draftValidationErrors(value).length===0;}
