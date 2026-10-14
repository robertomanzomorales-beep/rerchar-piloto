-- Resultado de terreno por día, independiente del cierre administrativo y pesaje.
CREATE TABLE IF NOT EXISTS service_day_reports (
  service_id uuid NOT NULL REFERENCES service_requests(id),
  day date NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id),
  driver_name text,
  outcome text NOT NULL CHECK (outcome IN ('completado','incompleto','suspendido')),
  observation text NOT NULL DEFAULT '' CHECK (length(observation)<=1000),
  recorded_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(service_id,day),
  CHECK (outcome='completado' OR length(trim(observation))>=5)
);
CREATE INDEX IF NOT EXISTS service_day_reports_day_idx ON service_day_reports(day,asset_id);
CREATE INDEX IF NOT EXISTS service_day_reports_outcome_idx ON service_day_reports(outcome,day DESC);

-- Columna de la hoja CONTROL: estado de envío de la guía de despacho.
ALTER TABLE valued_guide_followups ADD COLUMN IF NOT EXISTS dispatch_guide_status text
  CHECK (dispatch_guide_status IN ('pendiente','enviada','no_aplica'));
