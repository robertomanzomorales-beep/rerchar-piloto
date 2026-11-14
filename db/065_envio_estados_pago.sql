-- Historial inmutable del PDF preparado para cada entrega del EDP.
-- Un envío de resultado incierto bloquea la edición y el reintento hasta resolverlo.
CREATE TABLE IF NOT EXISTS payment_statement_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES payment_statements(id),
  channel text NOT NULL CHECK (channel IN ('smtp','correo_manual','presencial','otro')),
  status text NOT NULL CHECK (status IN ('enviando','verificar','enviado','no_enviado')),
  recipient text,
  reference text,
  pdf bytea NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_statement_deliveries_latest_idx
  ON payment_statement_deliveries(statement_id,created_at DESC,id DESC);
