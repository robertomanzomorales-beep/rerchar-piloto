-- Carol 9 y 13: clasificación por concepto; los conceptos históricos permanecen sin clasificar.
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS principal text;
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE client_quote_lines DROP CONSTRAINT IF EXISTS client_quote_lines_segment_valid;
ALTER TABLE client_quote_lines ADD CONSTRAINT client_quote_lines_segment_valid CHECK
  ((principal IS NULL AND segment IS NULL) OR
   (principal IS NOT NULL AND segment IS NOT NULL AND (principal,segment) IN (
     ('arriendo','arriendo_equipo'),('arriendo','excavadora_garra'),
     ('arriendo','arriendo_tolva'),('arriendo','camion_pluma'),
     ('retiro','retiro_chatarra'),('retiro','retiro_domiciliario'),
     ('retiro','retiro_reciclable'),('retiro','retiro_traslado_tolva'),
     ('transporte','transporte_cama_baja'),('transporte','transporte_batea'),
     ('transporte','transporte_respel'),('transporte','transporte_en_batea'),
     ('transporte','transporte_en_cama_baja'),('transporte','rampla_chatarrera'),
     ('transporte','rampla_plana'),('transporte','transporte_maquinaria'),
     ('recepcion','recepcion_chatarra'),('compra','compra_metal'),
     ('instalacion','instalacion_desmovilizacion_tolva'))));
CREATE INDEX IF NOT EXISTS quote_lines_classification_idx ON client_quote_lines(principal,segment,quote_id)
  WHERE principal IS NOT NULL;
