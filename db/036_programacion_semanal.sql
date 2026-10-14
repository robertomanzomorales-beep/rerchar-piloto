-- Bloqueos y observaciones de la programación semanal por activo y fecha de Chile.
-- Los servicios reales continúan en service_requests; no se duplican en esta tabla.
CREATE TABLE IF NOT EXISTS fleet_day_notes (
  asset_id uuid NOT NULL REFERENCES assets(id),
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mantencion','indisponible','sin_conductor','nota')),
  detail text NOT NULL CHECK (length(trim(detail)) BETWEEN 2 AND 500),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id,day)
);
CREATE INDEX IF NOT EXISTS fleet_day_notes_day_idx ON fleet_day_notes(day,asset_id);
