import Link from "next/link";
import {randomUUID} from "node:crypto";
import {ArrowLeft} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {db} from "@/lib/db";
import {listMaterialCatalog} from "@/lib/material-stock";
import MaterialGuideForm from "@/components/MaterialGuideForm";
import {guideHeaderDefaults,guideItemDefaults} from "@/lib/material-guide-form-state";
import {Notice} from "@/components/UI";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

export default async function NewMaterialGuide({searchParams}:{searchParams:Promise<{error?:string}>}){
  const actor=await requireActor();
  if(!canManage(actor))return <section className="section-card"><h1>Nueva guía</h1><p>Sin permiso para registrar guías.</p></section>;
  if(!await moduleReady("guias"))return <ModuleUnavailable title="Nueva guía de material" company="rerchar"/>;
  const [clients,catalog,query]=await Promise.all([db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"),listMaterialCatalog(actor),searchParams]);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const values={...guideHeaderDefaults(undefined,today),...guideItemDefaults(undefined),submission_key:randomUUID()};
  return <>
    <Link href="/control-guias" className="back-link"><ArrowLeft size={16}/> Volver al control de guías</Link>
    <div className="page-title-row"><div><div className="eyebrow">RERCHAR · REGISTRO OPERATIVO</div><h1>Nueva guía de material</h1><p className="page-intro">Registre la salida o entrada con su primer material. Después podrá agregar más ítems a este mismo número de guía.</p></div></div>
    <Notice error={query.error}/>
    {clients.length?<section className="section-card form-card"><MaterialGuideForm kind="create" values={values} clients={clients} catalog={catalog}/></section>:<section className="section-card"><p>Primero registre la contraparte en Clientes o Maestros.</p><Link href="/maestros" className="button button-outline">Ir a Maestros</Link></section>}
  </>;
}
