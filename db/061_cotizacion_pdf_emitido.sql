-- Conservar los bytes exactos de la propuesta entregada, con su folio original.
-- Las cotizaciones antiguas sin copia siguen disponibles mediante el generador.
CREATE TABLE IF NOT EXISTS client_quote_pdf_snapshots (
  quote_id uuid PRIMARY KEY REFERENCES client_quotes(id) ON DELETE CASCADE,
  pdf bytea NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  channel text NOT NULL CHECK (channel IN ('manual','smtp')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
