"use client";

import {useTransition} from "react";
import {useRouter} from "next/navigation";
import {RotateCw} from "lucide-react";

export default function DashboardRefresh(){
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  return <button type="button" className="button button-outline company-refresh" disabled={pending}
    aria-label="Actualizar panel de control" aria-busy={pending}
    onClick={()=>startTransition(()=>router.refresh())}>
    <RotateCw size={14} aria-hidden="true"/><span>{pending?"Actualizando…":"Actualizar"}</span>
  </button>;
}
