# Esquema de base de datos

Este documento describe el modelo de datos para **La Hacienda**, una tienda de ventas rápidas. El esquema es independiente del motor para que pueda implementarse posteriormente en PostgreSQL o SQLite.

## Alcance

El sistema registra catálogos auxiliares compartidos (categorías, marcas y unidades), productos y existencias independientes por sucursal, ventas y el usuario que registra cada venta. No se requiere una entidad `Cliente`: las ventas son de mostrador y normalmente anónimas.

## Convenciones

- Los nombres se muestran en `snake_case` y en singular.
- Las claves primarias se llaman `id` y son enteros. D1 genera las entidades maestras; el servicio asigna a `venta.id` un entero aleatorio seguro de hasta 53 bits para poder crear cabecera y detalles en un solo lote transaccional.
- Todas las columnas marcadas como FK deben tener índice.
- En D1, los importes monetarios se almacenan como enteros en centavos; nunca como punto flotante (`double`/`real`). La API los presenta como cantidades con dos decimales.
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
| `precio_centavos` | entero | obligatorio, no negativo |
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
| `password_hash` | texto | obligatorio; actualmente PBKDF2-SHA-256 con 310 000 iteraciones y sal aleatoria |
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

### `turno`

Periodo operativo de una sucursal. Sólo puede existir un turno abierto por sucursal.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `sucursal_id` | entero | FK a `sucursal.id`, obligatorio |
| `abierto_por_usuario_id` | entero | FK a `usuario.id`, obligatorio |
| `cerrado_por_usuario_id` | entero | FK a `usuario.id`, opcional; obligatorio al cerrar |
| `fecha_apertura` | fecha y hora | obligatorio; valor predeterminado: momento actual |
| `fecha_cierre` | fecha y hora | opcional; obligatoria al cerrar |
| `estado` | texto corto | obligatorio: `abierto` o `cerrado` |

### `venta`

Cabecera de una operación de venta.

| Columna | Tipo lógico | Reglas |
| --- | --- | --- |
| `id` | entero | PK |
| `sucursal_id` | entero | FK a `sucursal.id`, obligatorio |
| `turno_id` | entero | FK a `turno.id`, obligatorio |
| `tipo_venta_id` | entero | FK a `tipo_venta.id`, obligatorio |
| `usuario_id` | entero | FK a `usuario.id`, obligatorio |
| `fecha_hora` | fecha y hora | obligatorio; valor predeterminado: momento actual |
| `total_centavos` | entero | obligatorio, no negativo |
| `estado` | texto corto | obligatorio; valores: `confirmada` o `anulada`; valor predeterminado: `confirmada` |
| `anulada_por_usuario_id` | entero | FK a `usuario.id`, opcional; obligatorio si está anulada |
| `fecha_anulacion` | fecha y hora | opcional; obligatoria si está anulada |
| `motivo_anulacion` | texto | opcional |

`total_centavos` se mantiene igual a la suma de cantidad por precio unitario de sus detalles mediante la transacción de venta.

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
| `precio_unitario_centavos` | entero | obligatorio, no negativo |

La clave primaria compuesta (`venta_id`, `producto_id`) permite un solo renglón por producto en cada venta. `nombre_producto` permite conservar el texto que se muestra en el historial aunque el catálogo cambie después. Si el POS necesita repetir el mismo producto en varios renglones por algún motivo, se puede añadir un `id` propio y conservar un índice por `venta_id`.

## Relaciones

```text
categoria 1 ── N producto N ── 1 marca
producto  N ── 1 unidad_medida
producto  N ── 1 estado
sucursal 1 ── N producto
sucursal 1 ── N turno

usuario     1 ── N venta N ── 1 tipo_venta
turno       1 ── N venta
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
- Sólo puede existir un turno con estado `abierto` por sucursal y no se pueden registrar ventas sin turno abierto.
- Quien abre o cierra un turno debe ser un usuario activo de la misma sucursal. Al cerrar se guardan obligatoriamente usuario y fecha de cierre.
- Al confirmar una venta, se valida que el usuario esté autorizado para la sucursal, se valida disponibilidad de cada producto y se descuenta su stock en una única transacción.
- Un producto inactivo no puede añadirse a una venta nueva.
- La sucursal de una venta, su usuario y todos sus productos debe coincidir. Cada consulta de inventario se filtra por sucursal.
- Sin una tabla de movimientos, las reposiciones y correcciones manuales sólo modifican el stock actual. La trazabilidad incluida en esta versión cubre salidas por venta mediante `detalle_venta` y la operación del turno mediante `turno`.

## Correspondencia física en Cloudflare D1

La migración versionada es `migrations/0001_initial.sql`. Implementa los importes como `INTEGER` (`precio_centavos`, `total_centavos` y `precio_unitario_centavos`), usa índices parciales para impedir dos turnos abiertos en una sucursal y triggers para validar:

- usuario y sucursal al abrir o cerrar un turno;
- turno abierto, usuario y sucursal al crear una venta;
- sucursal, estado y stock del producto al insertar un detalle;
- descuento de stock y acumulación del total a partir del precio histórico.

La API no acepta un total calculado por el navegador. Obtiene el nombre y el precio desde `producto`, los copia a `detalle_venta` y deja que la base actualice el total.

## Compatibilidad con motores

| Necesidad | PostgreSQL | SQLite |
| --- | --- | --- |
| Id autogenerado | `GENERATED ... AS IDENTITY` | `INTEGER PRIMARY KEY` |
| Fecha y hora | `TIMESTAMPTZ` o `TIMESTAMP` | texto ISO-8601 (`YYYY-MM-DDTHH:MM:SS`) |
| Importe exacto | `NUMERIC(10,2)` o centavos enteros | entero en centavos |
| Llaves foráneas | activas por defecto | activar por conexión con `PRAGMA foreign_keys = ON` |

La decisión de motor no cambia el modelo. SQLite es adecuado para una instalación local sencilla; PostgreSQL conviene si habrá varios equipos conectados, más concurrencia o administración centralizada.
