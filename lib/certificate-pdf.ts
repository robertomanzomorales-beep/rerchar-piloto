import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import QRCode from "qrcode";
import fontkit from "@pdf-lib/fontkit";
import {PDFDocument,rgb} from "pdf-lib";
import type {PDFFont} from "pdf-lib";

export type CertificateSnapshot={
  folio:string;client_name:string;site_name:string;service_type:string;waste_type:string;
  category:string;classification:string;quantity_kg:string;guide_number:string;
  generator_name:string;transporter_name:string;receiver_name:string;treatment:string;closed_at:string;
  movement_date?:string|null;valued_guide_number?:string|null;weight_ticket?:string|null;plate?:string|null;invoice_number?:string|null;
};
export type PrintableCertificate={code:string;version:number;issued_at:Date|string;snapshot:CertificateSnapshot};

export async function renderCertificatePdf(certificate:PrintableCertificate,verificationUrl:string){
  const doc=await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`RERCHAR | Certificado operacional ${certificate.snapshot.folio} v${certificate.version}`);
  doc.setSubject("Constancia del servicio y sus datos revisados dentro de RERCHAR");
  doc.setCreator("RERCHAR Industrial Waste Management System");
  const page=doc.addPage([595.28,841.89]);
  const regular=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-regular.ttf")),{subset:true});
  const bold=await doc.embedFont(await readFile(resolve(process.cwd(),"public/fonts/montserrat-bold.ttf")),{subset:true});
  const ink=rgb(0.15,0.22,0.19),muted=rgb(0.42,0.48,0.44),green=rgb(0.04,0.42,0.29);
  const pale=rgb(0.95,0.97,0.95),line=rgb(0.82,0.87,0.83),white=rgb(1,1,1);
  // This embedded Latin font covers Spanish text. Replace emoji and unsupported script characters.
  function safe(text:unknown){return [...String(text??"").normalize("NFC")].map(char=>
    /^[\u0020-\u024f]$/.test(char)?char:"?").join("");}
  function fit(text:unknown,font:PDFFont,size:number,maxWidth:number){
    let source=safe(text).replace(/\s+/g," ").trim();
    if(font.widthOfTextAtSize(source,size)<=maxWidth)return source||"-";
    while(source.length>0&&font.widthOfTextAtSize(`${source}...`,size)>maxWidth)source=source.slice(0,-1);
    return `${source.trimEnd()}...`;
  }
  function write(text:unknown,x:number,y:number,size=10,weight:PDFFont=regular,color=ink,maxWidth=490){
    page.drawText(fit(text,weight,size,maxWidth),{x,y,size,font:weight,color});
  }
  function field(label:string,value:unknown,x:number,y:number,width:number){
    write(label.toUpperCase(),x,y,8,bold,muted,width);
    write(value,x,y-17,11,bold,ink,width);
  }
  page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:white});
  page.drawRectangle({x:0,y:824,width:595.28,height:18,color:green});
  const logo=await doc.embedPng(await readFile(resolve(process.cwd(),"public/rerchar-logo-transparente.png")));
  page.drawImage(logo,{x:45,y:736,width:178,height:62});
  write("INDUSTRIAL WASTE MANAGEMENT SYSTEM",45,722,8,bold,muted,410);
  write("CERTIFICADO OPERACIONAL",45,680,22,bold,ink,500);
  write("DE SERVICIO",45,651,22,bold,green,500);
  page.drawLine({start:{x:45,y:635},end:{x:550,y:635},thickness:1.3,color:line});
  write(`FOLIO ${certificate.snapshot.folio}`,45,612,12,bold,green,240);
  write(`VERSIÓN ${certificate.version}`,368,612,9,bold,muted,180);
  const issueDate=new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"America/Santiago"}).format(new Date(certificate.issued_at));
  write(`Emitido el ${issueDate}`,45,591,10,regular,muted,460);
  page.drawRectangle({x:45,y:471,width:505,height:101,color:pale});
  field("Cliente",certificate.snapshot.client_name,60,546,222);
  field("Centro o faena",certificate.snapshot.site_name,307,546,220);
  field("Peso neto registrado",`${Number(certificate.snapshot.quantity_kg).toLocaleString("es-CL")} kg`,60,499,222);
  field("Guía de respaldo",certificate.snapshot.guide_number,307,499,220);
  write("TRAZABILIDAD REGISTRADA",45,455,11,bold,green,450);
  page.drawLine({start:{x:45,y:446},end:{x:550,y:446},thickness:1,color:line});
  field("Tipo de servicio",certificate.snapshot.service_type,45,434,235);
  field("Residuo",certificate.snapshot.waste_type,303,434,245);
  field("Generador",certificate.snapshot.generator_name,45,397,235);
  field("Transportista",certificate.snapshot.transporter_name,303,397,245);
  field("Receptor",certificate.snapshot.receiver_name,45,360,235);
  field("Destino / tratamiento informado",certificate.snapshot.treatment,303,360,245);
  field("Clasificación revisada",certificate.snapshot.classification,45,323,235);
  field("Categoría informada",certificate.snapshot.category.replaceAll("_"," "),303,323,245);
  write("REFERENCIAS DEL TRASLADO",45,286,10,bold,green,505);
  const cols=[{label:"FECHA",value:certificate.snapshot.movement_date?certificate.snapshot.movement_date.slice(0,10):certificate.snapshot.closed_at.slice(0,10),x:45,w:64},
    {label:"GD VALORIZADA",value:certificate.snapshot.valued_guide_number,x:110,w:80},
    {label:"TICKET PESAJE",value:certificate.snapshot.weight_ticket,x:191,w:80},
    {label:"PATENTE",value:certificate.snapshot.plate,x:272,w:63},
    {label:"FACTURA",value:certificate.snapshot.invoice_number,x:336,w:62},
    {label:"DESCRIPCIÓN",value:certificate.snapshot.waste_type,x:399,w:91},
    {label:"TOTAL KG",value:Number(certificate.snapshot.quantity_kg).toLocaleString("es-CL"),x:491,w:59}];
  page.drawRectangle({x:45,y:258,width:505,height:19,color:green});
  page.drawRectangle({x:45,y:231,width:505,height:27,color:pale,borderColor:line,borderWidth:.5});
  for(const column of cols){write(column.label,column.x+3,264,6.1,bold,white,column.w-5);write(column.value||"—",column.x+3,241,7,bold,ink,column.w-5);}
  page.drawRectangle({x:45,y:67,width:505,height:151,color:rgb(0.97,0.98,0.97),borderColor:line,borderWidth:1});
  const qrData=await QRCode.toDataURL(verificationUrl,{errorCorrectionLevel:"H",margin:2,width:440,
    color:{dark:"#172F27FF",light:"#FFFFFFFF"}});
  const qr=await doc.embedPng(Buffer.from(qrData.split(",")[1],"base64"));
  page.drawImage(qr,{x:59,y:79,width:127,height:127});
  write("VERIFICACIÓN DIGITAL",205,181,11,bold,green,290);
  write("Escanee el código para consultar vigencia y versión.",205,157,9,regular,ink,326);
  write(verificationUrl,205,133,8,regular,muted,330);
  write(`Código: ${certificate.code.slice(0,16).toUpperCase()}...`,205,105,8,bold,ink,320);
  page.drawLine({start:{x:45,y:57},end:{x:550,y:57},thickness:1,color:line});
  write("Constancia basada en los registros revisados. No reemplaza declaraciones oficiales ni documentos de terceros.",45,42,7,regular,muted,507);
  write("RERCHAR Industrial Waste Management System  |  Diseñado y potenciado por vialoop.cl",45,26,7,bold,muted,507);
  return doc.save();
}
