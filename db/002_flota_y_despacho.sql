ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS ramp_asset_id uuid REFERENCES assets(id);
CREATE INDEX IF NOT EXISTS service_ramp_idx ON service_requests(ramp_asset_id, scheduled_for);

CREATE TABLE IF NOT EXISTS fleet_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id),
  description text NOT NULL CHECK (length(trim(description)) >= 5),
  severity text NOT NULL CHECK (severity IN ('baja','media','alta','critica')),
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','resuelta')),
  reported_by uuid NOT NULL REFERENCES users(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolution text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  CONSTRAINT incident_resolution_consistent CHECK (
    (status='abierta' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (status='resuelta' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS fleet_incident_asset_idx ON fleet_incidents(asset_id, status, reported_at DESC);
