import Image from "next/image";
import type {Company} from "@/lib/companies";

export default function DocumentBrand({company}:{company:Company|null}){
  if(company==="rerchar")return <Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={892} height={311} className="order-logo" loading="eager"/>;
  if(company==="e_y_j")return <div className="order-eyj-brand"><strong>E y J</strong><span>Servicios Integrales</span></div>;
  return null;
}
