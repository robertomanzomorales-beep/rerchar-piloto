"use client";

import {useState} from "react";

export function ContractClientFields({clients,sites}:{clients:{id:string;name:string}[];sites:{id:string;client_id:string;name:string}[]}){
  const [clientId,setClientId]=useState(""),[siteId,setSiteId]=useState("");
  const available=sites.filter(site=>site.client_id===clientId);
  return <>
    <label>Cliente<select name="client_id" required value={clientId} onChange={e=>{setClientId(e.target.value);setSiteId("");}}><option value="">Seleccione</option>{clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
    <label>Faena (opcional: cubre todas las del cliente)<select name="site_id" value={siteId} disabled={!clientId} onChange={e=>setSiteId(e.target.value)}><option value="">Todas las faenas del cliente</option>{available.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
  </>;
}

export function ContractDates({today}:{today:string}){
  const [start,setStart]=useState(today);
  return <div className="two-fields"><label>Inicio<input name="starts_on" type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Fin (opcional)<input name="ends_on" type="date" min={start||undefined}/></label></div>;
}
