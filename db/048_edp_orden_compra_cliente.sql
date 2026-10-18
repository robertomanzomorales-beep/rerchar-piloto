-- La OC del cliente para un contrato mensual llega después del estado de pago.
ALTER TABLE payment_statements ADD COLUMN IF NOT EXISTS client_order_reference text;
ALTER TABLE payment_statements ADD COLUMN IF NOT EXISTS client_order_on date;
ALTER TABLE payment_statements ADD COLUMN IF NOT EXISTS client_order_exception text;
ALTER TABLE payment_statements DROP CONSTRAINT IF EXISTS payment_statement_client_order;
ALTER TABLE payment_statements ADD CONSTRAINT payment_statement_client_order CHECK (
  (client_order_reference IS NULL AND client_order_on IS NULL)
  OR (client_order_reference IS NOT NULL AND client_order_on IS NOT NULL AND client_order_exception IS NULL)
);
