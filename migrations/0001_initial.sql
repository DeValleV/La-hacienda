PRAGMA foreign_keys = ON;

CREATE TABLE sucursal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  direccion TEXT,
  activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
);

CREATE TABLE categoria (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE marca (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE unidad_medida (id INTEGER PRIMARY KEY AUTOINCREMENT, unidad TEXT NOT NULL UNIQUE);
CREATE TABLE estado (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE rol (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE tipo_venta (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);

CREATE TABLE usuario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rol_id INTEGER NOT NULL REFERENCES rol(id),
  sucursal_id INTEGER NOT NULL REFERENCES sucursal(id),
  nombre TEXT NOT NULL,
  nombre_usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

CREATE TABLE sesion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  token_hash TEXT NOT NULL UNIQUE,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en TEXT NOT NULL,
  revocada_en TEXT
);

CREATE TABLE producto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sucursal_id INTEGER NOT NULL REFERENCES sucursal(id),
  categoria_id INTEGER NOT NULL REFERENCES categoria(id),
  marca_id INTEGER NOT NULL REFERENCES marca(id),
  unidad_medida_id INTEGER NOT NULL REFERENCES unidad_medida(id),
  estado_id INTEGER NOT NULL REFERENCES estado(id),
  nombre_base TEXT NOT NULL,
  precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  stock_minimo INTEGER NOT NULL CHECK (stock_minimo >= 0),
  color_tarjeta TEXT NOT NULL CHECK (length(color_tarjeta) = 7 AND substr(color_tarjeta, 1, 1) = '#'),
  UNIQUE (sucursal_id, categoria_id, marca_id, nombre_base)
);

CREATE TABLE turno (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sucursal_id INTEGER NOT NULL REFERENCES sucursal(id),
  abierto_por_usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  cerrado_por_usuario_id INTEGER REFERENCES usuario(id),
  fecha_apertura TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TEXT,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  CHECK (
    (estado = 'abierto' AND cerrado_por_usuario_id IS NULL AND fecha_cierre IS NULL)
    OR
    (estado = 'cerrado' AND cerrado_por_usuario_id IS NOT NULL AND fecha_cierre IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_turno_abierto_sucursal ON turno(sucursal_id) WHERE estado = 'abierto';

CREATE TABLE venta (
  id INTEGER PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursal(id),
  turno_id INTEGER NOT NULL REFERENCES turno(id),
  tipo_venta_id INTEGER NOT NULL REFERENCES tipo_venta(id),
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  fecha_hora TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_centavos INTEGER NOT NULL DEFAULT 0 CHECK (total_centavos >= 0),
  estado TEXT NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'anulada')),
  anulada_por_usuario_id INTEGER REFERENCES usuario(id),
  fecha_anulacion TEXT,
  motivo_anulacion TEXT,
  CHECK (
    (estado = 'confirmada' AND anulada_por_usuario_id IS NULL AND fecha_anulacion IS NULL)
    OR
    (estado = 'anulada' AND anulada_por_usuario_id IS NOT NULL AND fecha_anulacion IS NOT NULL)
  )
);

CREATE TABLE detalle_venta (
  venta_id INTEGER NOT NULL REFERENCES venta(id),
  producto_id INTEGER NOT NULL REFERENCES producto(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  nombre_producto TEXT NOT NULL,
  precio_unitario_centavos INTEGER NOT NULL CHECK (precio_unitario_centavos >= 0),
  PRIMARY KEY (venta_id, producto_id)
);

CREATE INDEX idx_usuario_sucursal ON usuario(sucursal_id);
CREATE INDEX idx_sesion_usuario ON sesion(usuario_id);
CREATE INDEX idx_sesion_token ON sesion(token_hash);
CREATE INDEX idx_producto_sucursal ON producto(sucursal_id);
CREATE INDEX idx_turno_sucursal_fecha ON turno(sucursal_id, fecha_apertura DESC);
CREATE INDEX idx_venta_sucursal_fecha ON venta(sucursal_id, fecha_hora DESC);
CREATE INDEX idx_venta_turno ON venta(turno_id);
CREATE INDEX idx_venta_usuario ON venta(usuario_id);
CREATE INDEX idx_detalle_producto ON detalle_venta(producto_id);

CREATE TRIGGER turno_validar_apertura
BEFORE INSERT ON turno
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM usuario u
    WHERE u.id = NEW.abierto_por_usuario_id
      AND u.sucursal_id = NEW.sucursal_id
      AND u.activo = 1
  ) THEN RAISE(ABORT, 'USUARIO_SUCURSAL_INVALIDO') END;
END;

CREATE TRIGGER turno_validar_cierre
BEFORE UPDATE OF estado ON turno
WHEN NEW.estado = 'cerrado'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM usuario u
    WHERE u.id = NEW.cerrado_por_usuario_id
      AND u.sucursal_id = NEW.sucursal_id
      AND u.activo = 1
  ) THEN RAISE(ABORT, 'USUARIO_SUCURSAL_INVALIDO') END;
END;

CREATE TRIGGER venta_validar
BEFORE INSERT ON venta
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM turno t
    JOIN usuario u ON u.id = NEW.usuario_id
    WHERE t.id = NEW.turno_id
      AND t.sucursal_id = NEW.sucursal_id
      AND t.estado = 'abierto'
      AND u.sucursal_id = NEW.sucursal_id
      AND u.activo = 1
  ) THEN RAISE(ABORT, 'TURNO_O_USUARIO_INVALIDO') END;
END;

CREATE TRIGGER detalle_venta_validar
BEFORE INSERT ON detalle_venta
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM producto p
    JOIN estado e ON e.id = p.estado_id
    JOIN venta v ON v.id = NEW.venta_id
    WHERE p.id = NEW.producto_id
      AND p.sucursal_id = v.sucursal_id
      AND e.nombre = 'activo'
      AND p.stock >= NEW.cantidad
  ) THEN RAISE(ABORT, 'PRODUCTO_NO_DISPONIBLE') END;
END;

CREATE TRIGGER detalle_venta_aplicar
AFTER INSERT ON detalle_venta
BEGIN
  UPDATE producto SET stock = stock - NEW.cantidad WHERE id = NEW.producto_id;
  UPDATE venta
  SET total_centavos = total_centavos + (NEW.precio_unitario_centavos * NEW.cantidad)
  WHERE id = NEW.venta_id;
END;

INSERT INTO rol (nombre) VALUES ('administrador'), ('encargado'), ('cajero');
INSERT INTO estado (nombre) VALUES ('activo'), ('inactivo'), ('descontinuado');
INSERT INTO tipo_venta (nombre) VALUES ('comedor'), ('facturada'), ('personal');
INSERT INTO categoria (nombre) VALUES ('Alimentos'), ('Bebidas'), ('Postres');
INSERT INTO marca (nombre) VALUES ('La Hacienda'), ('Cola');
INSERT INTO unidad_medida (unidad) VALUES ('pieza'), ('botella'), ('vaso'), ('orden');
INSERT INTO sucursal (nombre, codigo) VALUES ('Sucursal Centro', 'CENTRO'), ('Sucursal Norte', 'NORTE');

INSERT INTO producto (sucursal_id, categoria_id, marca_id, unidad_medida_id, estado_id, nombre_base, precio_centavos, stock, stock_minimo, color_tarjeta)
VALUES
  (1, 1, 1, 1, 1, 'Menú del Día', 550, 64, 10, '#ff6600'),
  (1, 2, 2, 2, 1, 'Bebida Cola 500ml', 120, 8, 10, '#c44536'),
  (1, 3, 1, 1, 1, 'Postre Gelatina', 80, 31, 10, '#7655a4'),
  (2, 1, 1, 1, 1, 'Menú del Día', 600, 30, 8, '#ff6600'),
  (2, 2, 1, 2, 1, 'Agua Natural 600ml', 70, 45, 12, '#158c8c');
