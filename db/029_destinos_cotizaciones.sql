-- Carol 10 y 14. Los destinos sugeridos están pendientes hasta verificar su autorización.
CREATE TABLE IF NOT EXISTS quote_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  facility_type text NOT NULL DEFAULT 'otro' CHECK (facility_type IN ('planta','valorizacion','tratamiento','relleno','otro')),
  address text,
  commune text,
  latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  location_url text,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','habilitado','suspendido')),
  accepted_categories text[] NOT NULL DEFAULT '{}'::text[],
  authorization_reference text,
  authorization_valid_until date,
  authorization_document_name text,
  authorization_document_mime text,
  authorization_document bytea,
  disposal_unit text CHECK (disposal_unit IN ('tonelada','m³')),
  disposal_price_clp numeric(14,2) CHECK (disposal_price_clp>=0),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_destinations_categories_valid CHECK
    (accepted_categories <@ ARRAY['domiciliario','reciclable','chatarra','rcd','industrial_no_peligroso','respel']::text[]),
  CONSTRAINT quote_destinations_authorization_valid CHECK
    (status<>'habilitado' OR (cardinality(accepted_categories)>0 AND authorization_reference IS NOT NULL
      AND authorization_valid_until IS NOT NULL AND authorization_document IS NOT NULL
      AND disposal_unit IS NOT NULL AND disposal_price_clp IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS quote_destinations_status_idx ON quote_destinations(status,authorization_valid_until);

INSERT INTO quote_destinations(name,facility_type,address,commune,latitude,longitude,location_url)
VALUES
  ('Planta RERCHAR Calama','planta',NULL,'Calama',NULL,NULL,NULL),
  ('Planta Séché Sierra Gorda','planta','Km 45 Ruta B-385, Camino Salar de Atacama','Sierra Gorda',NULL,NULL,NULL),
  ('Centro AZA Antofagasta','valorizacion',NULL,'Antofagasta',-23.584750,-70.254080,'https://www.google.com/maps?q=-23.58475,-70.25408'),
  ('Centro Chaqueta Blanca','otro','Costado norte Ruta B-26, quebrada Chaqueta Blanca','Antofagasta',NULL,NULL,NULL),
  ('RESCON Antofagasta','otro','Km 7,6 Ruta 26','Antofagasta',NULL,NULL,NULL),
  ('RESCON Calama','otro','Km 5 Ruta CH-23 Calama–San Pedro de Atacama','Calama',NULL,NULL,NULL),
  ('Relleno Sanitario Cerro Colorado','relleno',NULL,'Calama',NULL,NULL,NULL)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS waste_category text;
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS destination_id uuid REFERENCES quote_destinations(id);
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS destination_name text;
-- Los conceptos anteriores mantienen su política original de emisión.
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS destination_required boolean NOT NULL DEFAULT false;
ALTER TABLE client_quote_lines DROP CONSTRAINT IF EXISTS quote_line_waste_destination_valid;
ALTER TABLE client_quote_lines ADD CONSTRAINT quote_line_waste_destination_valid CHECK
  ((waste_category IS NULL OR waste_category IN ('domiciliario','reciclable','chatarra','rcd','industrial_no_peligroso','respel'))
    AND (destination_id IS NULL OR (destination_name IS NOT NULL AND waste_category IS NOT NULL))
    AND (destination_id IS NOT NULL OR destination_name IS NULL));
CREATE INDEX IF NOT EXISTS quote_lines_destination_idx ON client_quote_lines(destination_id) WHERE destination_id IS NOT NULL;
