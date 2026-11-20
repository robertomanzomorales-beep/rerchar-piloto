import Link from "next/link";
import {redirect} from "next/navigation";
import {ReceiptText} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {getExtraCharge,listExtraCharges,extraChargeOverview,extraChargeLabels,type ExtraChargeView} from "@/lib/extra-charges";
import {extraChargeAnchor,extraChargeBoardHref,extraChargeContext,extraChargeFields,extraChargeStatusNames,type ExtraChargeFormKind,type ExtraChargeQuery} from "@/lib/extra-charge-state";
import {financeDay as day,isFinanceId} from "@/lib/finance-catalog-state";
import {financialMoney as money} from "@/lib/financial-detail-state";
import {recordPage,lastRecordPage} from "@/lib/record-pagination";
import {receivableAnchor,receivableHref} from "@/lib/receivable-form-state";
import {Notice,chileCalendarDate,chileDate} from "@/components/UI";
import {ExtraChargeForm} from "@/components/ExtraChargeForm";
import {companyName,serviceFolio,type Company} from "@/lib/companies";
import CompanyScope from "@/components/CompanyScope";
export default async function ExtraCharges({searchParams}:{searchParams:Promise<ExtraChargeQuery>}){
  const actor=await requireActor();if(actor.role!=="admin"&&actor.role!=="operaciones")redirect("/");
  const query=await searchParams,context=extraChargeContext(query),company=context.empresa as Company,view:ExtraChargeView=context.estado==="propuestos"?"propuesto":context.estado==="aprobados"?"aprobado":"",page=recordPage(context.pagina);
  const sourceKind=query.formulario_cargo??query.origen_cargo,kind=sourceKind&&Object.hasOwn(extraChargeFields,sourceKind)?sourceKind as ExtraChargeFormKind:undefined,id=isFinanceId(query.cargo)?query.cargo:undefined;
  const [result,overview,selected]=await Promise.all([listExtraCharges(actor,company,view,101,(page-1)*100),extraChargeOverview(actor,company),id&&kind?getExtraCharge(actor,company,id):undefined]);
  const total=Number(view==="propuesto"?overview.proposed:view==="aprobado"?overview.approved:overview.total),lastPage=lastRecordPage(total);
  if(page>lastPage&&!query.formulario_cargo)redirect(extraChargeBoardHref({...context,pagina:String(lastPage)},"cargos-parte",query));
  const rows=result.slice(0,100),extra=selected&&!rows.some(x=>x.id===selected.id)?selected:undefined;if(extra)rows.unshift(extra);
  const href=(next:number)=>extraChargeBoardHref({...context,pagina:String(next)}),today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  return <div className="extra-charges-page"><CompanyScope company={company}/><div className="page-title-row"><div><div className="eyebrow">CONTROL COMERCIAL · {companyName(company)}</div><h1>Cobros extraordinarios</h1><p className="page-intro">Flete falso, sobreestadía y otros conceptos respaldados por el parte diario.</p></div><span className="title-icon"><ReceiptText size={23}/></span></div>
    <Notice error={query.error} ok={query.formulario_cargo?undefined:query.ok}/>
    <form key={`${company}:${context.estado}`} action="/cobros-extraordinarios" method="GET" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><label>Estado<select name="estado" defaultValue={context.estado}><option value="propuestos">Por decidir</option><option value="aprobados">Aprobados sin factura</option><option value="todos">Todos</option></select></label><button type="submit" className="button button-outline">Aplicar filtros</button></form>
    <div className="supply-summary"><div><strong>{overview.proposed}</strong><span>Por decidir</span></div><div><strong>{overview.approved}</strong><span>Aprobados sin factura</span></div><div><strong>${money(overview.approved_clp)}</strong><span>Neto aprobado sin factura</span></div></div>
    <p className="helper-text">La valorización principal y el estado de pago se conservan por separado. Cada factura externa se cuenta una vez en {actor.role==="admin"?<Link href={`/cobranzas?empresa=${company}`}>Cobranzas</Link>:"Cobranzas de Administración"}, aunque respalde varios cargos o el servicio principal.</p>
    <section id="cargos-parte" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">TRAZABILIDAD · {view==="propuesto"?"POR DECIDIR":view==="aprobado"?"APROBADOS":"TODOS"}</div><h2>Cargos del parte diario</h2></div><span className="count-pill">{total}</span></div>
      {page>lastPage&&<p className="helper-text">Esta página ya no tiene otros cargos. Se conserva la selección para completar la revisión. <Link href={href(lastPage)}>Ver última página disponible</Link>.</p>}
      {rows.length?<div className="extra-charge-records">{rows.map(x=>{
        const canDecide=x.status==="propuesto",canInvoice=x.status==="aprobado"||x.status==="facturado"&&!x.receivable_invoice_id&&!x.linked_service_invoice_id,isSelected=x.id===id;
        return <article key={x.id} id={extraChargeAnchor(x.id)} className="charge-entry finance-section" data-extra-charge={x.id} data-charge-status={x.status}><div className="finance-record-top"><div><strong>{extraChargeLabels[x.kind]}</strong><p className="charge-record-date">Parte del {chileCalendarDate(x.service_day)}</p></div><span className={`badge charge-${x.status}`}>{extraChargeStatusNames[x.status]}</span></div>
          <div className="charge-source-links"><Link href={`/solicitudes/${x.service_id}#cargos-adicionales`}>{serviceFolio(x)}</Link><span>{x.client_name}</span></div><p className="charge-reason">{x.reason}</p>
          <details className="charge-source-details"><summary>Antecedente del parte</summary><p>{x.source_outcome==="completado"?"Realizado":x.source_outcome==="suspendido"?"Suspendido":"Incompleto"} · {x.source_observation||"Sin observación"}</p><small>Registrado por {x.creator_name} el {chileDate(x.created_at)}</small></details>
          <div className="charge-commercial-facts"><div><span>{x.status==="propuesto"?"Neto propuesto":x.status==="descartado"?"Neto propuesto · sin cobro":"Neto acordado"}</span><strong>{x.amount_clp?`$${money(x.amount_clp)}`:"Por acordar"}</strong></div><div><span>Cotización</span><strong>{x.quote_reference||"Sin referencia"}</strong></div><div><span>OC del cliente</span><strong>{x.client_order_reference||"Sin referencia"}</strong></div></div>
          {x.decision_note&&<p className="helper-text">Decisión de {x.decider_name??"administración"}{x.decided_at?` · ${chileDate(x.decided_at)}`:""}: {x.decision_note}</p>}
          {x.invoice_number&&<p className="helper-text">Factura externa <strong>{x.invoice_number}</strong> · {chileCalendarDate(x.invoiced_on)} · {x.receivable_invoice_id||x.linked_service_invoice_id?"Conciliada en Cobranzas":"Pendiente de conciliación"}</p>}
          {actor.role==="admin"&&x.receivable_invoice_id&&<Link className="text-link" href={receivableHref({empresa:company,estado:"todas"},receivableAnchor("payment",x.receivable_invoice_id),{origen:"payment",registro:x.receivable_invoice_id})}>Revisar factura y saldo</Link>}
          {actor.role==="admin"&&x.linked_service_invoice_id&&<Link className="text-link" href={`/cobranzas?empresa=${company}&estado=todas`}>Revisar factura principal en Cobranzas</Link>}
          {extra?.id===x.id&&<p className="helper-text">Cargo seleccionado fuera del filtro o página actual.</p>}
          {actor.role==="admin"&&(canDecide||query.formulario_cargo==="decide"&&isSelected)&&<details className="finance-record-control" open={query.formulario_cargo==="decide"&&isSelected}><summary>Revisar decisión de cobro</summary><ExtraChargeForm key={`decide:${x.id}:${x.status}:${x.amount_clp}`} kind="decide" context={context} today={today} sourceId={x.id} defaults={{amount_clp:x.amount_clp??""}} disabled={!canDecide}/></details>}
          {actor.role==="admin"&&(canInvoice||query.formulario_cargo==="invoice"&&isSelected)&&<details className="finance-record-control" open={query.formulario_cargo==="invoice"&&isSelected}><summary>{x.status==="facturado"?"Conciliar factura anterior":"Registrar factura externa"}</summary><ExtraChargeForm key={`invoice:${x.id}:${x.status}:${x.receivable_invoice_id}:${x.linked_service_invoice_id}`} kind="invoice" context={context} today={today} sourceId={x.id} minimum={day(x.service_day)} defaults={{invoice_number:x.invoice_number??"",invoiced_on:x.invoiced_on?day(x.invoiced_on):""}} disabled={!canInvoice}/></details>}
        </article>;
      })}</div>:<p className="muted">No hay cargos en esta vista. Puede proponerlos desde el parte diario de un servicio o cambiar los filtros.</p>}
      {(page>1||result.length>100)&&<nav className="records-pagination" aria-label="Páginas de cargos extraordinarios"><span>{page>1&&<Link className="button button-outline" href={href(Math.min(page-1,lastPage))}>Anterior</Link>}</span><span>Página {page} · {total} cargos en esta vista</span><span>{result.length>100&&<Link className="button button-outline" href={href(page+1)}>Siguiente</Link>}</span></nav>}
    </section>
  </div>;
}
