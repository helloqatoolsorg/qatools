"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
const Context=createContext<Map<number,boolean>|null|undefined>(undefined);
export function DownloadAvailabilityProvider({children}:{children:ReactNode}) {
  const [availability,setAvailability]=useState<Map<number,boolean>|null>();
  const path=usePathname();
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch("/api/catalog/download-availability",{cache:"no-store",signal:controller.signal});
        const body=await response.json();
        if(!response.ok || !Array.isArray(body.products))throw Error();
        if(!controller.signal.aborted)setAvailability(new Map(body.products.map((p:{id:number;available:boolean})=>[p.id,p.available])));
      }catch{if(!controller.signal.aborted)setAvailability(null);}
    }
    void load();window.addEventListener("focus",load);
    return()=>{controller.abort();window.removeEventListener("focus",load);};
  },[path]);
  return <Context.Provider value={availability}>{children}</Context.Provider>;
}
export function useDownloadAvailability(id:number){
  const value=useContext(Context);
  return value===undefined?undefined:value?.get(id)??null;
}
