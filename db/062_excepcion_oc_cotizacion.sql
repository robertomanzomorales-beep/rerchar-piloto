-- La administración documenta los contratos puntuales en que el cliente no emite OC.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS client_order_exception text
  CHECK (client_order_exception IS NULL OR length(trim(client_order_exception)) BETWEEN 10 AND 500);
ALTER TABLE client_quotes ADD CONSTRAINT quote_order_or_exception CHECK
  (client_order_exception IS NULL OR (client_order_reference IS NULL AND client_order_on IS NULL));
