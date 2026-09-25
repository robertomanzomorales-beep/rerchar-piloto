CREATE TABLE IF NOT EXISTS service_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES service_requests(id),
  version integer NOT NULL CHECK (version >= 1),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9a-f]{48}$'),
  status text NOT NULL DEFAULT 'vigente' CHECK (status IN ('vigente','revocado')),
  snapshot jsonb NOT NULL,
  issued_by uuid NOT NULL REFERENCES users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revocation_reason text,
  UNIQUE (service_id,version),
  CHECK ((status='vigente' AND revoked_by IS NULL AND revoked_at IS NULL AND revocation_reason IS NULL)
    OR (status='revocado' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND length(trim(revocation_reason)) >= 5))
);
CREATE UNIQUE INDEX IF NOT EXISTS service_certificate_active_idx ON service_certificates(service_id) WHERE status='vigente';
CREATE INDEX IF NOT EXISTS service_certificate_list_idx ON service_certificates(service_id,version DESC);

CREATE TABLE IF NOT EXISTS certificate_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES service_certificates(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificate_download_list_idx ON certificate_downloads(certificate_id,created_at DESC);
