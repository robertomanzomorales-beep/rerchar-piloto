import {recordTariffNoticeAction,reviseTariffAction} from "@/app/finance-actions";
import type {Tariff,TariffNotice} from "@/lib/finance";
import {SubmitButton} from "./Transition";

const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const amount=(value:string)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
function emailDraft(notice:TariffNotice){
  if(!notice.client_email)return null;
  const subject=`Actualización de tarifa · contrato ${notice.contract_code}`;
  const body=`Estimados ${notice.client_name}:\n\nConforme al acuerdo registrado, informamos el cambio de tarifa para ${notice.service_type}${notice.waste_type?` / ${notice.waste_type}`:""} del contrato ${notice.contract_code}.\n\nValor anterior: $${amount(notice.old_price)} por ${notice.unit}.\nNuevo valor: $${amount(notice.new_price)} por ${notice.unit}, vigente desde ${day(notice.valid_from)}.\nAntecedente: ${notice.reason}.\n\nFavor confirmar recepción.\n\nSaludos cordiales`;
  return `mailto:${encodeURIComponent(notice.client_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function FinanceTariffs({tariffs,company,today}:{tariffs:Tariff[];company:string;today:string}){
  return <>
    <ul className="record-list">{tariffs.map(t=><li key={t.id}><div><strong>{t.contract_code} · {t.service_type}</strong><small>{t.waste_type??"Todos los materiales y equipos"} · ${amount(t.unit_price_clp)}/{t.unit} · {day(t.valid_from)}{t.valid_until?` al ${day(t.valid_until)}`:" en adelante"}</small></div>
      {day(t.valid_from)<=today&&(!t.valid_until||day(t.valid_until)>=today)&&<details className="small-action"><summary>Revisar precio pactado</summary><p className="helper-text">Conserva el precio anterior hasta el día previo a la nueva vigencia. Revise el acuerdo antes de comunicarlo al cliente.</p><form action={reviseTariffAction} className="form-stack compact"><input type="hidden" name="company_view" value={company}/><input type="hidden" name="tariff_id" value={t.id}/><label>Nuevo precio unitario CLP<input name="unit_price_clp" type="number" min="0" step="0.01" required/></label><label>Vigente desde<input name="valid_from" type="date" required/></label><label>Acuerdo o respaldo del cambio<textarea name="reason" minLength={10} maxLength={500} required rows={2}/></label><SubmitButton className="button button-outline">Guardar nueva vigencia</SubmitButton></form></details>}</li>)}</ul>
  </>;
}
export function FinanceTariffNotices({notices,company,today}:{notices:TariffNotice[];company:string;today:string}){
  return <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CAMBIOS DE PRECIO</div><h2>Comunicación al cliente</h2></div><span className="count-pill">{notices.filter(n=>n.status==="pendiente").length} por comunicar</span></div>
      <p className="helper-text">La nueva tarifa queda registrada con su fecha y motivo. El aviso se marca como enviado sólo después de comunicarlo efectivamente y guardar la referencia.</p>
      {notices.length?<ul className="record-list">{notices.map(n=><li key={n.id}><div><strong>{n.contract_code} · {n.client_name} · {n.service_type}</strong><small>{n.waste_type??"Tarifa general"} · ${amount(n.old_price)} → ${amount(n.new_price)}/{n.unit} desde {day(n.valid_from)}</small><small>Acuerdo: {n.reason}</small>{n.status==="enviado"&&<small>Comunicado el {day(n.notified_on!)} por {n.channel} a {n.recipient} · {n.reference}</small>}</div>
        {n.status==="pendiente"&&<details className="small-action"><summary>Preparar y registrar aviso</summary>{emailDraft(n)?<a className="button button-outline" href={emailDraft(n)!}>Preparar correo al cliente</a>:<p className="helper-text">No hay correo del cliente en Maestros. Regístrelo antes de enviar, o utilice entrega presencial.</p>}<form action={recordTariffNoticeAction} className="form-stack compact"><input type="hidden" name="company_view" value={company}/><input type="hidden" name="notice_id" value={n.id}/><label>Medio<select name="channel" defaultValue="correo"><option value="correo">Correo enviado</option><option value="presencial">Entrega presencial</option></select></label><label>Destinatario real (correo o persona)<input name="recipient" defaultValue={n.client_email??""} minLength={2} maxLength={254} required/></label><label>Fecha de comunicación<input name="notified_on" type="date" defaultValue={today} required/></label><label>Constancia de entrega<textarea name="reference" minLength={10} maxLength={500} required rows={2} placeholder="Correo enviado, respuesta o acta"/></label><SubmitButton className="button button-outline">Registrar aviso realizado</SubmitButton></form></details>}</li>)}</ul>:<p className="muted">Sin cambios de tarifa registrados en esta empresa.</p>}
    </section>;
}
