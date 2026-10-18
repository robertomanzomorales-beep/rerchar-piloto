-- OC del cliente y su respaldo, vinculados al folio comercial antes de programar.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS client_order_reference text;
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS client_order_on date;
ALTER TABLE client_quotes ADD CONSTRAINT quote_client_order_pair CHECK
  ((client_order_reference IS NULL AND client_order_on IS NULL) OR
   (client_order_reference IS NOT NULL AND client_order_on IS NOT NULL));

CREATE TABLE IF NOT EXISTS client_quote_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES client_quotes(id),
  kind text NOT NULL CHECK (kind IN ('orden_compra','respaldo')),
  filename text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
  content bytea NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_documents_quote_idx ON client_quote_documents(quote_id,uploaded_at DESC);
