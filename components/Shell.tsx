"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, ClipboardList, CalendarDays, Boxes, LogOut, Menu, ShieldCheck, Wrench, FileBarChart2, ShoppingCart, Warehouse, Fuel, Container, Users, Banknote, FileCheck2, ScrollText, FileBadge2, Building2, FileText, ReceiptText, Search, ChevronDown, MapPin, X } from "lucide-react";
import type { Actor } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { NavPendingHint, SubmitButton } from "@/components/Transition";
import GlobalSearch from "@/components/GlobalSearch";

export default function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams=useSearchParams();
  const companyQuery=searchParams.get("empresa")??searchParams.get("company");
  const routeCompany=companyQuery==="rerchar"||companyQuery==="e_y_j"?companyQuery:
    pathname.startsWith("/empresa/rerchar")||["/ingresos","/control-guias","/materiales-stock","/seguimiento-guias"].some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`))?"rerchar":
    pathname.startsWith("/empresa/e_y_j")||pathname.startsWith("/estados-pago")?"e_y_j":null;
  const [selectedCompany,setSelectedCompany]=useState<"rerchar"|"e_y_j"|null>(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [companyOpen,setCompanyOpen]=useState(false);
  const mobileToggle=useRef<HTMLButtonElement>(null);
  const mobileClose=useRef<HTMLButtonElement>(null);
  const mobileDrawer=useRef<HTMLElement>(null);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({"Comercial":true});
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
    event.preventDefault();setSearchOpen(true);
  }};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[]);
  useEffect(()=>{
    if(routeCompany){localStorage.setItem("rerchar-selected-company",routeCompany);setSelectedCompany(routeCompany);}
    else if(pathname==="/"){localStorage.removeItem("rerchar-selected-company");setSelectedCompany(null);}
    else {const saved=localStorage.getItem("rerchar-selected-company");setSelectedCompany(saved==="rerchar"||saved==="e_y_j"?saved:null);}
  },[pathname,routeCompany]);
  useEffect(()=>{setMobileOpen(false);},[pathname]);
  useEffect(()=>{
    if(!mobileOpen)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    mobileClose.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setMobileOpen(false);mobileToggle.current?.focus();}
      if(event.key==="Tab"){
        const focusable=mobileDrawer.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])');
        if(!focusable?.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    const onResize=()=>{if(window.innerWidth>860)setMobileOpen(false);};
    window.addEventListener("keydown",onKey);
    window.addEventListener("resize",onResize);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",onKey);window.removeEventListener("resize",onResize);};
  },[mobileOpen]);
  const activeCompany=pathname==="/"?null:routeCompany??selectedCompany;
  const selectedName=activeCompany==="e_y_j"?"E y J":activeCompany==="rerchar"?"RERCHAR":null;
  const companyExpanded=companyOpen;
  const companyOptions=<div className={`company-picker ${companyExpanded?"expanded":""}`}>
    <button type="button" className="company-picker-trigger" aria-expanded={companyExpanded} onClick={()=>setCompanyOpen(open=>!open)}><span className="company-picker-line" aria-hidden="true"/><span className="company-picker-copy"><strong>{selectedName??"Elegir empresa"}</strong><small>{activeCompany==="rerchar"?"Gestión de materiales":activeCompany==="e_y_j"?"Servicios industriales":"Seleccione una operación"}</small></span><ChevronDown size={16} aria-hidden="true"/></button>
    <div className="company-picker-panel" inert={!companyExpanded}><div className="company-picker-inner" aria-label="Empresa operadora">
      <Link href="/empresa/rerchar" aria-current={activeCompany==="rerchar"?"page":undefined} onClick={()=>{setCompanyOpen(false);setMobileOpen(false);}} className={`company-switch company-switch--rerchar ${activeCompany==="rerchar"?"selected":""}`}><span className="switch-mark" aria-hidden="true"/><span><strong>RERCHAR</strong><small>Gestión de materiales</small></span><span className="switch-indicator" aria-hidden="true"/></Link>
      <Link href="/empresa/e_y_j" aria-current={activeCompany==="e_y_j"?"page":undefined} onClick={()=>{setCompanyOpen(false);setMobileOpen(false);}} className={`company-switch company-switch--eyj ${activeCompany==="e_y_j"?"selected":""}`}><span className="switch-mark" aria-hidden="true"/><span><strong>E y J</strong><small>Servicios industriales</small></span><span className="switch-indicator" aria-hidden="true"/></Link>
    </div></div>
  </div>;
  const companyHref=(href:string)=>activeCompany&&["/cotizaciones","/solicitudes","/agenda","/seguimiento-guias","/facturas-recibidas","/transferencias","/transacciones","/finanzas","/cobros-extraordinarios","/cobranzas"].includes(href)?`${href}?empresa=${activeCompany}`:activeCompany&&href==="/reportes"?`${href}?company=${activeCompany}`:href;
  const links = [
    { group:"Comercial", href: "/cotizaciones", text: "Cotizaciones", icon: FileText, visible: actor.role !== "conductor" },
    { group:"Comercial", href: "/clientes", text: "Clientes y documentos", icon: Building2, visible: actor.role !== "conductor" },
    { group:"Operación", href: "/solicitudes", text: "Solicitudes y despacho", icon: ClipboardList, visible: true },
    { group:"Operación", href: "/control-guias", text: "Control de guías · material", icon: FileText, visible: activeCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Operación", href: "/agenda", text: "Agenda", icon: CalendarDays, visible: true },
    { group:"Operación", href: "/seguimiento-guias", text: "Guías valorizadas", icon: ClipboardList, visible: activeCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Operación", href: "/ingresos", text: "Ingreso de material", icon: Boxes, visible: activeCompany!=="e_y_j" && actor.role !== "conductor" },
    { group:"Operación", href: "/materiales-stock", text: "Stock de materiales", icon: Warehouse, visible: activeCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Cierre y control", href: "/finanzas", text: "Contratos, tarifas y facturas", icon: Banknote, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/cobros-extraordinarios", text: "Cobros extraordinarios", icon: ReceiptText, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/cobranzas", text: "Cobranza clientes", icon: Banknote, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/estados-pago", text: "Estados de pago · E y J", icon: ReceiptText, visible: activeCompany === "e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Cierre y control", href: "/estados-pago/calendario", text: "Calendario de EDP · E y J", icon: CalendarDays, visible: activeCompany === "e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Cierre y control", href: "/certificados", text: "Certificados", icon: FileBadge2, visible: actor.role !== "conductor" },
    { group:"Cierre y control", href: "/cumplimiento", text: "Registro ambiental", icon: FileCheck2, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/reportes", text: "Reportes", icon: FileBarChart2, visible: true },
    { group:"Abastecimiento", href: "/facturas-recibidas", text: "Facturas recibidas", icon: FileText, visible: actor.role === "admin" },
    { group:"Abastecimiento", href: "/fichas", text: "Fichas cliente / proveedor", icon: Building2, visible: actor.role === "admin" },
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
  const searchItems=[{href:activeCompany?`/empresa/${activeCompany}`:"/",text:"Panel de empresa",group:"Inicio"},
    ...links.filter(link=>link.visible).map(link=>({href:companyHref(link.href),text:link.text,group:link.group}))];
  const activeHref=links.filter(link=>link.visible&&(pathname===link.href||pathname.startsWith(`${link.href}/`)))
    .sort((a,b)=>b.href.length-a.href.length)[0]?.href;
  const nav = (mobile=false) => <nav className="nav-items" aria-label={mobile?"Navegación móvil":"Navegación principal"}><Link href={activeCompany?`/empresa/${activeCompany}`:"/"} onClick={()=>mobile&&setMobileOpen(false)} className={`nav-link ${pathname==="/"||pathname.startsWith("/empresa/")?"active":""}`}><LayoutDashboard size={18}/> Panel de {selectedName??"empresas"} <NavPendingHint/></Link>{["Comercial","Operación","Cierre y control","Abastecimiento","Recursos compartidos","Configuración"].map(group=>{
    const groupLinks=links.filter(link=>link.group===group&&link.visible);
    const isOpen=expanded[group]??groupLinks.some(link=>pathname===link.href||pathname.startsWith(`${link.href}/`));
    return groupLinks.length?<div className={`nav-group ${isOpen?"expanded":""}`} key={group}><button type="button" className="nav-group-toggle" aria-expanded={isOpen} onClick={()=>setExpanded(old=>({...old,[group]:!isOpen}))}><span>{group}</span><ChevronDown size={16}/></button><div className="nav-group-panel" inert={!isOpen}><div className="nav-group-inner">{groupLinks.map(link=><Link key={link.href} href={companyHref(link.href)} onClick={()=>mobile&&setMobileOpen(false)} className={`nav-link ${activeHref===link.href?"active":""}`}><link.icon size={18} strokeWidth={1.9}/>{link.text}<NavPendingHint/></Link>)}</div></div></div>:null;
  })}</nav>;
  return <div className="app-shell" data-company={activeCompany??"selector"}>
    <aside className="sidebar">
      <Link href="/" className="brand brand-sidebar" aria-label="Seleccionar empresa">{activeCompany==="e_y_j"?<span className="eyj-brand"><strong>E y J</strong><small>Servicios Integrales</small></span>:activeCompany==="rerchar"?<Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={2124} height={740} priority className="brand-art"/>:<span className="platform-brand">R <span>/</span> EJ</span>}<span className="system-name"><strong>{selectedName??"OPERACIÓN INDUSTRIAL"}</strong><span>Plataforma operativa</span></span></Link>
      <button type="button" className="sidebar-search-trigger" onClick={()=>setSearchOpen(true)}><Search size={18}/><span>Buscar en el sistema...</span><kbd>⌘ K</kbd></button>
      <div className="sidebar-section-label">EMPRESA OPERADORA</div>
      {companyOptions}
      <div className="sidebar-section-label">MÓDULOS · {selectedName??"SELECCIONE EMPRESA"}</div>
      {nav()}
      <div className="sidebar-bottom"><div className="sidebar-security"><ShieldCheck size={18}/> Acceso protegido</div>
        <div className="profile"><span className="profile-avatar">{actor.name.trim().slice(0, 1).toUpperCase()}</span><span className="profile-info"><strong>{actor.name}</strong><small>{actor.role === "operaciones" ? "Operaciones" : actor.role === "conductor" ? "Conductor" : actor.role === "cliente" ? "Cliente" : "Administración"}</small></span></div>
        <form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar"><Link href={activeCompany?`/empresa/${activeCompany}`:"/"} className="mobile-brand" aria-label={selectedName?`Panel de ${selectedName}`:"Seleccionar empresa"}>{activeCompany==="rerchar"?<Image src="/rerchar-logo-transparente.png" alt="" width={2124} height={740} className="mobile-brand-logo"/>:activeCompany==="e_y_j"?<span className="mobile-brand-eyj" aria-hidden="true">E y J</span>:<span className="mobile-brand-mark platform-mark">R/EJ</span>}<span className="mobile-brand-copy"><strong>{activeCompany==="rerchar"?"RERCHAR":activeCompany==="e_y_j"?"Servicios Integrales":"Plataforma operativa"}</strong><small>{activeCompany==="rerchar"?"GESTIÓN DE MATERIALES":activeCompany==="e_y_j"?"SERVICIOS INDUSTRIALES":"RERCHAR · E Y J"}</small></span></Link><span className="topbar-label">{selectedName??"RERCHAR / E y J"} <span>Plataforma operativa</span></span><button type="button" className="topbar-search-trigger" onClick={()=>setSearchOpen(true)} aria-label="Buscar"><Search size={19}/><span>Buscar módulos</span></button><span className="topbar-user">{actor.name}</span>
        <button type="button" ref={mobileToggle} className="mobile-nav-trigger" aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={()=>{setCompanyOpen(true);setMobileOpen(true);}}><Menu size={22}/></button>
      </header>
      <div className="page-content">{children}</div>
    </div>
    {mobileOpen&&<div className="mobile-nav-layer"><button type="button" className="mobile-nav-backdrop" aria-label="Cerrar menú" onClick={()=>setMobileOpen(false)}/><aside ref={mobileDrawer} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Menú de navegación" className="mobile-nav-drawer"><div className="mobile-nav-heading"><div><small>PLATAFORMA OPERATIVA</small><strong>{selectedName??"Elija una empresa"}</strong></div><button type="button" ref={mobileClose} aria-label="Cerrar menú" onClick={()=>{setMobileOpen(false);mobileToggle.current?.focus();}}><X size={21}/></button></div><div className="mobile-nav-scroll"><div className="mobile-nav-caption">Cambiar empresa</div>{companyOptions}<button type="button" className="mobile-search-trigger" onClick={()=>{setMobileOpen(false);setSearchOpen(true);}}><Search size={18}/> Buscar un módulo</button><div className="mobile-nav-caption">Navegación</div>{nav(true)}<div className="mobile-nav-footer"><span>{actor.name} · {actor.role==="admin"?"Administración":actor.role==="operaciones"?"Operaciones":actor.role==="conductor"?"Conductor":"Cliente"}</span><form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form></div></div></aside></div>}
    <GlobalSearch open={searchOpen} onClose={()=>setSearchOpen(false)} items={searchItems}/>
  </div>;
}
