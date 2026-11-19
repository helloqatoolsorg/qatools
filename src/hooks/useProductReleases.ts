"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import type {ProductRelease} from "@/lib/productRelease";

export function useProductReleases(productId:number|null) {
  const [result,setResult]=useState<{productId:number;releases:ProductRelease[];error:string|null}|null>(null);
  const [choice,setChoice]=useState<{productId:number;id:string}|null>(null);
  useEffect(()=>{
    if(!productId)return;
    const controller=new AbortController();
    void (async()=>{
      try {
        const session=await supabase.auth.getSession();
        const response=await fetch('/api/products/releases?productId='+productId,{cache:'no-store',signal:controller.signal,
          headers:session.data.session?{Authorization:'Bearer '+session.data.session.access_token}:{}});
        const body=await response.json();
        if(!response.ok||!Array.isArray(body.releases))throw Error(body.error??'Version history is unavailable.');
        if(!controller.signal.aborted)setResult({productId,releases:body.releases,error:null});
      }catch(error){if(!controller.signal.aborted)setResult({productId,releases:[],error:error instanceof Error?error.message:'Version history is unavailable.'});}
    })();
    return()=>controller.abort();
  },[productId]);
  const releases=result?.productId===productId?result.releases:[];
  const selectedRelease=(choice?.productId===productId?releases.find(r=>r.id===choice.id):null)??releases.find(r=>r.latest)??releases[0]??null;
  return {releases,selectedRelease,error:result?.productId===productId?result.error:null,
    selectRelease:(id:string)=>{if(productId&&releases.some(r=>r.id===id))setChoice({productId,id});}};
}
