"use client";

import { Printer } from "lucide-react";

export default function PrintButton({label="Imprimir o guardar PDF"}:{label?:string}) {
  return <button type="button" className="button button-primary" onClick={() => window.print()}><Printer size={17}/> {label}</button>;
}
