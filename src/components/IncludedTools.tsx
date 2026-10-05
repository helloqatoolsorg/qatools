"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { supabase } from "@/lib/supabase";
type Tool={id:number;name:string;slug:string};
export default function IncludedTools({productId}:{productId:number}){
 const [tools,setTools]=useState<Tool[]>([]),[error,setError]=useState(false);
 useEffect(()=>{let cancelled=false;(async()=>{try{const members=await supabase.from("product_members").select("tool_id").eq("product_id",productId);if(members.error)throw Error("Unavailable");if(!members.data.length)return;const result=await supabase.from("products").select("id,name,slug").in("id",members.data.map(m=>m.tool_id)).eq("published",true).order("name");if(result.error)throw Error("Unavailable");if(!cancelled){setTools(result.data);setError(false);}}catch{if(!cancelled)setError(true);}})();return()=>{cancelled=true;};},[productId]);
 if(error)return <p>Included tools could not be loaded.</p>;
 if(!tools.length)return null;
 return <section className="product-included-tools"><p>Included tools</p><div className="tags">{tools.map(tool=><Link className="card-tag" key={tool.id} href={"/product?slug="+encodeURIComponent(tool.slug)}>{tool.name}</Link>)}</div></section>;
}
