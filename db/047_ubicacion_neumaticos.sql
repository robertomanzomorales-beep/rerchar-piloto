ALTER TABLE tires ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id);
CREATE INDEX IF NOT EXISTS tires_warehouse_status_idx ON tires(warehouse_id,status);
