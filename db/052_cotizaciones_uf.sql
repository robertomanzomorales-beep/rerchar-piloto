-- La propuesta conserva valor UF por concepto y una equivalencia CLP fechada para cálculos internos.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS uf_rate_clp numeric(14,2);
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS uf_rate_on date;
ALTER TABLE client_quotes ADD CONSTRAINT quote_uf_rate_pair CHECK
  ((uf_rate_clp IS NULL AND uf_rate_on IS NULL) OR
   (uf_rate_clp > 0 AND uf_rate_on IS NOT NULL));
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CLP';
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS unit_price_uf numeric(14,4);
ALTER TABLE client_quote_lines ADD CONSTRAINT quote_line_currency_check CHECK
  ((currency='CLP' AND unit_price_uf IS NULL) OR
   (currency='UF' AND unit_price_uf IS NOT NULL AND unit_price_uf>=0));
