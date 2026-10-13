-- Material comercializado: catálogo y existencias separados de insumos/EPP de CONTROL BODEGA.
CREATE TABLE material_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'planillas_2026',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX material_catalog_name_idx ON material_catalog(lower(trim(name)));

ALTER TABLE material_receipts ADD COLUMN material_id uuid REFERENCES material_catalog(id);
ALTER TABLE material_receipts ADD COLUMN receipt_mode text CHECK (receipt_mode IN ('directa','programada'));
ALTER TABLE material_receipts ALTER COLUMN weighing_ticket DROP NOT NULL;
ALTER TABLE material_receipts ADD CONSTRAINT material_receipt_document_check CHECK (
  weighing_ticket IS NOT NULL OR origin_guide IS NOT NULL OR transfer_guide IS NOT NULL OR entry_sheet IS NOT NULL);
CREATE INDEX material_receipts_catalog_idx ON material_receipts(material_id,movement_on DESC);
ALTER TABLE operation_files DROP CONSTRAINT IF EXISTS operation_files_kind_check;
ALTER TABLE operation_files ADD CONSTRAINT operation_files_kind_check CHECK (
  kind IN ('guia','ticket','hoja_ingreso','informe_impurezas','factura','comprobante','certificado','acta','otro'));

ALTER TABLE material_guide_items ADD COLUMN material_id uuid REFERENCES material_catalog(id);
CREATE INDEX material_guide_items_catalog_idx ON material_guide_items(material_id);

CREATE TABLE material_stock_balances (
  material_id uuid PRIMARY KEY REFERENCES material_catalog(id),
  quantity_kg numeric(14,2) NOT NULL DEFAULT 0 CHECK (quantity_kg>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE material_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES material_catalog(id),
  kind text NOT NULL CHECK (kind IN ('saldo_inicial','ingreso','salida_guia','reversa_guia','ajuste_entrada','ajuste_salida')),
  delta_kg numeric(14,2) NOT NULL CHECK (delta_kg<>0),
  occurred_on date NOT NULL,
  receipt_id uuid UNIQUE REFERENCES material_receipts(id),
  guide_item_id uuid REFERENCES material_guide_items(id),
  reference text NOT NULL,
  reason text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='ingreso' AND receipt_id IS NOT NULL AND guide_item_id IS NULL AND delta_kg>0)
    OR (kind='salida_guia' AND guide_item_id IS NOT NULL AND receipt_id IS NULL AND delta_kg<0)
    OR (kind='reversa_guia' AND guide_item_id IS NOT NULL AND receipt_id IS NULL AND delta_kg>0)
    OR (kind IN ('saldo_inicial','ajuste_entrada') AND receipt_id IS NULL AND guide_item_id IS NULL AND delta_kg>0)
    OR (kind='ajuste_salida' AND receipt_id IS NULL AND guide_item_id IS NULL AND delta_kg<0))
);
CREATE INDEX material_stock_movements_date_idx ON material_stock_movements(material_id,occurred_on DESC,created_at DESC);
CREATE INDEX material_stock_movements_guide_idx ON material_stock_movements(guide_item_id,created_at DESC);

-- Lista de materiales, hoja DATOS de ENTRADA MATERIAL y CONTROL GUIA 2026.
-- No contiene nombres de clientes, precios ni saldos históricos.
INSERT INTO material_catalog(name) VALUES
  ('ACERO INOX 304'),
  ('ACERO INOX. 316'),
  ('ACERO INOX. CONT.'),
  ('ACERO INOX. MACIZO'),
  ('ACERO INOX. MICELANE'),
  ('ALUMINIO CONTAMINADO'),
  ('ALUMINIO DE PERFIL'),
  ('ALUMINIO DURO'),
  ('ALUMINIO LATAS DE BEBIDA'),
  ('BATERIAS'),
  ('BOTELLAS PLÁSTICAS'),
  ('CABLE ALUMINIO CON GOMA EN DESUSO'),
  ('CABLE ALUMINIO EN DESUSO'),
  ('CABLE ALUMINIO FORRADO EN DESUSO'),
  ('CABLE DE COBRE CON GOMA DE DISTINTOS DIAMETROS, ESPESORES Y LONGITUDES'),
  ('CABLE DE COBRE ESMALTADO'),
  ('CABLE DE COBRE FORRADO EN DESUSO'),
  ('CABLE DE COBRE INDUSTRIAL'),
  ('CABLE DE COBRE QUEMADO EN DESUSO'),
  ('CARTON Y PAPEL'),
  ('CARTONES'),
  ('CHATARRA ALTO CROMO'),
  ('CHATARRA BIT'),
  ('CHATARRA CABLE ALUMINIO'),
  ('CHATARRA CONTAMINADA'),
  ('CHATARRA DE ACERO INOXIDABLE'),
  ('CHATARRA DE ACERO MANGANESO'),
  ('CHATARRA DE ACERO MANGANESO (CORAZA)'),
  ('CHATARRA DE ACERO MANGANESO (ZAPATA)'),
  ('CHATARRA DE ALUMINIO'),
  ('CHATARRA DE BARRAS DE PERFORACIÓN'),
  ('CHATARRA DE BOLAS'),
  ('CHATARRA DE BRONCE'),
  ('CHATARRA DE BRONCE AMARILLO'),
  ('CHATARRA DE BRONCE COLORADO'),
  ('CHATARRA DE COBRE CON GOMA'),
  ('CHATARRA DE COBRE SIN GOMA'),
  ('CHATARRA DE CROMO MOLI'),
  ('CHATARRA DE FIERRO'),
  ('CHATARRA DE FIERRO (BRIQUETAS)'),
  ('CHATARRA DE FIERRO (CUCHILLAS)'),
  ('CHATARRA DE FIERRO (FP)'),
  ('CHATARRA DE FIERRO (G12)'),
  ('CHATARRA DE FIERRO (ZAPATAS)'),
  ('CHATARRA DE FIERRO ALTA DENSIDAD'),
  ('CHATARRA DE FIERRO BAJA DENSIDAD'),
  ('CHATARRA DE FIERRO CON GOMA'),
  ('CHATARRA DE FIERRO CON GOMA (POLINES)'),
  ('CHATARRA DE FIERRO CONTAMINADA'),
  ('CHATARRA DE FIERRO DE CABLES ACERADOS'),
  ('CHATARRA DE FIERRO DESARME'),
  ('CHATARRA DE FIERRO GALVANIZADO'),
  ('CHATARRA DE FIERRO MIXTO'),
  ('CHATARRA DE FIERRO SCRAP DE BOLAS'),
  ('CHATARRA DE MANGANESO (BOLAS)'),
  ('CHATARRA DE MOTORES ELECTRICOS'),
  ('CHATARRA FIERRO PRIMERA'),
  ('CHATARRA MOTORES DE COMBUSTIÓN'),
  ('CHATARRA MOTORES ELECTRICOS'),
  ('COBRE ALAMBRE'),
  ('COBRE ALAMBRE SULFATADO'),
  ('COBRE CALEFON'),
  ('COBRE CAÑERÍA LIMPIA'),
  ('COBRE CAÑERÍA SUCIA'),
  ('COBRE ESMALTADO'),
  ('COBRE PELILLO'),
  ('CORREAS ALMA ACERO'),
  ('CORREAS ALMA TELA'),
  ('DESECHOS ELECTRONICO'),
  ('HDPE CARPETAS'),
  ('HDPE TUBERIAS'),
  ('LDPE CARPETAS'),
  ('LDPE GOTEROS'),
  ('MAQUINARIAS EN DESUSO'),
  ('PAPEL'),
  ('RADIADOR DE ALUMINIO'),
  ('RADIADOR DE BRONCE'),
  ('RADIADOR DE COBRE'),
  ('TRICONOS'),
  ('TUBO GALVANIZADO'),
  ('VIRUTA DE FIERRO'),
  ('VIRUTA Y DESPUNTE DE HDPE');
