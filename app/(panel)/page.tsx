import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireActor } from "@/lib/auth";

export default async function CompanySelector() {
  const actor = await requireActor();
  return <>
    <div className="selector-heading"><div className="eyebrow">PLATAFORMA OPERATIVA</div><h1 className="selector-title">Seleccionar empresa</h1><p className="page-intro">Elija la operación para acceder a sus procesos, documentos y panel de control.</p></div>
    <div className="company-selector">
      <Link href="/empresa/rerchar" className="company-choice company-choice--rerchar"><span className="company-choice-banner"><span>GESTIÓN DE MATERIALES</span><strong>RERCHAR</strong><small>RERCHAR Chile SpA</small></span><span className="company-choice-body"><span className="company-choice-description">Recepción, valorización y trazabilidad de materiales industriales.</span><span className="company-choice-processes">Control de guías <span/> Ingresos <span/> Stock de materiales</span><span className="company-choice-action">Abrir operación <ArrowRight size={18}/></span></span></Link>
      <Link href="/empresa/e_y_j" className="company-choice company-choice--eyj"><span className="company-choice-banner"><span>SERVICIOS INDUSTRIALES</span><strong>E y J</strong><small>Empresas de Servicios Integrales E y J Limitada</small></span><span className="company-choice-body"><span className="company-choice-description">Servicios, transporte y seguimiento administrativo de contratos.</span><span className="company-choice-processes">Despacho <span/> Estados de pago <span/> Cobranza</span><span className="company-choice-action">Abrir operación <ArrowRight size={18}/></span></span></Link>
    </div>
    {actor.role === "admin" && <p className="selector-note">Los servicios anteriores sin empresa confirmada se conservan <Link href="/solicitudes?empresa=pendiente">por clasificar</Link>.</p>}
  </>;
}
