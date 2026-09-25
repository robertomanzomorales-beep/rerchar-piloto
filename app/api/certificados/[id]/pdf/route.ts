import {getActor} from "@/lib/auth";
import {CertificateError,getCertificate,recordDownload,verificationUrl} from "@/lib/certificates";
import {renderCertificatePdf} from "@/lib/certificate-pdf";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  const {id}=await params;
  let certificate;
  try{certificate=await getCertificate(actor,id);}catch(error){if(error instanceof CertificateError)return new Response("No encontrado",{status:404});throw error;}
  if(certificate.status!=="vigente")return new Response("Certificado revocado",{status:410});
  const pdf=await renderCertificatePdf(certificate,verificationUrl(certificate.code));
  try{await recordDownload(actor,certificate.id);}catch(error){if(error instanceof CertificateError)return new Response("Certificado revocado",{status:410});throw error;}
  const filename=`rerchar-certificado-${certificate.snapshot.folio}-v${certificate.version}.pdf`;
  return new Response(new Uint8Array(pdf),{headers:{
    "Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
