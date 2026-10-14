CREATE TABLE IF NOT EXISTS service_certificate_drafts (
  service_id uuid PRIMARY KEY REFERENCES service_requests(id),
  snapshot jsonb NOT NULL,
  prepared_by uuid NOT NULL REFERENCES users(id),
  prepared_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_certificate_drafts_prepared_idx
  ON service_certificate_drafts(prepared_at DESC);
