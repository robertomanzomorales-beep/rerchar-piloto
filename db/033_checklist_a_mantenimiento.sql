-- Carol 21 / planilla de averías: rastrear el hallazgo hasta el servicio que lo reportó.
ALTER TABLE fleet_incidents ADD COLUMN IF NOT EXISTS source_service_id uuid REFERENCES service_requests(id);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_incidents_open_checklist_idx
  ON fleet_incidents(source_service_id,asset_id)
  WHERE source_service_id IS NOT NULL AND status='abierta';
