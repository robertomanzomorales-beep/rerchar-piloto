import { Squares } from "@/components/Transition";

export default function Loading() {
  return <div className="page-loading" role="status" aria-label="Abriendo sección">
    <Squares/><span className="sr-only">Abriendo sección</span>
    <div className="loading-skeleton"><span/><span/><span/></div>
  </div>;
}
