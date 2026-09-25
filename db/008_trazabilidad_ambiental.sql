CREATE TABLE IF NOT EXISTS waste_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  category text NOT NULL CHECK (category IN ('no_peligroso','peligroso')),
  classification text NOT NULL,
  generator_name text NOT NULL,
  transporter_name text NOT NULL,
  receiver_name text NOT NULL,
  treatment text NOT NULL,
  guide_number text NOT NULL,
  quantity_kg numeric(14,2) NOT NULL CHECK (quantity_kg >= 0),
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','revisado','declarado','observado')),
  external_system text CHECK (external_system IN ('SINADER','SIDREP')),
  external_reference text,
  reported_on date,
  review_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='declarado' AND external_system IS NOT NULL AND external_reference IS NOT NULL AND reported_on IS NOT NULL)
      OR (status<>'declarado' AND external_system IS NULL AND external_reference IS NULL AND reported_on IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS waste_external_reference_idx ON waste_records(external_system,external_reference)
  WHERE status='declarado';
CREATE INDEX IF NOT EXISTS waste_record_status_idx ON waste_records(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS waste_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES waste_records(id),
  action text NOT NULL CHECK (action IN ('crear','editar','revisar','observar','declarar')),
  previous_value jsonb,
  next_value jsonb NOT NULL,
  reason text,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waste_record_events_idx ON waste_record_events(record_id,created_at DESC,id DESC);
