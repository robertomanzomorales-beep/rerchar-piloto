"use client";

import {useState} from "react";
import type {Role} from "@/lib/auth";

export function UserRoleFields({clients,initialRole="cliente",initialClient=""}:{
  clients:{id:string;name:string}[];initialRole?:Role;initialClient?:string;
}){
  const [selected,setSelected]=useState<Role>(initialRole);
  return <>
    <label>Perfil<select name="role" value={selected} onChange={event=>setSelected(event.target.value as Role)} required>
      <option value="cliente">Cliente</option><option value="conductor">Conductor</option>
      <option value="operaciones">Operaciones</option><option value="admin">Administración</option>
    </select></label>
    {selected==="cliente"&&<label>Empresa a la que tendrá acceso<select name="client_id" defaultValue={initialClient} required>
      <option value="">Seleccione un cliente</option>
      {clients.map(client=><option value={client.id} key={client.id}>{client.name}</option>)}
    </select></label>}
  </>;
}
