-- Estado inicial de producción: sin datos operativos ni catálogos de ejemplo.
DELETE FROM detalle_reembolso;
DELETE FROM reembolso;
DELETE FROM detalle_venta;
DELETE FROM venta;
DELETE FROM turno;
DELETE FROM sesion;
DELETE FROM producto;
DELETE FROM usuario;
DELETE FROM marca;
DELETE FROM categoria;
DELETE FROM sucursal;

DELETE FROM sqlite_sequence WHERE name IN ('sucursal', 'categoria', 'marca', 'producto', 'usuario', 'turno', 'venta', 'reembolso');

INSERT INTO sucursal (nombre, codigo) VALUES ('Ikano', 'IKANO');
INSERT INTO categoria (nombre) VALUES ('Alimentos'), ('Bebidas'), ('Postres'), ('Botanas');
