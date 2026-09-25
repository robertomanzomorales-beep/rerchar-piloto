import Link from "next/link";
import {ShieldCheck,ShieldX} from "lucide-react";
import {publicVerification} from "@/lib/certificates";

export const metadata={title:"Verificar certificado | RERCHAR",robots:{index:false,follow:false}};
export default async function VerifyPage({params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  const result=await publicVerification(code);
  const valid=result?.status==="vigente";
  const issued=result?.issued_at?new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"America/Santiago"}).format(new Date(result.issued_at)):"";
  return <main className="verification-page"><article className="verification-card">
    <div className="eyebrow">RERCHAR · VERIFICACIÓN DIGITAL</div>
    <span className={valid?"verification-symbol valid":"verification-symbol invalid"}>{valid?<ShieldCheck size={32}/>:<ShieldX size={32}/>}</span>
    <h1>{valid?"Certificado vigente":result?"Certificado revocado":"Código no encontrado"}</h1>
    <p>{valid?`Esta versión ${result.version} fue emitida el ${issued} y continúa vigente.`:
      result?"El documento asociado a este código perdió vigencia. Solicite a RERCHAR su versión actual.":
      "No consta un certificado asociado a este código. Compruebe la dirección impresa en el documento."}</p>
    <p className="helper-text">Esta consulta informa únicamente la vigencia. Los datos del servicio y los documentos se consultan con una cuenta autorizada.</p>
    <Link className="button button-outline" href="/ingresar">Acceso a la plataforma</Link>
  </article></main>;
}
