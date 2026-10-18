CREATE TABLE IF NOT EXISTS asset_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id),
  original_filename text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_content bytea NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 4194304),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_documents_asset_idx ON asset_documents(asset_id,created_at DESC);
