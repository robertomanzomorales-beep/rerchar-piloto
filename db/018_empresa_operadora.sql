-- No se infiere la empresa de los servicios anteriores: deben revisarse uno a uno.
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS operating_company text;
ALTER TABLE service_requests ADD CONSTRAINT service_operating_company_valid CHECK (operating_company IN ('rerchar','e_y_j'));
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES client_quotes(id);
CREATE INDEX IF NOT EXISTS service_company_date_idx ON service_requests(operating_company,created_at DESC);
CREATE INDEX IF NOT EXISTS service_quote_idx ON service_requests(quote_id);
-- Las cotizaciones ya emitidas conservan COT-xxxxx; las nuevas reciben un folio visible por empresa.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS display_folio text;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_display_folio_idx ON client_quotes(display_folio);
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS operating_company text;
ALTER TABLE client_contracts ADD CONSTRAINT contract_operating_company_valid CHECK (operating_company IN ('rerchar','e_y_j'));
CREATE INDEX IF NOT EXISTS contract_company_client_idx ON client_contracts(operating_company,client_id);
