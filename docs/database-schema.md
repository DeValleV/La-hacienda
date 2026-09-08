# Esquema de base de datos

Este documento describe el modelo de datos para **La Hacienda**, una tienda de ventas rápidas. El esquema es independiente del motor para que pueda implementarse posteriormente en PostgreSQL o SQLite.

## Alcance

El sistema registra el catálogo de categorías y productos independientes por sucursal, sus existencias, ventas y el usuario que registra cada venta. No se requiere una entidad `Cliente`: las ventas son de mostrador y normalmente anónimas.

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

### `sucursal`

Representa cada ubicación operativa. Cada sucursal tiene su propio catálogo de productos y sus propias existencias.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |
| `codigo` | texto corto | obligatorio, único |
| `direccion` | texto | opcional |
| `activa` | booleano | obligatorio; valor predeterminado: verdadero |

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

Catálogo de estados aplicables a un producto, por ejemplo `activo`, `inactivo` o `descontinuado`.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |

### `rol`

Catálogo de roles de acceso: `administrador`, `encargado` y `cajero`.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |

### `producto`

Representa la unidad vendible e inventariable. Cada producto pertenece a una sola sucursal; no se comparten productos ni existencias entre sucursales.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `sucursal_id` | entero | FK a `sucursal.id`, obligatorio |
| `categoria_id` | entero | FK a `categoria.id`, obligatorio |
| `marca_id` | entero | FK a `marca.id`, obligatorio |
| `unidad_medida_id` | entero | FK a `unidad_medida.id`, obligatorio |
| `estado_id` | entero | FK a `estado.id`, obligatorio |
| `nombre_base` | texto corto | obligatorio |
| `precio_venta` | decimal(10,2) | obligatorio, no negativo |
| `stock` | entero | obligatorio, no negativo |
| `stock_minimo` | entero | obligatorio, no negativo |
| `color_tarjeta` | texto corto | obligatorio; color visual de la tarjeta del producto en la interfaz, en formato hexadecimal `#RRGGBB` |

Debe existir una restricción única sobre (`sucursal_id`, `categoria_id`, `marca_id`, `nombre_base`) si ese conjunto identifica un producto sin ambigüedad.

### `usuario`

Representa al cajero o personal que inicia sesión y registra operaciones. La contraseña nunca se almacena en texto plano.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `rol_id` | entero | FK a `rol.id`, obligatorio |
| `sucursal_id` | entero | FK a `sucursal.id`, obligatorio |
| `nombre` | texto corto | obligatorio |
| `nombre_usuario` | texto corto | obligatorio, único; identificador para iniciar sesión |
| `password_hash` | texto | obligatorio; hash de contraseña creado con Argon2id, bcrypt o equivalente seguro |
| `activo` | booleano | obligatorio; valor predeterminado: verdadero |

El rol controla los permisos de la aplicación. Por ejemplo, `administrador` puede administrar el catálogo, usuarios e inventario; `cajero` registra ventas y consulta la información necesaria para vender. Cada usuario está asignado a una sola sucursal.

### `sesion`

Sesiones web creadas después de validar las credenciales. Sólo se guarda el hash del token enviado en la cookie, nunca el token en texto plano.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `usuario_id` | entero | FK a `usuario.id`, obligatorio |
| `token_hash` | texto | obligatorio, único |
| `creada_en` | fecha y hora | obligatorio; valor predeterminado: momento actual |
| `expira_en` | fecha y hora | obligatorio |
| `revocada_en` | fecha y hora | opcional |

### `tipo_venta`

Catálogo para clasificar la venta en el comedor. Los valores iniciales son `comedor`, `facturada` y `personal`. No representa un método de pago.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `nombre` | texto corto | obligatorio, único |

### `venta`

Cabecera de una operación de venta.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `sucursal_id` | entero | FK a `sucursal.id`, obligatorio |
| `tipo_venta_id` | entero | FK a `tipo_venta.id`, obligatorio |
| `usuario_id` | entero | FK a `usuario.id`, obligatorio |
| `fecha_hora` | fecha y hora | obligatorio; valor predeterminado: momento actual |
| `total` | decimal(10,2) | obligatorio, no negativo |
| `estado` | texto corto | obligatorio; valores: `confirmada` o `anulada`; valor predeterminado: `confirmada` |
| `anulada_por_usuario_id` | entero | FK a `usuario.id`, opcional; obligatorio si está anulada |
| `fecha_anulacion` | fecha y hora | opcional; obligatoria si está anulada |
| `motivo_anulacion` | texto | opcional |

`total` puede derivarse de los detalles. Si se persiste para agilizar consultas, la aplicación debe mantenerlo igual a la suma de sus detalles.

Por ahora no se guardan método de pago, importe recibido ni cambio. Esos valores sólo se usan en el POS para validar el cobro en efectivo y calcular el cambio mostrado.

Una venta anulada permanece en el historial. No se elimina: se registra quién y cuándo la anuló, y se devuelve al producto la cantidad de cada detalle dentro de la misma transacción.

### `detalle_venta`

Renglones de una venta. Conserva el precio aplicado al momento de vender para que cambios futuros de precio no alteren el historial.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `venta_id` | entero | PK compuesta y FK a `venta.id` |
| `producto_id` | entero | PK compuesta y FK a `producto.id` |
| `cantidad` | entero | obligatorio, mayor que cero |
| `nombre_producto` | texto corto | obligatorio; copia del nombre mostrado al momento de vender |
| `precio_unitario` | decimal(10,2) | obligatorio, no negativo |

La clave primaria compuesta (`venta_id`, `producto_id`) permite un solo renglón por producto en cada venta. `nombre_producto` permite conservar el texto que se muestra en el historial aunque el catálogo cambie después. Si el POS necesita repetir el mismo producto en varios renglones por algún motivo, se puede añadir un `id` propio y conservar un índice por `venta_id`.

## Relaciones

```text
categoria 1 ── N producto N ── 1 marca
producto  N ── 1 unidad_medida
producto  N ── 1 estado
sucursal 1 ── N producto

usuario     1 ── N venta N ── 1 tipo_venta
venta       1 ── N detalle_venta N ── 1 producto
rol         1 ── N usuario N ── 1 sucursal
usuario     1 ── N sesion
```

## Reglas de integridad

- No se puede eliminar una categoría, marca, unidad, estado, usuario, tipo de venta o producto que esté en uso; preferir desactivarlo.
- Un producto que ya se haya usado no se elimina: se cambia a `inactivo` o `descontinuado`.
- Cada producto debe pertenecer a una categoría y tener un `color_tarjeta` válido para su representación en el POS.
- Sólo se almacenan hashes de contraseña. La aplicación debe verificar la contraseña con el mismo algoritmo que creó el hash.
- El acceso a funciones administrativas debe validarse a partir del `rol` del usuario autenticado.
- No se puede confirmar una venta sin al menos un `detalle_venta`.
- Al confirmar una venta, se valida que el usuario esté autorizado para la sucursal, se valida disponibilidad de cada producto y se descuenta su stock en una única transacción.
- Un producto inactivo no puede añadirse a una venta nueva.
- La sucursal de una venta, su usuario y todos sus productos debe coincidir. Cada consulta de inventario se filtra por sucursal.

## Compatibilidad con motores

| Necesidad | PostgreSQL | SQLite |
| --- | --- | --- |
| Id autogenerado | `GENERATED ... AS IDENTITY` | `INTEGER PRIMARY KEY` |
| Fecha y hora | `TIMESTAMPTZ` o `TIMESTAMP` | texto ISO-8601 (`YYYY-MM-DDTHH:MM:SS`) |
| Importe exacto | `NUMERIC(10,2)` | entero en centavos recomendado, o `NUMERIC` con cuidado |
| Llaves foráneas | activas por defecto | activar por conexión con `PRAGMA foreign_keys = ON` |

La decisión de motor no cambia el modelo. SQLite es adecuado para una instalación local sencilla; PostgreSQL conviene si habrá varios equipos conectados, más concurrencia o administración centralizada.
