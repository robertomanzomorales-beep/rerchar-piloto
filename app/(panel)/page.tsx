import Link from "next/link";
import { requireActor } from "@/lib/auth";

export default async function CompanySelector() {
  const actor = await requireActor();
  return <>
    <div className="selector-heading"><div className="eyebrow">ESPACIOS DE TRABAJO</div><h1 className="selector-title">Seleccionar empresa</h1><p className="page-intro">Cada empresa mantiene sus procesos y documentos en un espacio de trabajo propio.</p></div>
    <div className="company-selector" aria-label="Empresas operadoras">
      <Link href="/empresa/rerchar" className="company-choice company-choice--rerchar"><span className="company-choice-identity"><span className="company-choice-kicker">GESTIÓN DE MATERIALES</span><strong>RERCHAR</strong><small>RERCHAR Chile SpA</small></span><span className="company-choice-details"><span>Recepción, valorización y trazabilidad de materiales industriales.</span><small>Guías · Ingresos · Stock</small></span><span className="company-choice-action">Acceder</span></Link>
      <Link href="/empresa/e_y_j" className="company-choice company-choice--eyj"><span className="company-choice-identity"><span className="company-choice-kicker">SERVICIOS INDUSTRIALES</span><strong>E y J</strong><small>Empresas de Servicios Integrales E y J Limitada</small></span><span className="company-choice-details"><span>Servicios, transporte y seguimiento de contratos.</span><small>Despacho · Estados de pago · Cobranza</small></span><span className="company-choice-action">Acceder</span></Link>
    </div>
    {actor.role === "admin" && <p className="selector-note">Los servicios anteriores sin empresa confirmada se conservan <Link href="/solicitudes?empresa=pendiente">por clasificar</Link>.</p>}
  </>;
}
