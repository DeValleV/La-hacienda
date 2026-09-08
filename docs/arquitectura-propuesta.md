# Arquitectura de despliegue

## Decisión

La Hacienda se desplegará como una aplicación *full-stack* en un único **Cloudflare Worker**. El Worker servirá los archivos estáticos de la interfaz y atenderá la API bajo `/api/*`; se elimina el servidor Node local del despliegue. La persistencia estará en **Cloudflare D1**.

No se usarán Cloudflare Pages, R2, KV ni otro servidor en la primera versión. Para el máximo previsto de cinco usuarios concurrentes y un catálogo pequeño, añadirlos aumentaría la complejidad sin aportar una necesidad real.

```text
Navegador
    │ HTTPS + cookie de sesión HttpOnly
    ▼
Cloudflare Worker
    ├── archivos estáticos: HTML, CSS y JavaScript
    └── API /api/*: autenticación, autorización y reglas de negocio
                 │
                 ▼
            Cloudflare D1
            sucursales, usuarios, productos, ventas y detalles
```

Workers puede desplegar el código y los archivos estáticos como una sola unidad; D1 se enlaza al Worker mediante un *binding*. [Static Assets de Workers](https://developers.cloudflare.com/workers/static-assets/), [D1 Worker Binding API](https://developers.cloudflare.com/d1/worker-api/)

## Límites del modelo

- Cada `producto` pertenece a una única `sucursal`; incluye su propio stock y stock mínimo.
- Cada `usuario` está asignado a una sucursal. Al iniciar sesión, la sucursal seleccionada debe coincidir con la del usuario.
- Una venta, su usuario y todos sus productos deben ser de la misma sucursal.
- El historial se forma con `venta` y `detalle_venta`; no habrá tabla de movimientos de inventario en esta versión.
- El producto se identifica por `producto.id`; no se utiliza SKU.

El esquema completo y sus restricciones viven en [database-schema.md](database-schema.md).

## Autenticación y autorización

1. `POST /api/auth/login` recibe sucursal, nombre de usuario y contraseña.
2. El Worker busca un usuario activo de esa sucursal y verifica `password_hash` mediante un algoritmo resistente, implementado en el Worker.
3. Crea una sesión aleatoria, guarda únicamente el hash del token en D1 y responde con una cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
4. Toda ruta protegida carga la sesión y construye el contexto `{ usuario, rol, sucursal }` desde el servidor.
5. El Worker valida rol y sucursal en cada operación; el navegador nunca decide permisos ni la sucursal efectiva.

El esquema incluye la tabla `sesion` para implementar autenticación:

| Columna | Regla |
| --- | --- |
| `id` | PK |
| `usuario_id` | FK a `usuario.id`, obligatorio |
| `token_hash` | obligatorio, único |
| `expira_en` | obligatorio |
| `revocada_en` | opcional |
| `creada_en` | obligatorio |

Las credenciales de demostración actuales se eliminarán antes del primer despliegue. Los secretos nunca se versionan: se registran como secretos del Worker. [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## API inicial

| Método y ruta | Roles | Acción |
| --- | --- | --- |
| `POST /api/auth/login` | Público | Inicia sesión para una sucursal autorizada. |
| `POST /api/auth/logout` | Autenticado | Revoca la sesión actual. |
| `GET /api/me` | Autenticado | Devuelve usuario, rol y sucursal activa. |
| `GET /api/products` | Cajero, encargado, administrador | Lista productos de la sucursal de la sesión. |
| `POST /api/sales` | Cajero, encargado, administrador | Crea venta, detalles y descuenta stock en una transacción. |
| `GET /api/sales` | Encargado, administrador | Historial de sólo lectura de la sucursal. |
| `GET/POST/PATCH /api/products` | Encargado, administrador | Consulta y administra productos de la sucursal. |
| `POST /api/products/:id/deactivate` | Encargado, administrador | Cambia el estado; nunca borra un producto usado. |
| `GET/POST/PATCH /api/users` | Administrador | Administra usuarios de su sucursal. |
| `GET/POST/PATCH /api/branches` | Administrador | Administra sucursales. |

`POST /api/sales` será transaccional: valida sesión, sucursal, estado de producto y stock; crea `venta` y `detalle_venta`; actualiza el stock; calcula y persiste el total exacto. Ningún total, precio o id enviado por el navegador será confiable sin comprobarse.

## Estructura del repositorio objetivo

```text
public/                 interfaz estática publicada por el Worker
src/worker.ts           router HTTP, sesión y middleware de autorización
src/api/                handlers por recurso
src/services/           reglas de negocio y transacciones D1
migrations/             SQL versionado de D1
wrangler.toml           Worker, assets y bindings por entorno
tests/                  pruebas de API y reglas de negocio
```

Los archivos actuales de interfaz se moverán gradualmente a `public/`. `server.js` quedará sólo como ayuda local temporal y se retirará al tener `wrangler dev`.

## Entornos y datos

| Entorno | Worker | Base de datos | Uso |
| --- | --- | --- | --- |
| Desarrollo | local (`wrangler dev`) | D1 local | desarrollo diario y datos de prueba |
| Staging | `la-hacienda-staging` | D1 exclusiva de staging | validación antes de producción |
| Producción | `la-hacienda` | D1 exclusiva de producción | operación real |

Las migraciones SQL se almacenan en `migrations/` y se aplican en orden a cada base; no se modificará producción manualmente desde la consola. [Migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/)

## Operación y continuidad

- Dominio propio con HTTPS administrado por Cloudflare.
- Registros de Worker habilitados y revisión de errores después de cada despliegue. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- Exportación periódica de ventas a CSV, guardada fuera de la máquina de operación.
- Antes de cambios de esquema, verificar recuperación de D1 mediante Time Travel o respaldo disponible en la cuenta.
- Sin operación sin conexión en la primera versión; una venta sólo se confirma tras respuesta exitosa de la API.

## Secuencia para el primer despliegue

1. Crear proyecto Worker y las dos bases D1 remotas: staging y producción.
2. Crear la migración inicial a partir del esquema acordado y probarla localmente.
3. Sustituir los datos y autenticación de demostración por la API y sesiones reales.
4. Configurar secretos, bindings de D1 y dominio de staging.
5. Probar login, aislamiento entre sucursales, venta, reducción de stock, desactivación e historial en staging.
6. Crear la base de producción, aplicar la misma migración y desplegar el Worker de producción.
7. Crear el primer administrador por sucursal mediante un proceso controlado y retirar todo usuario demo.

No se debe desplegar producción hasta completar los pasos 2 a 5.
