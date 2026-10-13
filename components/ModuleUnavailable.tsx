import Link from "next/link";
import {AlertTriangle,ArrowLeft} from "lucide-react";

export default function ModuleUnavailable({title,company}:{title:string;company:"rerchar"|"e_y_j"}){
  return <section className="section-card module-unavailable" role="status">
    <span className="module-unavailable-icon"><AlertTriangle size={22}/></span>
    <div className="eyebrow">CONFIGURACIÓN PENDIENTE</div>
    <h1>{title}</h1>
    <p>Este módulo aún no está habilitado en la base de datos. Administración debe completar su configuración antes de registrar o consultar documentos aquí.</p>
    <Link className="button button-outline" href={`/empresa/${company}`}><ArrowLeft size={16}/> Volver al panel de empresa</Link>
  </section>;
}
