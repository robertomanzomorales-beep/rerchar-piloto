import {createHash,randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import type {Actor} from "@/lib/auth";
import type {Company} from "@/lib/companies";
import {extraChargeDays,extraChargeLabels,serviceExtraCharges} from "@/lib/extra-charges";
import {extraChargeAnchor,extraChargeBoardHref,extraChargeStatusNames,serviceChargeHref,type ExtraChargeQuery} from "@/lib/extra-charge-state";
import {serviceDayContext} from "@/lib/service-day-state";
import {financeDay as day,isFinanceId} from "@/lib/finance-catalog-state";
import {financialMoney} from "@/lib/financial-detail-state";
import {lastRecordPage,recordPage} from "@/lib/record-pagination";
import {resultLabel} from "@/lib/service-day";
import {chileCalendarDate} from "./UI";
import {ExtraChargeForm} from "./ExtraChargeForm";
export default async function ServiceExtraCharges({actor,serviceId,company,query,today}:{actor:Actor;serviceId:string;company:Company|null;query:ExtraChargeQuery;today:string}){
  const [charges,reports]=await Promise.all([serviceExtraCharges(actor,serviceId),extraChargeDays(actor,serviceId)]),days=reports.filter(r=>day(r.day)<=today).map(r=>({day:day(r.day),label:`${chileCalendarDate(r.day)} · ${resultLabel[r.outcome as keyof typeof resultLabel]??r.outcome}`,observation:r.observation}));
  if(!charges.length&&!reports.length&&!query.formulario_cargo)return null;
  const page=recordPage(query.pagina_cargos),last=lastRecordPage(charges.length),context={...serviceDayContext(query),empresa:company??"rerchar",...(page>1?{pagina_cargos:String(page)}:{})};
  if(page>last&&!query.formulario_cargo&&!query.formulario)redirect(serviceChargeHref(serviceId,{...context,pagina_cargos:String(last)},"cargos-adicionales",query));
  const rows=charges.slice((page-1)*100,page*100),selected=isFinanceId(query.cargo)?charges.find(c=>c.id===query.cargo):undefined,extra=selected&&!rows.some(c=>c.id===selected.id)?selected:undefined;if(extra)rows.unshift(extra);
  const version=createHash("sha256").update(JSON.stringify([charges.map(c=>c.id),company])).digest("hex").slice(0,16);
  return <section id="cargos-adicionales" className="section-card service-operation-section extra-charges-service"><div className="section-heading"><div><div className="eyebrow">EXCEPCIONES COMERCIALES</div><h2>Flete falso y sobreestadía</h2></div><Link href={extraChargeBoardHref({empresa:company??"rerchar"})}>Ver control</Link></div>
    <p className="helper-text">Proponga el cargo con respaldo en un parte diario. Administración decide si se cobra y confirma el monto. La valorización principal se conserva por separado.</p>
    <details id="proponer-cargo" className="finance-record-control finance-section" open={query.formulario_cargo==="propose"}><summary>Proponer cargo para revisión</summary>{!days.length&&<p className="helper-text">Registre primero el <a href="#parte-diario">parte diario del servicio</a>.</p>}<ExtraChargeForm key={`propose:${serviceId}:${version}`} kind="propose" context={context} serviceId={serviceId} today={today} nonce={randomUUID()} days={days} disabled={!company||!days.length}/></details>
    {charges.length>0&&<><div className="section-heading charge-history-heading"><h3>Cargos registrados</h3><span className="count-pill">{charges.length}</span></div><ul className="record-list extra-charge-service-records">{rows.map(x=><li key={x.id} id={extraChargeAnchor(x.id)} className="finance-section" data-service-extra-charge={x.id}><div className="finance-record-top"><strong>{extraChargeLabels[x.kind]} · {chileCalendarDate(x.service_day)}</strong><span className={`badge charge-${x.status}`}>{extraChargeStatusNames[x.status]}</span></div><p>{x.reason}</p><small>{x.amount_clp?`${x.status==="aprobado"||x.status==="facturado"?"Neto acordado":"Neto propuesto"}: $${financialMoney(x.amount_clp)}`:"Monto por acordar"}{x.invoice_number?` · Factura ${x.invoice_number}`:""}</small>{extra?.id===x.id&&<small>Cargo seleccionado fuera de esta página.</small>}<Link className="text-link" href={extraChargeBoardHref({empresa:company??"rerchar"},extraChargeAnchor(x.id),{origen_cargo:x.status==="propuesto"?"decide":"invoice",cargo:x.id})}>Revisar cargo en el tablero</Link></li>)}</ul></>}
    {page>last&&<p className="helper-text">Se conserva la ficha para completar la revisión. <Link href={serviceChargeHref(serviceId,{...context,pagina_cargos:String(last)})}>Ver última página disponible</Link>.</p>}
    {last>1&&<nav className="records-pagination" aria-label="Páginas de cargos del servicio"><span>{page>1&&<Link className="button button-outline" href={serviceChargeHref(serviceId,{...context,pagina_cargos:String(Math.min(page-1,last))})}>Anterior</Link>}</span><span>Página {page} de {last} · {charges.length} cargos</span><span>{page<last&&<Link className="button button-outline" href={serviceChargeHref(serviceId,{...context,pagina_cargos:String(page+1)})}>Siguiente</Link>}</span></nav>}
  </section>;
}
