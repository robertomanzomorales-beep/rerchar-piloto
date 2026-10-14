// Pautas transcritas de «Detalles y mantenimiento camiones y ramplas (2)(2).xlsx».
// La hoja da intervalos y tareas, pero sus lecturas históricas no se importan al activo.
const sheets = {
  pc200: {
    model: "GARRA PC200-LC 8M0",
    parts: ["Filtro aceite motor 6742-01-4540", "Prefiltro combustible 600-319-3610", "Filtro combustible 600-319-3750", "Filtro aire 600-185-5100", "Filtro cabina exterior 17M-911-3530", "Filtro cabina interior 2A5-979-1551", "Aceite motor 25 L (15W40 DH1)"],
  },
  pc210: {
    model: "GARRA PC210-LC 10M0",
    parts: ["Filtro aceite motor 6736-51-5142", "Prefiltro combustible 600-319-3610", "Filtro combustible 600-319-3750", "Filtro aire 600-185-4100", "Filtro cabina exterior 17M-911-3530", "Filtro cabina interior 2A5-979-1551", "Aceite motor 25 L (15W40 DH1)"],
  },
} as const;

const tasks250 = [
  "Limpiar o cambiar filtro de aire",
  "Cambiar aceite de motor y filtro de aceite",
  "Cambiar filtro principal y prefiltro de combustible",
  "Cambiar filtro de aceite hidráulico",
  "Cambiar respiradero del tanque hidráulico",
] as const;
const tasks1000 = ["Cambiar aceite damper", "Cambiar aceite motor de giro", "Cambiar aceite hidráulico"] as const;
const tasks2000 = ["Cambiar aceite de mandos finales"] as const;

export const hourMaintenanceTemplates = Object.entries(sheets).flatMap(([key,sheet]) => ([
  { key:`${key}-250`, model:sheet.model, interval:250, tasks:tasks250, parts:sheet.parts },
  { key:`${key}-1000`, model:sheet.model, interval:1000, tasks:tasks1000,
    parts:["Aceite motor de giro 8 L (TO30)", "Aceite hidráulico 150 L (HO46-HE)"] },
  { key:`${key}-2000`, model:sheet.model, interval:2000, tasks:tasks2000,
    parts:["Aceite mando final 11 L (TO30)"] },
]));

export function hourMaintenanceProcedure(template: typeof hourMaintenanceTemplates[number]) {
  return [
    `Fuente: Detalles y mantenimiento camiones y ramplas (2)(2).xlsx · hoja ${template.model}.`,
    `Intervalo: cada ${template.interval} horas.`,
    "Tareas:",
    ...template.tasks.map((task)=>`• ${task}`),
    "Insumos de referencia (verificar compatibilidad y disponibilidad):",
    ...template.parts.map((part)=>`• ${part}`),
    ...(template.interval>250?["Esta pauta complementa la mantención de 250 horas cuando coincidan los vencimientos."]:[]),
  ].join("\n");
}
