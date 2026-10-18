CREATE TABLE IF NOT EXISTS purchase_order_sequences (
  issuer text PRIMARY KEY CHECK (issuer IN ('rerchar','e_y_j')),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS order_sequence bigint;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS without_order boolean NOT NULL DEFAULT false;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'guia'
  CHECK (document_kind IN ('guia','factura'));

CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_sequence_issuer_unique
  ON purchase_requests (issuer, order_sequence) WHERE order_sequence IS NOT NULL;
