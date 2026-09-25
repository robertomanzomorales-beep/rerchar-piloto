"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return <button type="button" className="button button-primary" onClick={() => window.print()}><Printer size={17}/> Imprimir orden</button>;
}
