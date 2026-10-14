-- Mantener la pauta y su origen en cada plan; la orden toma una copia de las tareas al crearse.
ALTER TABLE maintenance_plans ADD COLUMN IF NOT EXISTS template_key text;
ALTER TABLE maintenance_plans ADD COLUMN IF NOT EXISTS procedure text;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_plan_active_template_idx
  ON maintenance_plans(asset_id,template_key) WHERE active=true AND template_key IS NOT NULL;
