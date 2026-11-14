import Link from "next/link";
import { ArrowRight, Recycle, Truck } from "lucide-react";
import { requireActor } from "@/lib/auth";

export default async function CompanySelector() {
  const actor = await requireActor();
  return <>
    <div className="eyebrow">PLATAFORMA OPERATIVA · GRUPO RERCHAR</div>
    <h1 className="selector-title">Seleccione la empresa</h1>
    <p className="page-intro">Cada operación tiene su propio panel, procesos y seguimiento. Elija la empresa con la que trabajará.</p>
    <div className="company-selector">
      <Link href="/empresa/rerchar" className="company-choice company-choice--rerchar"><span className="company-choice-icon"><Recycle size={27} strokeWidth={1.8}/></span><span className="company-choice-kicker">01 / GESTIÓN DE MATERIALES</span><strong>RERCHAR</strong><span className="company-choice-legal">RERCHAR Chile SpA</span><p>Recepción, valorización, guías y trazabilidad de residuos industriales.</p><span className="company-choice-action">Entrar al panel <ArrowRight size={18}/></span></Link>
      <Link href="/empresa/e_y_j" className="company-choice company-choice--eyj"><span className="company-choice-icon"><Truck size={27} strokeWidth={1.8}/></span><span className="company-choice-kicker">02 / SERVICIOS INDUSTRIALES</span><strong>E y J</strong><span className="company-choice-legal">Empresas de Servicios Integrales E y J Limitada</span><p>Servicios, transporte, estados de pago y control administrativo.</p><span className="company-choice-action">Entrar al panel <ArrowRight size={18}/></span></Link>
    </div>
    {actor.role === "admin" && <p className="selector-note">Los servicios anteriores sin empresa confirmada se conservan <Link href="/solicitudes?empresa=pendiente">por clasificar</Link>.</p>}
  </>;
}
