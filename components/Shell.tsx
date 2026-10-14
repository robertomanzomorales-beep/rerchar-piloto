"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, CalendarDays, Boxes, LogOut, Menu, ShieldCheck, Wrench, FileBarChart2, ShoppingCart, Warehouse, Fuel, Container, Users, Banknote, FileCheck2, ScrollText, FileBadge2, Building2, FileText, ReceiptText, Search, ChevronDown, MapPin } from "lucide-react";
import type { Actor } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { NavPendingHint, SubmitButton } from "@/components/Transition";
import GlobalSearch from "@/components/GlobalSearch";

export default function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const pathname = usePathname();
  const [selectedCompany,setSelectedCompany]=useState<"rerchar"|"e_y_j"|null>(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({"Comercial":true,"Operación":true});
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
    event.preventDefault();setSearchOpen(true);
  }};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[]);
  useEffect(()=>{
    const company=pathname.startsWith("/empresa/rerchar")?"rerchar":pathname.startsWith("/empresa/e_y_j")||pathname.startsWith("/estados-pago")?"e_y_j":null;
    if(company){localStorage.setItem("rerchar-selected-company",company);setSelectedCompany(company);}
    else if(pathname==="/"){localStorage.removeItem("rerchar-selected-company");setSelectedCompany(null);}
    else {const saved=localStorage.getItem("rerchar-selected-company");setSelectedCompany(saved==="rerchar"||saved==="e_y_j"?saved:null);}
  },[pathname]);
  const selectedName=selectedCompany==="e_y_j"?"E y J":selectedCompany==="rerchar"?"RERCHAR":null;
  const companyHref=(href:string)=>selectedCompany&&["/cotizaciones","/solicitudes","/agenda","/seguimiento-guias","/facturas-recibidas","/transferencias","/transacciones","/finanzas","/cobros-extraordinarios","/cobranzas"].includes(href)?`${href}?empresa=${selectedCompany}`:selectedCompany&&href==="/reportes"?`${href}?company=${selectedCompany}`:href;
  const links = [
    { group:"Comercial", href: "/cotizaciones", text: "Cotizaciones", icon: FileText, visible: actor.role !== "conductor" },
    { group:"Comercial", href: "/clientes", text: "Clientes y documentos", icon: Building2, visible: actor.role !== "conductor" },
    { group:"Operación", href: "/solicitudes", text: "Solicitudes y despacho", icon: ClipboardList, visible: true },
    { group:"Operación", href: "/control-guias", text: "Control de guías · material", icon: FileText, visible: selectedCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Operación", href: "/agenda", text: "Agenda", icon: CalendarDays, visible: true },
    { group:"Operación", href: "/seguimiento-guias", text: "Guías valorizadas", icon: ClipboardList, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Operación", href: "/ingresos", text: "Ingreso de material", icon: Boxes, visible: selectedCompany!=="e_y_j" && actor.role !== "conductor" },
    { group:"Operación", href: "/materiales-stock", text: "Stock de materiales", icon: Warehouse, visible: selectedCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Cierre y control", href: "/finanzas", text: "Contratos y finanzas", icon: Banknote, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/cobros-extraordinarios", text: "Cobros extraordinarios", icon: ReceiptText, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/cobranzas", text: "Cobranza clientes", icon: Banknote, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/estados-pago", text: "Estados de pago · E y J", icon: ReceiptText, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/estados-pago/calendario", text: "Calendario de EDP · E y J", icon: CalendarDays, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/certificados", text: "Certificados", icon: FileBadge2, visible: actor.role !== "conductor" },
    { group:"Cierre y control", href: "/cumplimiento", text: "Registro ambiental", icon: FileCheck2, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/reportes", text: "Reportes", icon: FileBarChart2, visible: true },
    { group:"Abastecimiento", href: "/facturas-recibidas", text: "Facturas recibidas", icon: FileText, visible: actor.role === "admin" },
    { group:"Abastecimiento", href: "/transferencias", text: "Solicitudes de transferencia", icon: Banknote, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/transacciones", text: "Registro de transacciones", icon: ScrollText, visible: actor.role === "admin" },
    { group:"Recursos compartidos", href: "/compras", text: "Órdenes de compra", icon: ShoppingCart, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/inventario", text: "Inventario", icon: Warehouse, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/contenedores", text: "Tolvas y contenedores", icon: Container, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/flota", text: "Flota y averías", icon: Wrench, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/mantenimiento", text: "Mantenimiento", icon: Wrench, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/combustible", text: "Combustible", icon: Fuel, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/personal", text: "Personal", icon: Users, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Configuración", href: "/maestros", text: "Maestros", icon: Boxes, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Configuración", href: "/destinos", text: "Destinos y autorizaciones", icon: MapPin, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Configuración", href: "/usuarios", text: "Usuarios y accesos", icon: Users, visible: actor.role === "admin" },
    { group:"Configuración", href: "/auditoria", text: "Auditoría", icon: ScrollText, visible: actor.role === "admin" },
  ];
  const searchItems=[{href:selectedCompany?`/empresa/${selectedCompany}`:"/",text:"Panel de empresa",group:"Inicio"},
    ...links.filter(link=>link.visible).map(link=>({href:companyHref(link.href),text:link.text,group:link.group}))];
  const activeHref=links.filter(link=>link.visible&&(pathname===link.href||pathname.startsWith(`${link.href}/`)))
    .sort((a,b)=>b.href.length-a.href.length)[0]?.href;
  const nav = <nav className="nav-items" aria-label="Navegación principal"><Link href={selectedCompany?`/empresa/${selectedCompany}`:"/"} className={`nav-link ${pathname==="/"||pathname.startsWith("/empresa/")?"active":""}`}><LayoutDashboard size={18}/> Panel de empresa <NavPendingHint/></Link>{["Comercial","Operación","Cierre y control","Abastecimiento","Recursos compartidos","Configuración"].map(group=>{
    const groupLinks=links.filter(link=>link.group===group&&link.visible);
    const isOpen=expanded[group]??groupLinks.some(link=>pathname===link.href||pathname.startsWith(`${link.href}/`));
    return groupLinks.length?<div className={`nav-group ${isOpen?"expanded":""}`} key={group}><button type="button" className="nav-group-toggle" aria-expanded={isOpen} onClick={()=>setExpanded(old=>({...old,[group]:!isOpen}))}><span>{group}</span><ChevronDown size={16}/></button><div className="nav-group-panel" inert={!isOpen}><div className="nav-group-inner">{groupLinks.map(link=><Link key={link.href} href={companyHref(link.href)} className={`nav-link ${activeHref===link.href?"active":""}`}><link.icon size={18} strokeWidth={1.9}/>{link.text}<NavPendingHint/></Link>)}</div></div></div>:null;
  })}</nav>;
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand brand-sidebar" aria-label="Seleccionar empresa">{selectedCompany==="e_y_j"?<span className="eyj-brand"><strong>E y J</strong><small>Servicios Integrales</small></span>:<Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={2124} height={740} priority className="brand-art"/>}<span className="system-name"><strong>{selectedName??"RERCHAR / E y J"}</strong><span>Plataforma operativa</span></span></Link>
      <button type="button" className="sidebar-search-trigger" onClick={()=>setSearchOpen(true)}><Search size={18}/><span>Buscar en el sistema...</span><kbd>⌘ K</kbd></button>
      <div className="sidebar-section-label">{selectedName?`OPERANDO · ${selectedName}`:"SELECCIONE EMPRESA"}</div>
      {nav}
      <div className="sidebar-bottom"><div className="sidebar-security"><ShieldCheck size={18}/> Acceso protegido</div>
        <div className="profile"><span className="profile-avatar">{actor.name.trim().slice(0, 1).toUpperCase()}</span><span className="profile-info"><strong>{actor.name}</strong><small>{actor.role === "operaciones" ? "Operaciones" : actor.role === "conductor" ? "Conductor" : actor.role === "cliente" ? "Cliente" : "Administración"}</small></span></div>
        <form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="mobile-brand"><Image src="/rerchar-logo-transparente.png" alt="RERCHAR" width={2124} height={740} className="mobile-brand-art"/></div><span className="topbar-label">{selectedName??"RERCHAR / E y J"} <span>Plataforma operativa</span><span className="topbar-dot"/> Piloto</span><button type="button" className="topbar-search-trigger" onClick={()=>setSearchOpen(true)} aria-label="Buscar"><Search size={19}/><span>Buscar módulos</span></button><span className="topbar-user">{actor.name}</span>
        <details className="mobile-nav"><summary aria-label="Abrir navegación"><Menu size={22}/></summary><div className="mobile-nav-menu">{nav}<form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form></div></details>
      </header>
      <div className="page-content">{children}</div>
    </div>
    <GlobalSearch open={searchOpen} onClose={()=>setSearchOpen(false)} items={searchItems}/>
  </div>;
}
