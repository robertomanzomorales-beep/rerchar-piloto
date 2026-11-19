"use client";

import {useState} from "react";
import type {Role} from "@/lib/auth";

export function UserRoleFields({clients,initialRole="cliente",initialClient="",role,clientId,onRoleChange,onClientChange}:{
  clients:{id:string;name:string}[];initialRole?:Role;initialClient?:string;role?:Role;clientId?:string;
  onRoleChange?:(value:Role)=>void;onClientChange?:(value:string)=>void;
}){
  const [localRole,setLocalRole]=useState<Role>(initialRole),[localClient,setLocalClient]=useState(initialClient);
  const selected=role??localRole,selectedClient=clientId??localClient;
  return <>
    <label>Perfil<select name="role" value={selected} onChange={event=>{const next=event.target.value as Role;setLocalRole(next);onRoleChange?.(next);}} required>
      <option value="cliente">Cliente</option><option value="conductor">Conductor</option>
      <option value="operaciones">Operaciones</option><option value="admin">Administración</option>
    </select></label>
    {selected==="cliente"&&<label>Empresa a la que tendrá acceso<select name="client_id" value={selectedClient} onChange={event=>{setLocalClient(event.target.value);onClientChange?.(event.target.value);}} required>
      <option value="">Seleccione un cliente</option>
      {selectedClient&&!clients.some(client=>client.id===selectedClient)&&<option value={selectedClient} disabled>Selección anterior no disponible</option>}
      {clients.map(client=><option value={client.id} key={client.id}>{client.name}</option>)}
    </select></label>}
  </>;
}
