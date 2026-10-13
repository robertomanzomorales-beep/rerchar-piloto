import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { requireActor } from "@/lib/auth";

export default async function CompanySelector() {
  const actor = await requireActor();
  return <>
    <div className="eyebrow">PILOTO · OPERACIÓN MULTIEMPRESA</div>
    <h1 className="selector-title">Seleccione la empresa</h1>
    <p className="page-intro">Las cotizaciones y solicitudes se consultan por empresa operadora. Elija con cuál trabajará.</p>
    <div className="company-selector">
      <Link href="/empresa/rerchar" className="company-choice"><span className="company-choice-icon"><Building2 size={30}/></span><span className="eyebrow">OPERACIÓN 01</span><strong>RERCHAR</strong><span>RERCHAR Chile SpA</span><span className="company-choice-action">Ingresar a RERCHAR <ArrowRight size={18}/></span></Link>
      <Link href="/empresa/e_y_j" className="company-choice"><span className="company-choice-icon"><Building2 size={30}/></span><span className="eyebrow">OPERACIÓN 02</span><strong>E y J</strong><span>Empresas de Servicios Integrales E y J Limitada</span><span className="company-choice-action">Ingresar a E y J <ArrowRight size={18}/></span></Link>
    </div>
    {actor.role === "admin" && <p className="selector-note">Los servicios anteriores sin empresa confirmada se conservan <Link href="/solicitudes?empresa=pendiente">por clasificar</Link>.</p>}
  </>;
}
