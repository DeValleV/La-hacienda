CREATE TABLE operacion_offline (
  operation_id TEXT PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursal(id),
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  tipo TEXT NOT NULL,
  ocurrida_en TEXT NOT NULL,
  aplicada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_operacion_offline_sucursal ON operacion_offline(sucursal_id, aplicada_en);
