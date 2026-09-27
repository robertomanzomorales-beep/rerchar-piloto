ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS supplier_contact text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS cost_center text;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS discount_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_clp >= 0);
