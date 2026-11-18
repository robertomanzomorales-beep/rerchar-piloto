import Link from "next/link";
import Image from "next/image";
import {requireActor} from "@/lib/auth";

export default async function CompanySelector(){
  const actor=await requireActor();
  return <div className="workspace-gateway">
    <header className="gateway-heading">
      <div><p className="gateway-overline">RERCHAR · E Y J</p><h1>Selecciona tu espacio<br className="gateway-title-break"/> de trabajo.</h1></div>
      <p className="gateway-intro">Accede a los procesos, documentos y seguimiento de la empresa con la que vas a operar.</p>
    </header>
    <section className="gateway-companies" aria-label="Empresas operadoras">
      <Link href="/empresa/rerchar" className="gateway-company gateway-company--rerchar" aria-label="Abrir RERCHAR · Gestión de materiales">
        <div className="gateway-company-brand"><div className="gateway-brand-stage"><Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={892} height={311} priority className="gateway-rerchar-logo"/></div><span className="gateway-legal-name">RERCHAR Chile SpA</span></div>
        <div className="gateway-company-copy"><span className="gateway-company-category">Gestión de materiales</span><h2>Materiales y<br/> economía circular.</h2><p>Recepción, valorización y trazabilidad de materiales industriales.</p></div>
        <ul className="gateway-processes" aria-label="Procesos de RERCHAR"><li>Recepción e ingresos</li><li>Guías y trazabilidad</li><li>Inventario de materiales</li></ul>
        <div className="gateway-company-footer"><span className="gateway-enter">Abrir RERCHAR</span><span className="gateway-workspace-label">Espacio de trabajo</span></div>
      </Link>
      <Link href="/empresa/e_y_j" className="gateway-company gateway-company--eyj" aria-label="Abrir E y J · Servicios industriales">
        <div className="gateway-company-brand"><div className="gateway-brand-stage"><span className="gateway-eyj-wordmark"><strong>E y J</strong><span>Servicios Integrales</span></span></div><span className="gateway-legal-name">Empresas de Servicios Integrales E y J Limitada</span></div>
        <div className="gateway-company-copy"><span className="gateway-company-category">Servicios industriales</span><h2>Servicios y<br/> contratos.</h2><p>Transporte, arriendo y seguimiento de servicios industriales.</p></div>
        <ul className="gateway-processes" aria-label="Procesos de E y J"><li>Programación y despacho</li><li>Estados de pago</li><li>Facturación y cobranza</li></ul>
        <div className="gateway-company-footer"><span className="gateway-enter">Abrir E y J</span><span className="gateway-workspace-label">Espacio de trabajo</span></div>
      </Link>
    </section>
    <footer className="gateway-footer"><p>Cada empresa conserva sus documentos y procesos en su propio espacio.</p>{actor.role==="admin"&&<Link href="/solicitudes?empresa=pendiente">Revisar servicios por clasificar</Link>}</footer>
  </div>;
}
