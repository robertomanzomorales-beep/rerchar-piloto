-- Nombre usado en ENTRADA MATERIAL 2026 que faltaba en el catálogo inicial.
-- No se importan movimientos, precios ni saldos históricos desde la planilla.
INSERT INTO material_catalog(name)
VALUES ('CABLE DE COBRE CON GOMA EN DESUSO')
ON CONFLICT DO NOTHING;
