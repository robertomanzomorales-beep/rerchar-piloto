"use client";
import {useRef,useState} from "react";
import {Printer} from "lucide-react";
import {waitForPrintAssets} from "@/lib/print-readiness";
export default function PrintButton({label="Imprimir o guardar PDF",prepare=false}:{label?:string;prepare?:boolean}){
  const [pending,setPending]=useState(false),[error,setError]=useState(""),locked=useRef(false);
  async function print(){
    if(locked.current)return;locked.current=true;setPending(true);setError("");
    try{if(prepare)await waitForPrintAssets(document.fonts?.ready??Promise.resolve(),Array.from(document.querySelectorAll<HTMLImageElement>(".order-sheet img")));window.print();}
    catch(error){setError(error instanceof Error?error.message:"No se pudo preparar la impresión. Intente nuevamente.");}
    finally{locked.current=false;setPending(false);}
  }
  return <div className="print-control print-hide"><button type="button" className="button button-primary" disabled={pending} onClick={print} aria-busy={pending}><Printer size={17}/>{pending?"Preparando documento…":label}</button>{error&&<span role="alert" className="print-control-error">{error}</span>}</div>;
}
