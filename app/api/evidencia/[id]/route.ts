import { getActor } from "@/lib/auth";
import { getEvidence } from "@/lib/evidence";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Acceso no autorizado", { status: 401 });
  const { id } = await params;
  const file=await getEvidence(actor,id);
  if(!file)return new Response("No encontrado",{status:404});
  const filename=file.filename.replace(/[\r\n"\\]/g,"_");
  return new Response(new Uint8Array(file.data),{
    headers:{
      "Content-Type":file.mime,
      "Content-Disposition":`attachment; filename="archivo"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
    },
  });
}
