"use client";

import {createContext,useContext,useEffect,type Dispatch,type SetStateAction} from "react";
import {usePathname} from "next/navigation";
import type {Company} from "@/lib/companies";

export type DocumentCompany={pathname:string;company:Company};
export const CompanyScopeContext=createContext<Dispatch<SetStateAction<DocumentCompany|null>>|null>(null);

// La empresa del registro autorizado prevalece sobre la última empresa visitada.
export default function CompanyScope({company}:{company:Company|null|undefined}){
  const pathname=usePathname(),setScope=useContext(CompanyScopeContext);
  useEffect(()=>{
    if(!company||!setScope)return;
    setScope(previous=>previous?.pathname===pathname&&previous.company===company?previous:{pathname,company});
    return()=>setScope(previous=>previous?.pathname===pathname?null:previous);
  },[company,pathname,setScope]);
  return null;
}
