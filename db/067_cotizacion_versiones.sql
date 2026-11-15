-- Cada propuesta entregada conserva su PDF original antes de abrir una corrección.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS issued_version integer NOT NULL DEFAULT 0 CHECK (issued_version >= 0);
UPDATE client_quotes q SET issued_version=1 WHERE issued_version=0
  AND EXISTS (SELECT 1 FROM client_quote_pdf_snapshots p WHERE p.quote_id=q.id);

CREATE TABLE IF NOT EXISTS client_quote_issued_versions (
  quote_id uuid NOT NULL REFERENCES client_quotes(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  pdf bytea NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  channel text NOT NULL CHECK (channel IN ('manual','smtp')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL,
  correction_reason text NOT NULL CHECK (length(trim(correction_reason)) >= 10),
  archived_by uuid NOT NULL REFERENCES users(id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_id,version)
);
