import Link from "next/link";
import type {Tariff,TariffNotice} from "@/lib/finance";
import {financeCatalogAnchor,financeDay as day,type FinanceCatalogContext} from "@/lib/finance-catalog-state";
import {FinanceCatalogForm} from "./FinanceCatalogForms";

const amount=(value:string)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
function emailDraft(notice:TariffNotice){
  const email=notice.client_email?.trim();if(!email||!/^\S+@[^@\s]+\.[^@\s]+$/.test(email))return null;
  const subject=`Actualización de tarifa · contrato ${notice.contract_code}`;
  const body=`Estimados ${notice.client_name}:\n\nConforme al acuerdo registrado, informamos el cambio de tarifa para ${notice.service_type}${notice.waste_type?` / ${notice.waste_type}`:""} del contrato ${notice.contract_code}.\n\nValor anterior: $${amount(notice.old_price)} por ${notice.unit}.\nNuevo valor: $${amount(notice.new_price)} por ${notice.unit}, vigente desde ${day(notice.valid_from)}.\nAntecedente: ${notice.reason}.\n\nFavor confirmar recepción.\n\nSaludos cordiales`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function FinanceTariffs({tariffs,context,today,openId,extraId}:{tariffs:Tariff[];context:FinanceCatalogContext;today:string;openId?:string;extraId?:string}){
  return tariffs.length?<ul className="record-list finance-catalog-records">{tariffs.map(t=>{
    const inPeriod=day(t.valid_from)<=today&&(!t.valid_until||day(t.valid_until)>=today),editable=t.available&&inPeriod;
    const status=!t.active?"Inactiva":!t.available?"No disponible":day(t.valid_from)>today?"Programada":t.valid_until&&day(t.valid_until)<today?"Finalizada":"Vigente";
    return <li key={t.id} id={financeCatalogAnchor("tariff",t.id)} className="finance-section" data-finance-tariff={t.id}><div className="finance-record-top"><strong>{t.contract_code} · {t.service_type}</strong><span className={`badge finance-period-${status.toLowerCase().replaceAll(" ","-")}`}>{status}</span></div>
      <div className="finance-record-detail"><span>{t.client_name}{t.site_name?` · ${t.site_name}`:""}</span><strong>${amount(t.unit_price_clp)} / {t.unit}</strong><small>{t.waste_type??"Todos los materiales y equipos"} · {day(t.valid_from)}{t.valid_until?` al ${day(t.valid_until)}`:" en adelante"}</small></div>
      {extraId===t.id&&<p className="helper-text">Tarifa seleccionada fuera de esta página.</p>}
      {(editable||openId===t.id)&&<details className="finance-record-control" open={openId===t.id}><summary>Revisar precio pactado</summary><FinanceCatalogForm key={`${t.id}:${t.unit_price_clp}:${day(t.valid_from)}:${t.valid_until?day(t.valid_until):""}`} kind="revise" context={context} sourceId={t.id} today={today} previousStart={day(t.valid_from)} previousEnd={t.valid_until?day(t.valid_until):null} disabled={!editable}/></details>}
    </li>;
  })}</ul>:<p className="muted">No hay tarifas registradas en esta empresa.</p>;
}
export function FinanceTariffNotices({notices,context,today,pendingCount,pendingOnly,allHref,pendingHref,openId,extraId}:{notices:TariffNotice[];context:FinanceCatalogContext;today:string;pendingCount:string;pendingOnly:boolean;allHref:string;pendingHref:string;openId?:string;extraId?:string}){
  return <section id="avisos-tarifa" className="section-card finance-section"><div className="section-heading"><div><div className="eyebrow">CAMBIOS DE PRECIO</div><h2>Comunicación al cliente</h2></div><span className="count-pill">{pendingCount} por comunicar</span></div>
    <p className="helper-text">El cambio de precio queda registrado con su fecha y motivo. Marque el aviso como realizado después de comunicarlo y guardar la constancia de entrega.</p>
    <nav className="filters finance-notice-filters" aria-label="Filtrar avisos de tarifa"><Link className={`button ${pendingOnly?"button-outline":"button-primary"}`} href={allHref}>Todos los avisos</Link><Link className={`button ${pendingOnly?"button-primary":"button-outline"}`} href={pendingHref}>Por comunicar ({pendingCount})</Link></nav>
    {notices.length?<ul className="record-list finance-catalog-records">{notices.map(n=><li key={n.id} id={financeCatalogAnchor("notice",n.id)} className="finance-section" data-finance-notice={n.id}>
      <div className="finance-record-top"><strong>{n.contract_code} · {n.client_name}</strong><span className={`badge ${n.status==="enviado"?"finance-period-vigente":"finance-period-programada"}`}>{n.status==="enviado"?"Aviso registrado":"Por comunicar"}</span></div><div className="finance-record-detail"><span>{n.service_type} · {n.waste_type??"Tarifa general"}</span><strong>${amount(n.old_price)} → ${amount(n.new_price)} / {n.unit}</strong><small>Vigente desde {day(n.valid_from)}</small><p>Acuerdo: {n.reason}</p>{n.status==="enviado"&&<small>Comunicado el {day(n.notified_on!)} por {n.channel} a {n.recipient} · {n.reference}</small>}</div>
      {extraId===n.id&&<p className="helper-text">Aviso seleccionado fuera del filtro o página actual.</p>}
      {(n.status==="pendiente"||openId===n.id)&&<details className="finance-record-control" open={openId===n.id}><summary>Preparar y registrar aviso</summary>{n.status==="pendiente"&&(emailDraft(n)?<a className="button button-outline" href={emailDraft(n)!}>Preparar correo al cliente</a>:<p className="helper-text">Registre un correo válido en Maestros para preparar el mensaje, o documente una entrega presencial.</p>)}<FinanceCatalogForm key={`${n.id}:${n.status}`} kind="notice" context={context} sourceId={n.id} today={today} defaults={{recipient:n.recipient??n.client_email??"",channel:n.channel??"correo",notified_on:n.notified_on?day(n.notified_on):today,reference:n.reference??""}} disabled={n.status!=="pendiente"}/></details>}
    </li>)}</ul>:<p className="muted">{pendingOnly?"No hay cambios de tarifa pendientes de comunicar.":"Sin cambios de tarifa registrados en esta empresa."}</p>}
  </section>;
}
