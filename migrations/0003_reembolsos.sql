CREATE TABLE reembolso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES venta(id),
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE detalle_reembolso (
  reembolso_id INTEGER NOT NULL REFERENCES reembolso(id),
  producto_id INTEGER NOT NULL REFERENCES producto(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (reembolso_id, producto_id)
);
CREATE INDEX idx_reembolso_venta ON reembolso(venta_id);
