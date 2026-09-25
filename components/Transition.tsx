"use client";

import { useFormStatus } from "react-dom";
import { useLinkStatus } from "next/link";

export function Squares() {
  return <span className="square-loader" aria-hidden="true"><i/><i/><i/><i/></span>;
}

export function SubmitButton({ children, className, disabled }: { children: React.ReactNode; className: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`${className} submit-with-progress`} type="submit" disabled={disabled || pending} data-pending={pending ? "true" : undefined}>
    <span className={pending ? "button-content button-content-hidden" : "button-content"}>{children}</span>
    {pending && <span className="button-progress"><Squares/><span className="sr-only">Procesando solicitud</span></span>}
  </button>;
}

export function NavPendingHint() {
  const { pending } = useLinkStatus();
  return <span className={`nav-pending ${pending ? "is-pending" : ""}`} aria-live="polite">
    {pending && <><Squares/><span className="sr-only">Abriendo sección</span></>}
  </span>;
}
