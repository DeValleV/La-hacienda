import {
  createSessionToken, expiredSessionCookie, hashPassword, hashToken,
  readCookie, sessionCookie, sessionExpiration, verifyPassword,
} from './auth.js';

class ApiError extends Error {
  constructor(status, message, code = 'API_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PRODUCT_ROLES = new Set(['administrador', 'encargado']);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

async function bodyJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    throw new ApiError(415, 'Se requiere Content-Type application/json.', 'INVALID_CONTENT_TYPE');
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'El cuerpo JSON no es válido.', 'INVALID_JSON');
  }
}

function requireText(value, field, max = 120) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw new ApiError(400, `${field} no es válido.`, 'VALIDATION_ERROR');
  return normalized;
}

function optionalText(value, field, max = 240) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(400, `${field} no es válido.`, 'VALIDATION_ERROR');
  const normalized = value.trim();
  if (normalized.length > max) throw new ApiError(400, `${field} no es válido.`, 'VALIDATION_ERROR');
  return normalized || null;
}

function requireInteger(value, field, minimum = 0) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) throw new ApiError(400, `${field} no es válido.`, 'VALIDATION_ERROR');
  return number;
}

function requirePassword(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 200) {
    throw new ApiError(400, 'La contraseña debe tener entre 10 y 200 caracteres.', 'VALIDATION_ERROR');
  }
  return value;
}

function loginPassword(value) {
  if (typeof value !== 'string' || !value.length || value.length > 200) {
    throw new ApiError(400, 'contraseña no es válida.', 'VALIDATION_ERROR');
  }
  return value;
}

function moneyToCents(value, field = 'precio') {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || Math.abs(Math.round(number * 100) - number * 100) > 1e-7) {
    throw new ApiError(400, `${field} debe tener como máximo dos decimales.`, 'VALIDATION_ERROR');
  }
  return Math.round(number * 100);
}

function securityHeaders(response) {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'same-origin');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  result.headers.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  return result;
}

function validateOrigin(request) {
  if (!MUTATING_METHODS.has(request.method)) return;
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'Origen no permitido.', 'INVALID_ORIGIN');
}

async function sessionFor(request, env) {
  const token = readCookie(request, 'lh_session');
  if (!token) return null;
  return env.DB.prepare(`
    SELECT u.id AS userId, u.nombre AS name, u.nombre_usuario AS username,
           u.sucursal_id AS branchId, r.nombre AS role, s.id AS sessionId,
           b.nombre AS branchName, b.codigo AS branchCode
    FROM sesion s JOIN usuario u ON u.id = s.usuario_id
    JOIN rol r ON r.id = u.rol_id JOIN sucursal b ON b.id = u.sucursal_id
    WHERE s.token_hash = ? AND s.revocada_en IS NULL
      AND datetime(s.expira_en) > datetime('now') AND u.activo = 1 AND b.activa = 1
  `).bind(await hashToken(token)).first();
}

function requireSession(session, roles) {
  if (!session) throw new ApiError(401, 'Debe iniciar sesión.', 'UNAUTHENTICATED');
  if (roles && !roles.has(session.role)) throw new ApiError(403, 'No tiene permiso para esta operación.', 'FORBIDDEN');
  return session;
}

async function catalogId(db, table, column, value) {
  const allowed = new Map([
    ['categoria:nombre', ['categoria', 'nombre']],
    ['marca:nombre', ['marca', 'nombre']],
    ['unidad_medida:unidad', ['unidad_medida', 'unidad']],
  ]);
  const target = allowed.get(`${table}:${column}`);
  if (!target) throw new Error('Catálogo no permitido.');
  const normalized = requireText(value, column, 80);
  await db.prepare(`INSERT INTO ${target[0]} (${target[1]}) VALUES (?) ON CONFLICT(${target[1]}) DO NOTHING`).bind(normalized).run();
  const row = await db.prepare(`SELECT id FROM ${target[0]} WHERE ${target[1]} = ? COLLATE NOCASE`).bind(normalized).first();
  return row.id;
}

function mapProduct(row) {
  return {
    id: row.id, name: row.name, category: row.category, brand: row.brand, unit: row.unit,
    status: row.status, price: row.priceCents / 100, stock: row.stock,
    minStock: row.minStock, color: row.color,
  };
}

const PRODUCT_SELECT = `
  SELECT p.id, p.nombre_base AS name, c.nombre AS category, m.nombre AS brand,
         um.unidad AS unit, e.nombre AS status, p.precio_centavos AS priceCents,
         p.stock, p.stock_minimo AS minStock, p.color_tarjeta AS color
  FROM producto p JOIN categoria c ON c.id = p.categoria_id
  JOIN marca m ON m.id = p.marca_id JOIN unidad_medida um ON um.id = p.unidad_medida_id
  JOIN estado e ON e.id = p.estado_id`;

async function productValues(db, payload) {
  const color = requireText(payload.color, 'color', 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new ApiError(400, 'color no es válido.', 'VALIDATION_ERROR');
  const statusName = requireText(payload.status, 'estado', 30).toLowerCase();
  if (!new Set(['activo', 'inactivo', 'descontinuado']).has(statusName)) {
    throw new ApiError(400, 'estado no es válido.', 'VALIDATION_ERROR');
  }
  const status = await db.prepare('SELECT id FROM estado WHERE nombre = ?').bind(statusName).first();
  if (!status) throw new ApiError(500, 'El catálogo de estados no está inicializado.', 'CATALOG_NOT_INITIALIZED');
  return {
    categoryId: await catalogId(db, 'categoria', 'nombre', payload.category),
    brandId: await catalogId(db, 'marca', 'nombre', payload.brand),
    unitId: await catalogId(db, 'unidad_medida', 'unidad', payload.unit),
    statusId: status.id,
    name: requireText(payload.name, 'nombre', 120),
    priceCents: moneyToCents(payload.price), stock: requireInteger(payload.stock, 'stock'),
    minStock: requireInteger(payload.minStock, 'stock mínimo'), color,
  };
}

async function listProducts(env, session) {
  const result = await env.DB.prepare(`${PRODUCT_SELECT} WHERE p.sucursal_id = ? ORDER BY p.nombre_base`).bind(session.branchId).all();
  return json({ products: result.results.map(mapProduct) });
}

async function createProduct(request, env, session) {
  requireSession(session, PRODUCT_ROLES);
  const values = await productValues(env.DB, await bodyJson(request));
  const result = await env.DB.prepare(`
    INSERT INTO producto (sucursal_id, categoria_id, marca_id, unidad_medida_id, estado_id, nombre_base, precio_centavos, stock, stock_minimo, color_tarjeta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(session.branchId, values.categoryId, values.brandId, values.unitId, values.statusId, values.name, values.priceCents, values.stock, values.minStock, values.color).run();
  const row = await env.DB.prepare(`${PRODUCT_SELECT} WHERE p.id = ? AND p.sucursal_id = ?`).bind(result.meta.last_row_id, session.branchId).first();
  return json({ product: mapProduct(row) }, 201);
}

async function updateProduct(request, env, session, productId) {
  requireSession(session, PRODUCT_ROLES);
  const values = await productValues(env.DB, await bodyJson(request));
  const result = await env.DB.prepare(`
    UPDATE producto SET categoria_id = ?, marca_id = ?, unidad_medida_id = ?, estado_id = ?,
      nombre_base = ?, precio_centavos = ?, stock = ?, stock_minimo = ?, color_tarjeta = ?
    WHERE id = ? AND sucursal_id = ?
  `).bind(values.categoryId, values.brandId, values.unitId, values.statusId, values.name, values.priceCents, values.stock, values.minStock, values.color, productId, session.branchId).run();
  if (!result.meta.changes) throw new ApiError(404, 'Producto no encontrado.', 'NOT_FOUND');
  const row = await env.DB.prepare(`${PRODUCT_SELECT} WHERE p.id = ? AND p.sucursal_id = ?`).bind(productId, session.branchId).first();
  return json({ product: mapProduct(row) });
}

async function restockProduct(request, env, session, productId) {
  requireSession(session, PRODUCT_ROLES);
  const quantity = requireInteger((await bodyJson(request)).quantity, 'cantidad', 1);
  const result = await env.DB.prepare('UPDATE producto SET stock = stock + ? WHERE id = ? AND sucursal_id = ?').bind(quantity, productId, session.branchId).run();
  if (!result.meta.changes) throw new ApiError(404, 'Producto no encontrado.', 'NOT_FOUND');
  return json({ ok: true });
}

async function deactivateProduct(env, session, productId) {
  requireSession(session, PRODUCT_ROLES);
  const result = await env.DB.prepare("UPDATE producto SET estado_id = (SELECT id FROM estado WHERE nombre = 'inactivo') WHERE id = ? AND sucursal_id = ?").bind(productId, session.branchId).run();
  if (!result.meta.changes) throw new ApiError(404, 'Producto no encontrado.', 'NOT_FOUND');
  return json({ ok: true });
}

function randomSaleId() {
  const values = crypto.getRandomValues(new Uint32Array(2));
  return ((values[0] & 0x1fffff) * 0x100000000 + values[1]) || 1;
}

async function currentShift(env, session) {
  const shift = await env.DB.prepare(`
    SELECT t.id, t.fecha_apertura AS openedAt, t.estado AS status, u.nombre AS openedBy
    FROM turno t JOIN usuario u ON u.id = t.abierto_por_usuario_id
    WHERE t.sucursal_id = ? AND t.estado = 'abierto'
    ORDER BY t.fecha_apertura DESC LIMIT 1
  `).bind(session.branchId).first();
  return json({ shift: shift || null });
}

async function openShift(env, session) {
  requireSession(session, PRODUCT_ROLES);
  const existing = await env.DB.prepare("SELECT id FROM turno WHERE sucursal_id = ? AND estado = 'abierto'").bind(session.branchId).first();
  if (existing) throw new ApiError(409, 'Ya existe un turno abierto.', 'SHIFT_ALREADY_OPEN');
  const result = await env.DB.prepare('INSERT INTO turno (sucursal_id, abierto_por_usuario_id) VALUES (?, ?)').bind(session.branchId, session.userId).run();
  return json({ shift: { id: result.meta.last_row_id, status: 'abierto' } }, 201);
}

async function closeShift(env, session) {
  requireSession(session, PRODUCT_ROLES);
  const result = await env.DB.prepare(`
    UPDATE turno SET estado = 'cerrado', cerrado_por_usuario_id = ?, fecha_cierre = CURRENT_TIMESTAMP
    WHERE sucursal_id = ? AND estado = 'abierto'
  `).bind(session.userId, session.branchId).run();
  if (!result.meta.changes) throw new ApiError(409, 'No hay un turno abierto.', 'NO_OPEN_SHIFT');
  const shift = await env.DB.prepare(`
    SELECT t.id, t.fecha_apertura AS openedAt, t.fecha_cierre AS closedAt, t.estado AS status,
           opener.nombre AS openedBy, closer.nombre AS closedBy
    FROM turno t
    JOIN usuario opener ON opener.id = t.abierto_por_usuario_id
    LEFT JOIN usuario closer ON closer.id = t.cerrado_por_usuario_id
    WHERE t.sucursal_id = ? ORDER BY t.fecha_apertura DESC LIMIT 1
  `).bind(session.branchId).first();
  return json({ shift });
}

async function createSale(request, env, session) {
  const payload = await bodyJson(request);
  const type = requireText(payload.tipoVenta, 'tipo de venta', 30).toLowerCase();
  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!rawLines.length || rawLines.length > 100) throw new ApiError(400, 'La venta debe contener productos.', 'VALIDATION_ERROR');

  const quantities = new Map();
  rawLines.forEach((line) => {
    const productId = requireInteger(line.productId, 'producto', 1);
    const quantity = requireInteger(line.qty, 'cantidad', 1);
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  });
  const saleType = await env.DB.prepare('SELECT id FROM tipo_venta WHERE nombre = ?').bind(type).first();
  if (!saleType) throw new ApiError(400, 'Tipo de venta no válido.', 'VALIDATION_ERROR');

  const shift = await env.DB.prepare("SELECT id FROM turno WHERE sucursal_id = ? AND estado = 'abierto'").bind(session.branchId).first();
  if (!shift) throw new ApiError(409, 'No hay un turno abierto.', 'NO_OPEN_SHIFT');

  const saleId = randomSaleId();
  const statements = [
    env.DB.prepare('INSERT INTO venta (id, sucursal_id, turno_id, tipo_venta_id, usuario_id) VALUES (?, ?, ?, ?, ?)')
      .bind(saleId, session.branchId, shift.id, saleType.id, session.userId),
  ];
  quantities.forEach((quantity, productId) => {
    statements.push(env.DB.prepare(`
      INSERT INTO detalle_venta (venta_id, producto_id, cantidad, nombre_producto, precio_unitario_centavos)
      VALUES (?, ?, ?, (SELECT nombre_base FROM producto WHERE id = ?), (SELECT precio_centavos FROM producto WHERE id = ?))
    `).bind(saleId, productId, quantity, productId, productId));
  });
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).includes('PRODUCTO_NO_DISPONIBLE')) {
      throw new ApiError(409, 'Un producto no está disponible o no tiene stock suficiente.', 'INSUFFICIENT_STOCK');
    }
    throw error;
  }
  return json({ sale: await loadSale(env.DB, session, saleId) }, 201);
}

async function loadSale(db, session, saleId) {
  const sale = await db.prepare(`
    SELECT v.id, v.turno_id AS turnId, tv.nombre AS tipoVenta, v.fecha_hora AS date, v.total_centavos AS totalCents,
           v.estado AS status, u.nombre AS userName
    FROM venta v JOIN tipo_venta tv ON tv.id = v.tipo_venta_id JOIN usuario u ON u.id = v.usuario_id
    WHERE v.id = ? AND v.sucursal_id = ?
  `).bind(saleId, session.branchId).first();
  if (!sale) throw new ApiError(404, 'Venta no encontrada.', 'NOT_FOUND');
  const details = await db.prepare(`
    SELECT producto_id AS productId, nombre_producto AS productName, cantidad AS qty,
           precio_unitario_centavos AS priceCents
    FROM detalle_venta WHERE venta_id = ? ORDER BY producto_id
  `).bind(saleId).all();
  return {
    id: sale.id, turnId: sale.turnId, tipoVenta: sale.tipoVenta.toUpperCase(), date: sale.date,
    total: sale.totalCents / 100, status: sale.status, userName: sale.userName,
    lines: details.results.map((line) => ({
      productId: line.productId, productName: line.productName, qty: line.qty, price: line.priceCents / 100,
    })),
  };
}

async function listSales(env, session) {
  const cashier = session.role === 'cajero';
  const statement = env.DB.prepare(`
    SELECT v.id FROM venta v WHERE v.sucursal_id = ? ${cashier ? 'AND v.usuario_id = ?' : ''}
    ORDER BY v.fecha_hora DESC LIMIT 200
  `);
  const result = cashier ? await statement.bind(session.branchId, session.userId).all() : await statement.bind(session.branchId).all();
  const sales = await Promise.all(result.results.map((row) => loadSale(env.DB, session, row.id)));
  return json({ sales });
}

async function login(request, env) {
  const payload = await bodyJson(request);
  const username = requireText(payload.username, 'usuario', 80);
  const password = loginPassword(payload.password);
  const branchId = requireInteger(payload.branchId, 'sucursal', 1);
  const user = await env.DB.prepare(`
    SELECT u.id, u.password_hash AS passwordHash FROM usuario u JOIN sucursal b ON b.id = u.sucursal_id
    WHERE u.nombre_usuario = ? COLLATE NOCASE AND u.sucursal_id = ? AND u.activo = 1 AND b.activa = 1
  `).bind(username, branchId).first();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, 'Usuario, contraseña o sucursal no válidos.', 'INVALID_CREDENTIALS');
  }
  const token = createSessionToken();
  await env.DB.prepare('INSERT INTO sesion (usuario_id, token_hash, expira_en) VALUES (?, ?, ?)')
    .bind(user.id, await hashToken(token), sessionExpiration()).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, new URL(request.url).protocol === 'https:') });
}

async function logout(request, env, session) {
  if (session) await env.DB.prepare('UPDATE sesion SET revocada_en = CURRENT_TIMESTAMP WHERE id = ?').bind(session.sessionId).run();
  return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie(new URL(request.url).protocol === 'https:') });
}

async function createBootstrapAdmin(request, env) {
  if (!env.BOOTSTRAP_TOKEN || request.headers.get('X-Bootstrap-Token') !== env.BOOTSTRAP_TOKEN) {
    throw new ApiError(403, 'Token de inicialización inválido.', 'FORBIDDEN');
  }
  const payload = await bodyJson(request);
  const branchId = requireInteger(payload.branchId, 'sucursal', 1);
  const branch = await env.DB.prepare('SELECT id FROM sucursal WHERE id = ? AND activa = 1').bind(branchId).first();
  if (!branch) throw new ApiError(404, 'Sucursal no encontrada.', 'NOT_FOUND');
  const role = await env.DB.prepare("SELECT id FROM rol WHERE nombre = 'administrador'").first();
  const passwordHash = await hashPassword(requirePassword(payload.password));
  await env.DB.prepare('INSERT INTO usuario (rol_id, sucursal_id, nombre, nombre_usuario, password_hash) VALUES (?, ?, ?, ?, ?)')
    .bind(role.id, branchId, requireText(payload.name, 'nombre'), requireText(payload.username, 'usuario', 80), passwordHash).run();
  return json({ ok: true }, 201);
}

async function listUsers(env, session) {
  const result = await env.DB.prepare(`
    SELECT u.id, u.nombre AS name, u.nombre_usuario AS username, r.nombre AS role, u.activo AS active
    FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.sucursal_id = ? ORDER BY u.nombre
  `).bind(session.branchId).all();
  return json({ users: result.results.map((user) => ({ ...user, active: Boolean(user.active) })) });
}

async function createUser(request, env, session) {
  const payload = await bodyJson(request);
  const roleName = requireText(payload.role, 'rol', 30).toLowerCase();
  const role = await env.DB.prepare('SELECT id FROM rol WHERE nombre = ?').bind(roleName).first();
  if (!role) throw new ApiError(400, 'Rol no válido.', 'VALIDATION_ERROR');
  const passwordHash = await hashPassword(requirePassword(payload.password));
  const active = payload.active === false ? 0 : 1;
  const result = await env.DB.prepare('INSERT INTO usuario (rol_id, sucursal_id, nombre, nombre_usuario, password_hash, activo) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(role.id, session.branchId, requireText(payload.name, 'nombre'), requireText(payload.username, 'usuario', 80), passwordHash, active).run();
  return json({ id: result.meta.last_row_id }, 201);
}

async function updateUser(request, env, session, userId) {
  const payload = await bodyJson(request);
  const current = await env.DB.prepare('SELECT id FROM usuario WHERE id = ? AND sucursal_id = ?').bind(userId, session.branchId).first();
  if (!current) throw new ApiError(404, 'Usuario no encontrado.', 'NOT_FOUND');
  const role = await env.DB.prepare('SELECT id FROM rol WHERE nombre = ?').bind(requireText(payload.role, 'rol', 30).toLowerCase()).first();
  if (!role) throw new ApiError(400, 'Rol no válido.', 'VALIDATION_ERROR');
  const active = payload.active === false ? 0 : 1;
  if (payload.password) {
    await env.DB.prepare('UPDATE usuario SET rol_id = ?, nombre = ?, nombre_usuario = ?, activo = ?, password_hash = ? WHERE id = ? AND sucursal_id = ?')
      .bind(role.id, requireText(payload.name, 'nombre'), requireText(payload.username, 'usuario', 80), active, await hashPassword(requirePassword(payload.password)), userId, session.branchId).run();
  } else {
    await env.DB.prepare('UPDATE usuario SET rol_id = ?, nombre = ?, nombre_usuario = ?, activo = ? WHERE id = ? AND sucursal_id = ?')
      .bind(role.id, requireText(payload.name, 'nombre'), requireText(payload.username, 'usuario', 80), active, userId, session.branchId).run();
  }
  return json({ ok: true });
}

async function createBranch(request, env) {
  const payload = await bodyJson(request);
  const active = payload.active === false ? 0 : 1;
  const result = await env.DB.prepare('INSERT INTO sucursal (nombre, codigo, direccion, activa) VALUES (?, ?, ?, ?)')
    .bind(requireText(payload.name, 'nombre'), requireText(payload.code, 'código', 30).toUpperCase(), optionalText(payload.address, 'dirección'), active).run();
  return json({ id: result.meta.last_row_id }, 201);
}

async function updateBranch(request, env, branchId) {
  const payload = await bodyJson(request);
  const active = payload.active === false ? 0 : 1;
  const result = await env.DB.prepare('UPDATE sucursal SET nombre = ?, codigo = ?, direccion = ?, activa = ? WHERE id = ?')
    .bind(requireText(payload.name, 'nombre'), requireText(payload.code, 'código', 30).toUpperCase(), optionalText(payload.address, 'dirección'), active, branchId).run();
  if (!result.meta.changes) throw new ApiError(404, 'Sucursal no encontrada.', 'NOT_FOUND');
  return json({ ok: true });
}

const CATALOGS = {
  categories: ['categoria', 'nombre'],
  brands: ['marca', 'nombre'],
  units: ['unidad_medida', 'unidad'],
  statuses: ['estado', 'nombre'],
  saleTypes: ['tipo_venta', 'nombre'],
  roles: ['rol', 'nombre'],
};

const EDITABLE_CATALOGS = {
  categories: CATALOGS.categories,
  brands: CATALOGS.brands,
  units: CATALOGS.units,
};

async function listCatalogs(env) {
  const entries = await Promise.all(Object.entries(CATALOGS).map(async ([key, [table, column]]) => {
    const result = await env.DB.prepare(`SELECT id, ${column} AS name FROM ${table} ORDER BY ${column}`).all();
    return [key, result.results];
  }));
  return json(Object.fromEntries(entries));
}

async function createCatalogItem(request, env, catalog) {
  const target = EDITABLE_CATALOGS[catalog];
  if (!target) throw new ApiError(404, 'Catálogo no encontrado.', 'NOT_FOUND');
  const result = await env.DB.prepare(`INSERT INTO ${target[0]} (${target[1]}) VALUES (?)`).bind(requireText((await bodyJson(request)).name, 'nombre', 80)).run();
  return json({ id: result.meta.last_row_id }, 201);
}

async function updateCatalogItem(request, env, catalog, itemId) {
  const target = EDITABLE_CATALOGS[catalog];
  if (!target) throw new ApiError(404, 'Catálogo no encontrado.', 'NOT_FOUND');
  const result = await env.DB.prepare(`UPDATE ${target[0]} SET ${target[1]} = ? WHERE id = ?`).bind(requireText((await bodyJson(request)).name, 'nombre', 80), itemId).run();
  if (!result.meta.changes) throw new ApiError(404, 'Elemento no encontrado.', 'NOT_FOUND');
  return json({ ok: true });
}

async function handleApi(request, env) {
  validateOrigin(request);
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (method === 'GET' && pathname === '/api/auth/branches') {
    const result = await env.DB.prepare('SELECT id, nombre AS name FROM sucursal WHERE activa = 1 ORDER BY nombre').all();
    return json({ branches: result.results });
  }
  if (method === 'POST' && pathname === '/api/auth/login') return login(request, env);
  if (method === 'POST' && pathname === '/api/setup/admin') return createBootstrapAdmin(request, env);

  const session = await sessionFor(request, env);
  if (method === 'POST' && pathname === '/api/auth/logout') return logout(request, env, session);
  requireSession(session);

  if (method === 'GET' && pathname === '/api/me') return json({ user: {
    userId: session.userId, name: session.name, username: session.username, role: session.role,
    branchId: session.branchId, branchName: session.branchName, branchCode: session.branchCode,
  } });
  if (method === 'GET' && pathname === '/api/products') return listProducts(env, session);
  if (method === 'POST' && pathname === '/api/products') return createProduct(request, env, session);
  if (method === 'POST' && pathname === '/api/sales') return createSale(request, env, session);
  if (method === 'GET' && pathname === '/api/sales') return listSales(env, session);
  if (method === 'GET' && pathname === '/api/shifts/current') return currentShift(env, session);
  if (method === 'POST' && pathname === '/api/shifts/open') return openShift(env, session);
  if (method === 'POST' && pathname === '/api/shifts/current/close') return closeShift(env, session);

  if (pathname === '/api/users') {
    requireSession(session, new Set(['administrador']));
    if (method === 'GET') return listUsers(env, session);
    if (method === 'POST') return createUser(request, env, session);
  }
  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && method === 'PATCH') {
    requireSession(session, new Set(['administrador']));
    return updateUser(request, env, session, Number(userMatch[1]));
  }
  if (pathname === '/api/branches') {
    requireSession(session, new Set(['administrador']));
    if (method === 'GET') {
      const result = await env.DB.prepare('SELECT id, nombre AS name, codigo AS code, direccion AS address, activa AS active FROM sucursal ORDER BY nombre').all();
      return json({ branches: result.results.map((branch) => ({ ...branch, active: Boolean(branch.active) })) });
    }
    if (method === 'POST') return createBranch(request, env);
  }
  const branchMatch = pathname.match(/^\/api\/branches\/(\d+)$/);
  if (branchMatch && method === 'PATCH') {
    requireSession(session, new Set(['administrador']));
    return updateBranch(request, env, Number(branchMatch[1]));
  }
  if (method === 'GET' && pathname === '/api/catalogs') return listCatalogs(env);
  const catalogCreateMatch = pathname.match(/^\/api\/catalogs\/([A-Za-z]+)$/);
  if (catalogCreateMatch && method === 'POST') {
    requireSession(session, PRODUCT_ROLES);
    return createCatalogItem(request, env, catalogCreateMatch[1]);
  }
  const catalogUpdateMatch = pathname.match(/^\/api\/catalogs\/([A-Za-z]+)\/(\d+)$/);
  if (catalogUpdateMatch && method === 'PATCH') {
    requireSession(session, PRODUCT_ROLES);
    return updateCatalogItem(request, env, catalogUpdateMatch[1], Number(catalogUpdateMatch[2]));
  }

  const updateMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (updateMatch && method === 'PATCH') return updateProduct(request, env, session, Number(updateMatch[1]));
  const restockMatch = pathname.match(/^\/api\/products\/(\d+)\/restock$/);
  if (restockMatch && method === 'POST') return restockProduct(request, env, session, Number(restockMatch[1]));
  const deactivateMatch = pathname.match(/^\/api\/products\/(\d+)\/deactivate$/);
  if (deactivateMatch && method === 'POST') return deactivateProduct(env, session, Number(deactivateMatch[1]));

  throw new ApiError(404, 'Ruta no encontrada.', 'NOT_FOUND');
}

export default {
  async fetch(request, env) {
    try {
      const response = new URL(request.url).pathname.startsWith('/api/')
        ? await handleApi(request, env)
        : await env.ASSETS.fetch(request);
      return securityHeaders(response);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error(error);
      const conflict = !(error instanceof ApiError) && String(error).includes('UNIQUE constraint failed');
      return securityHeaders(json({
        error: {
          code: error instanceof ApiError ? error.code : conflict ? 'CONFLICT' : 'INTERNAL_ERROR',
          message: error instanceof ApiError ? error.message : conflict ? 'Ya existe un registro con esos datos.' : 'Error interno del servidor.',
        },
      }, error instanceof ApiError ? error.status : conflict ? 409 : 500));
    }
  },
};

export { ApiError, handleApi, moneyToCents };
