# Esquema de base de datos

Este documento describe el modelo de datos para **La Hacienda**, una tienda de ventas rápidas. El esquema es independiente del motor para que pueda implementarse posteriormente en PostgreSQL o SQLite.

## Alcance

El sistema registra el catálogo de categorías y productos, sus presentaciones vendibles (SKU), existencias, ventas y el usuario que registra cada venta. No se requiere una entidad `Cliente`: las ventas son de mostrador y normalmente anónimas.

## Convenciones

- Los nombres se muestran en `snake_case` y en singular.
- Las claves primarias se llaman `id` y son enteros generados por la base de datos.
- Todas las columnas marcadas como FK deben tener índice.
- Importes monetarios se almacenan como `decimal(10,2)` o equivalente exacto; nunca como punto flotante (`double`/`real`).
- Las fechas de operaciones se almacenan con fecha y hora, no sólo con la hora.

## Tablas

### `categoria`

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |

### `marca`

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |

### `unidad_medida`

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `unidad` | texto corto | obligatorio, único; p. ej. `pieza`, `kg`, `L` |

### `estado`

Catálogo de estados aplicables a un SKU, por ejemplo `activo`, `inactivo` o `descontinuado`.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |

### `producto`

Representa el producto base, antes de distinguir sus presentaciones vendibles.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `categoria_id` | entero | FK a `categoria.id`, obligatorio |
| `marca_id` | entero | FK a `marca.id`, obligatorio |
| `nombre_base` | texto corto | obligatorio |
| `color_tarjeta` | texto corto | obligatorio; color visual de la tarjeta del producto en la interfaz, en formato hexadecimal `#RRGGBB` |

Debe existir una restricción única sobre (`categoria_id`, `marca_id`, `nombre_base`) si ese conjunto identifica un producto sin ambigüedad.

### `sku_producto`

Cada fila corresponde a una presentación concreta que se puede vender e inventariar. Ejemplo: un producto base puede tener SKU de lata, botella de 600 ml y botella de 2 L.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `producto_id` | entero | FK a `producto.id`, obligatorio |
| `unidad_medida_id` | entero | FK a `unidad_medida.id`, obligatorio |
| `estado_id` | entero | FK a `estado.id`, obligatorio |
| `codigo_sku` | texto corto | obligatorio, único; código escaneable o interno |
| `precio` | decimal(10,2) | obligatorio, no negativo |
| `stock` | entero o decimal | obligatorio, no negativo; decimal si se venden fracciones |
| `stock_minimo` | entero o decimal | obligatorio, no negativo |

El campo `stock` permite consultas rápidas, pero debe actualizarse dentro de la misma transacción que cada venta, entrada o ajuste de inventario.

### `usuario`

Representa al cajero o personal que inicia sesión y registra operaciones. La contraseña nunca se almacena en texto plano.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio |
| `password_hash` | texto | obligatorio; hash de contraseña creado con Argon2id, bcrypt o equivalente seguro |
| `rol` | texto corto | obligatorio; valores iniciales: `administrador` o `cajero` |

El rol controla los permisos de la aplicación. Por ejemplo, `administrador` puede administrar el catálogo, usuarios e inventario; `cajero` registra ventas y consulta la información necesaria para vender. Si en el futuro se requieren permisos más detallados, `rol` puede migrarse a una tabla de roles y permisos.

### `tipo_venta`

Catálogo de modalidades de venta, por ejemplo `contado`, `tarjeta` o `mixto`.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |

### `venta`

Cabecera de una operación de venta.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `tipo_venta_id` | entero | FK a `tipo_venta.id`, obligatorio |
| `usuario_id` | entero | FK a `usuario.id`, obligatorio |
| `fecha_hora` | fecha y hora | obligatorio; valor predeterminado: momento actual |
| `total` | decimal(10,2) | obligatorio, no negativo |

`total` puede derivarse de los detalles. Si se persiste para agilizar consultas, la aplicación debe mantenerlo igual a la suma de sus detalles.

### `detalle_venta`

Renglones de una venta. Conserva el precio aplicado al momento de vender para que cambios futuros de precio no alteren el historial.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `venta_id` | entero | PK compuesta y FK a `venta.id` |
| `sku_producto_id` | entero | PK compuesta y FK a `sku_producto.id` |
| `cantidad` | entero o decimal | obligatorio, mayor que cero |
| `precio_unitario` | decimal(10,2) | obligatorio, no negativo |

La clave primaria compuesta (`venta_id`, `sku_producto_id`) permite un solo renglón por SKU en cada venta. Si el POS necesita repetir el mismo SKU en varios renglones por algún motivo, se puede añadir un `id` propio y conservar un índice por `venta_id`.

## Relaciones

```text
categoria 1 ── N producto N ── 1 marca
producto  1 ── N sku_producto N ── 1 unidad_medida
                            N ── 1 estado

usuario     1 ── N venta N ── 1 tipo_venta
venta       1 ── N detalle_venta N ── 1 sku_producto
```

## Reglas de integridad

- No se puede eliminar una categoría, marca, unidad, estado, usuario, tipo de venta o producto que esté en uso; preferir desactivarlo.
- Cada producto debe pertenecer a una categoría y tener un `color_tarjeta` válido para su representación en el POS.
- Sólo se almacenan hashes de contraseña. La aplicación debe verificar la contraseña con el mismo algoritmo que creó el hash.
- El acceso a funciones administrativas debe validarse a partir del `rol` del usuario autenticado.
- No se puede confirmar una venta sin al menos un `detalle_venta`.
- Al confirmar una venta, se valida disponibilidad y se descuenta el stock de cada SKU en una única transacción.
- Un SKU inactivo no puede añadirse a una venta nueva.
- Para trazabilidad completa se recomienda añadir después una tabla `movimiento_inventario` para entradas, mermas, correcciones y salidas por venta.

## Compatibilidad con motores

| Necesidad | PostgreSQL | SQLite |
| --- | --- | --- |
| Id autogenerado | `GENERATED ... AS IDENTITY` | `INTEGER PRIMARY KEY` |
| Fecha y hora | `TIMESTAMPTZ` o `TIMESTAMP` | texto ISO-8601 (`YYYY-MM-DDTHH:MM:SS`) |
| Importe exacto | `NUMERIC(10,2)` | entero en centavos recomendado, o `NUMERIC` con cuidado |
| Llaves foráneas | activas por defecto | activar por conexión con `PRAGMA foreign_keys = ON` |

La decisión de motor no cambia el modelo. SQLite es adecuado para una instalación local sencilla; PostgreSQL conviene si habrá varios equipos conectados, más concurrencia o administración centralizada.
