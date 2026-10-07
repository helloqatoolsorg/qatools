"use client";
import { useEffect, useRef } from "react";
import { useQAToolsState } from "@/context/QAToolsState";
// Feedback follows the real cart count; it never changes cart or purchase state.
export default function CartCountFeedback(){
 const {cartCount}=useQAToolsState();
 const previous=useRef(cartCount);
 useEffect(()=>{
  const increased=cartCount>previous.current;previous.current=cartCount;
  if(!increased || window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const animations:Animation[]=[];
  document.querySelectorAll<HTMLElement>(".cart-count").forEach(badge=>{
   if(typeof badge.animate==="function")animations.push(badge.animate([{transform:"translateY(0) scale(1)"},{transform:"translateY(-2px) scale(1.35)"},{transform:"translateY(1px) scale(.94)"},{transform:"translateY(0) scale(1)"}],{duration:340,easing:"cubic-bezier(.2,.75,.25,1)"}));
  });
  return()=>animations.forEach(animation=>animation.cancel());
 },[cartCount]);
 return null;
}
