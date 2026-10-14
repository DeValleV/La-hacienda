-- Las operaciones capturadas sin red son hechos históricos. Se aceptan aunque
-- se sincronicen después del cierre del turno o con existencias ya agotadas.
ALTER TABLE venta ADD COLUMN origen_offline INTEGER NOT NULL DEFAULT 0 CHECK(origen_offline IN (0,1));
ALTER TABLE producto ADD COLUMN stock_sobregirado INTEGER NOT NULL DEFAULT 0 CHECK(stock_sobregirado >= 0);
ALTER TABLE operacion_offline ADD COLUMN venta_id INTEGER REFERENCES venta(id);

DROP TRIGGER venta_validar;
CREATE TRIGGER venta_validar BEFORE INSERT ON venta BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM turno t JOIN usuario u ON u.id = NEW.usuario_id WHERE t.id = NEW.turno_id AND t.sucursal_id = NEW.sucursal_id AND u.sucursal_id = NEW.sucursal_id AND (NEW.origen_offline = 1 OR (t.estado = 'abierto' AND u.activo = 1))) THEN RAISE(ABORT, 'TURNO_O_USUARIO_INVALIDO') END); END;

DROP TRIGGER detalle_venta_validar;
CREATE TRIGGER detalle_venta_validar BEFORE INSERT ON detalle_venta BEGIN SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM producto p JOIN venta v ON v.id = NEW.venta_id LEFT JOIN estado e ON e.id = p.estado_id WHERE p.id = NEW.producto_id AND p.sucursal_id = v.sucursal_id AND (v.origen_offline = 1 OR (e.nombre = 'activo' AND p.stock >= NEW.cantidad))) THEN RAISE(ABORT, 'PRODUCTO_NO_DISPONIBLE') END); END;

DROP TRIGGER detalle_venta_aplicar;
CREATE TRIGGER detalle_venta_aplicar AFTER INSERT ON detalle_venta WHEN (SELECT origen_offline FROM venta WHERE id = NEW.venta_id) = 0 BEGIN UPDATE producto SET stock = stock - NEW.cantidad WHERE id = NEW.producto_id; UPDATE venta SET total_centavos = total_centavos + (NEW.precio_unitario_centavos * NEW.cantidad) WHERE id = NEW.venta_id; END;
CREATE TRIGGER detalle_venta_aplicar_offline AFTER INSERT ON detalle_venta WHEN (SELECT origen_offline FROM venta WHERE id = NEW.venta_id) = 1 BEGIN UPDATE producto SET stock_sobregirado = stock_sobregirado + MAX(NEW.cantidad - stock, 0), stock = MAX(stock - NEW.cantidad, 0) WHERE id = NEW.producto_id; UPDATE venta SET total_centavos = total_centavos + (NEW.precio_unitario_centavos * NEW.cantidad) WHERE id = NEW.venta_id; END;
