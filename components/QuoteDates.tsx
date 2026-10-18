"use client";
import {useState} from "react";

function tenDays(value:string){
  const date=new Date(`${value}T12:00:00Z`);
  if(Number.isNaN(date.getTime()))return "";
  date.setUTCDate(date.getUTCDate()+10);
  return date.toISOString().slice(0,10);
}
export function QuoteDates({start}:{start:string}){
  const [issued,setIssued]=useState(start),[validUntil,setValidUntil]=useState(tenDays(start)),[custom,setCustom]=useState(false);
  return <><label>Fecha de emisión<input name="issued_on" type="date" value={issued} required onChange={event=>{
    const next=event.target.value;setIssued(next);if(!custom)setValidUntil(tenDays(next));
  }}/></label><label>Válida hasta (10 días por defecto; editable)<input name="valid_until" type="date" min={issued} value={validUntil} required onChange={event=>{setValidUntil(event.target.value);setCustom(true);}}/></label></>;
}
