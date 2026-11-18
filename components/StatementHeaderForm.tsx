"use client";

import {useState} from "react";
import type {StatementDraft} from "@/lib/statement-form-state";

type Client={id:string;name:string;tax_id:string|null;address:string|null;email:string|null};
export default function StatementHeaderForm({clients,defaultClientId="",values={}}:{clients:Client[];defaultClientId?:string;values?:StatementDraft}){
  const initial=clients.find(c=>c.id===defaultClientId);
  const [clientId,setClientId]=useState(initial?.id??"");
  const [name,setName]=useState(values.client_name??initial?.name??""),[taxId,setTaxId]=useState(values.client_tax_id??initial?.tax_id??""),
    [address,setAddress]=useState(values.client_address??initial?.address??""),[contact,setContact]=useState(values.client_contact??initial?.email??"");
  return <>
    <label>Cliente<select name="client_id" required value={clientId} onChange={event=>{
      const id=event.target.value,client=clients.find(c=>c.id===id);setClientId(id);
      setName(client?.name??"");setTaxId(client?.tax_id??"");setAddress(client?.address??"");setContact(client?.email??"");
    }}><option value="">Seleccione cliente</option>{clients.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
    <label>Empresa que recibe el EDP<input name="client_name" value={name} onChange={e=>setName(e.target.value)} required maxLength={200}/></label>
    <label>RUT cliente<input name="client_tax_id" value={taxId} onChange={e=>setTaxId(e.target.value)} required maxLength={30}/></label>
    <label>Domicilio cliente<input name="client_address" value={address} onChange={e=>setAddress(e.target.value)} required maxLength={300}/></label>
    <label>Contacto cliente<input name="client_contact" value={contact} onChange={e=>setContact(e.target.value)} required maxLength={160}/></label>
  </>;
}
