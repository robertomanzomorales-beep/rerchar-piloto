-- La categoría y el prefijo se definen por administración. Los códigos históricos se conservan.
CREATE TABLE IF NOT EXISTS stock_sku_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (length(trim(category)) BETWEEN 2 AND 100),
  prefix text NOT NULL UNIQUE CHECK (prefix ~ '^[A-Z0-9]{2,10}$'),
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number BETWEEN 1 AND 1000000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_sku_rules_category_key ON stock_sku_rules(lower(trim(category)));
