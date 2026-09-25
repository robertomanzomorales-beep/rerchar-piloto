import { getActor } from "@/lib/auth";
import { normalizeReportFilters, reportServices } from "@/lib/pilot";

function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"','""')}"`;
}

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return new Response("Sesión requerida", { status: 401 });
  const params = new URL(request.url).searchParams;
  const filters = normalizeReportFilters({ from: params.get("from") ?? "", to: params.get("to") ?? "", status: params.get("status") ?? "", client_id: params.get("client_id") ?? "" });
  const rows = (await reportServices(actor, filters)).slice(0,1000);
  const header = ["Folio","Cliente","Centro","Tipo","Residuo","Origen","Destino","Estado","Creado","Programado","Camión","Conductor","Estimado kg","Bruto kg","Tara kg","Neto kg"];
  const lines = [header.map(csvCell).join(";")];
  for (const s of rows) {
    const record = [
      `RER-${String(s.folio).padStart(5,"0")}`,s.client_name,s.site_name,s.service_type,s.waste_type,s.origin,s.destination,s.status,
      new Date(s.created_at).toISOString(),s.scheduled_for ? new Date(s.scheduled_for).toISOString() : "",
      s.asset_label,s.driver_name,s.estimated_kg,s.gross_kg,s.tare_kg,
      s.gross_kg !== null && s.tare_kg !== null ? (Number(s.gross_kg)-Number(s.tare_kg)).toFixed(2) : "",
    ];
    lines.push(record.map(csvCell).join(";"));
  }
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rerchar-servicios-${new Date().toISOString().slice(0,10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
