import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const migrationsDirectory = new URL('../migrations/', import.meta.url);
const migrations = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDirectory), 'utf8'));

function createDatabase() {
  const database = new DatabaseSync(':memory:');
  migrations.forEach((migration) => database.exec(migration));
  database.exec(`
    INSERT INTO sucursal (nombre, codigo) VALUES ('Pruebas Norte', 'TEST-NORTE');
    INSERT INTO usuario (rol_id, sucursal_id, nombre, nombre_usuario, password_hash)
    VALUES
      (1, 1, 'Admin Centro', 'admin.centro', 'hash-de-prueba'),
      (1, 2, 'Admin Norte', 'admin.norte', 'hash-de-prueba');
    INSERT INTO marca (nombre) VALUES ('Marca de prueba');
    INSERT INTO producto (sucursal_id, categoria_id, marca_id, estado_id, nombre_base, precio_centavos, stock, stock_minimo, color_tarjeta)
    VALUES
      (1, (SELECT id FROM categoria WHERE nombre = 'Alimentos'), 1, (SELECT id FROM estado WHERE nombre = 'activo'), 'Menú del Día', 550, 64, 10, '#ff6600'),
      (2, (SELECT id FROM categoria WHERE nombre = 'Alimentos'), 1, (SELECT id FROM estado WHERE nombre = 'activo'), 'Producto Norte', 600, 10, 5, '#ff6600');
  `);
  return database;
}

test('la migración crea el modelo y conserva el aislamiento por sucursal', () => {
  const database = createDatabase();

  const saleColumns = database.prepare('PRAGMA table_info(venta)').all().map((column) => column.name);
  assert.equal(saleColumns.includes('turno_id'), true);
  assert.equal(saleColumns.includes('amount_paid'), false);
  assert.equal(saleColumns.includes('change'), false);
  assert.equal(saleColumns.includes('metodo_pago'), false);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'movimiento_inventario'").get().total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'unidad_medida'").get().total, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM estado WHERE nombre = 'descontinuado'").get().total, 0);

  database.prepare('INSERT INTO turno (sucursal_id, abierto_por_usuario_id) VALUES (?, ?)').run(1, 1);
  assert.throws(
    () => database.prepare('INSERT INTO turno (sucursal_id, abierto_por_usuario_id) VALUES (?, ?)').run(1, 1),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () => database.prepare('INSERT INTO turno (sucursal_id, abierto_por_usuario_id) VALUES (?, ?)').run(2, 1),
    /USUARIO_SUCURSAL_INVALIDO/,
  );

  database.prepare(`
    INSERT INTO venta (id, sucursal_id, turno_id, tipo_venta_id, usuario_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(1001, 1, 1, 1, 1);
  database.prepare(`
    INSERT INTO detalle_venta
      (venta_id, producto_id, cantidad, nombre_producto, precio_unitario_centavos)
    VALUES (?, ?, ?, ?, ?)
  `).run(1001, 1, 2, 'Menú del Día', 550);

  assert.equal(database.prepare('SELECT total_centavos FROM venta WHERE id = 1001').get().total_centavos, 1100);
  assert.equal(database.prepare('SELECT stock FROM producto WHERE id = 1').get().stock, 62);
  assert.throws(
    () => database.prepare(`
      INSERT INTO detalle_venta
        (venta_id, producto_id, cantidad, nombre_producto, precio_unitario_centavos)
      VALUES (?, ?, ?, ?, ?)
    `).run(1001, 2, 1, 'Producto ajeno', 600),
    /PRODUCTO_NO_DISPONIBLE/,
  );

  database.prepare(`
    UPDATE turno
    SET estado = 'cerrado', cerrado_por_usuario_id = ?, fecha_cierre = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(1, 1);
  assert.throws(
    () => database.prepare(`
      INSERT INTO venta (id, sucursal_id, turno_id, tipo_venta_id, usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(1002, 1, 1, 1, 1),
    /TURNO_O_USUARIO_INVALIDO/,
  );

  database.close();
});
