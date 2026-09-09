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
            sucursales, usuarios, productos, turnos, ventas y detalles
```

Workers puede desplegar el código y los archivos estáticos como una sola unidad; D1 se enlaza al Worker mediante un *binding*. [Static Assets de Workers](https://developers.cloudflare.com/workers/static-assets/), [D1 Worker Binding API](https://developers.cloudflare.com/d1/worker-api/)

## Límites del modelo

- Cada `producto` pertenece a una única `sucursal`; incluye su propio stock y stock mínimo.
- Categorías, marcas y unidades son catálogos compartidos; la independencia operativa se aplica al producto, su precio y sus existencias.
- Cada `usuario` está asignado a una sucursal. Al iniciar sesión, la sucursal seleccionada debe coincidir con la del usuario.
- Una venta, su usuario y todos sus productos deben ser de la misma sucursal.
- Cada venta pertenece al turno abierto de su sucursal; sólo puede haber un turno abierto por sucursal.
- El historial se forma con `venta` y `detalle_venta`; no habrá tabla de movimientos de inventario en esta versión.
- El producto se identifica por `producto.id`; no se utiliza SKU.

El esquema completo y sus restricciones viven en [database-schema.md](database-schema.md).

Para la configuración de una cuenta nueva y el despliegue completo, sigue [guia-despliegue-cloudflare.md](guia-despliegue-cloudflare.md). Incluye los comandos, la inicialización de administradores, validación de staging y operación posterior.

## Autenticación y autorización

1. `POST /api/auth/login` recibe sucursal, nombre de usuario y contraseña.
2. El Worker busca un usuario activo de esa sucursal y verifica `password_hash` con PBKDF2-SHA-256 (310 000 iteraciones y sal aleatoria), implementado con Web Crypto.
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

La interfaz ya no contiene credenciales de demostración. El primer administrador se crea mediante un endpoint de inicialización protegido por `BOOTSTRAP_TOKEN`; el secreto nunca se versiona y se configura como secreto del Worker. [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## API inicial

| Método y ruta | Roles | Acción |
| --- | --- | --- |
| `POST /api/auth/login` | Público | Inicia sesión para una sucursal autorizada. |
| `POST /api/auth/logout` | Autenticado | Revoca la sesión actual. |
| `GET /api/me` | Autenticado | Devuelve usuario, rol y sucursal activa. |
| `GET /api/products` | Cajero, encargado, administrador | Lista productos de la sucursal de la sesión. |
| `POST /api/sales` | Cajero, encargado, administrador | Crea venta, detalles y descuenta stock en una transacción. |
| `GET /api/sales` | Cajero, encargado, administrador | Historial de sólo lectura; el cajero ve únicamente sus ventas y los demás roles ven su sucursal. |
| `GET /api/shifts/current` | Autenticado | Consulta el turno abierto de la sucursal. |
| `POST /api/shifts/open` | Encargado, administrador | Abre el turno de la sucursal. |
| `POST /api/shifts/current/close` | Encargado, administrador | Cierra el turno abierto. |
| `POST/PATCH /api/products` | Encargado, administrador | Crea y modifica productos de la sucursal. |
| `POST /api/products/:id/restock` | Encargado, administrador | Aumenta existencias de un producto de la sucursal. |
| `POST /api/products/:id/deactivate` | Encargado, administrador | Cambia el estado; nunca borra un producto usado. |
| `GET/POST/PATCH /api/users` | Administrador | Administra usuarios de su sucursal. |
| `GET/POST/PATCH /api/branches` | Administrador | Administra sucursales. |
| `GET /api/catalogs` | Autenticado | Consulta catálogos requeridos por la interfaz. |
| `POST/PATCH /api/catalogs/{categories,brands,units}` | Encargado, administrador | Administra únicamente catálogos editables; roles, estados y tipos de venta son internos. |

`POST /api/sales` será transaccional: valida sesión, turno abierto, sucursal, estado de producto y stock; crea `venta` y `detalle_venta`; actualiza el stock; calcula y persiste el total exacto en centavos. Ningún total, precio o id enviado por el navegador será confiable sin comprobarse.

## Estructura implementada

```text
public/                  interfaz estática publicada por el Worker
  index.html             vistas, formularios y diálogos
  src/api.js             cliente HTTP de la interfaz
  src/app.js             sesión, permisos y coordinación de vistas
  src/views/             inventario, venta, turno, historial y configuración
src/worker.js            API, autorización y reglas de negocio
src/auth.js              contraseñas, tokens y cookies de sesión
migrations/0001_initial.sql
                         esquema, índices, restricciones, triggers y semillas
wrangler.toml            Worker, assets y bindings de producción/staging
server.js                servidor estático local; no sustituye la API
```

`server.js` sólo permite inspeccionar archivos estáticos. El flujo funcional completo se ejecuta con `wrangler dev`, porque login, productos, turnos y ventas requieren el binding D1.

## Estado funcional de la interfaz

- Login real por sucursal, usuario y contraseña; la pantalla se oculta al autenticar.
- Inventario filtrable por nombre, ID y categoría, con alta, edición, reposición, desactivación lógica y exportación CSV.
- Punto de venta bloqueado si no existe un turno abierto. `Pagado` y `Cambio` se calculan sólo en el navegador y no se persisten.
- Apertura/cierre de turno y reporte exportable del turno actual o recién cerrado.
- Historial de ventas de sólo lectura, con turno, fecha, usuario y datos históricos del detalle.
- Configuración de usuarios de la sucursal, sucursales y los catálogos editables de categoría, marca y unidad.
- Navegación y acciones administrativas ocultas de acuerdo con el rol; el Worker vuelve a validar todos los permisos.

## Entornos y datos

| Entorno | Worker | Base de datos | Uso |
| --- | --- | --- | --- |
| Desarrollo | local (`wrangler dev`) | D1 local | desarrollo diario y datos de prueba |
| Staging | `la-hacienda-staging` | D1 exclusiva de staging | validación antes de producción |
| Producción | `la-hacienda` | D1 exclusiva de producción | operación real |

Las migraciones SQL se almacenan en `migrations/` y se aplican en orden a cada base; no se modificará producción manualmente desde la consola. [Migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/)

## Verificación local

Después de instalar dependencias con `pnpm install`, `pnpm run dev` inicia Worker, assets y D1 local. `pnpm test` valida la migración y el contrato básico entre el HTML y las vistas. `pnpm run serve:static` sirve únicamente la maqueta y no puede completar login ni operaciones de API. La guía separa el flujo completo local del remoto en [guia-despliegue-cloudflare.md](guia-despliegue-cloudflare.md).

## Operación y continuidad

- Dominio propio con HTTPS administrado por Cloudflare.
- Registros de Worker habilitados y revisión de errores después de cada despliegue. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- Exportación periódica de ventas a CSV, guardada fuera de la máquina de operación.
- Antes de cambios de esquema, verificar recuperación de D1 mediante Time Travel o respaldo disponible en la cuenta.
- Sin operación sin conexión en la primera versión; una venta sólo se confirma tras respuesta exitosa de la API.

## Secuencia para el primer despliegue

1. Crear proyecto Worker y las dos bases D1 remotas: staging y producción.
2. Crear la migración inicial a partir del esquema acordado y probarla localmente. **Implementado y validado con SQLite local.**
3. Sustituir los datos y autenticación de demostración por la API y sesiones reales. **Implementado.**
4. Configurar secretos, bindings de D1 y dominio de staging.
5. Probar login, aislamiento entre sucursales, venta, reducción de stock, desactivación e historial en staging.
6. Crear la base de producción, aplicar la misma migración y desplegar el Worker de producción.
7. Crear el primer administrador por sucursal mediante un proceso controlado y retirar o rotar `BOOTSTRAP_TOKEN`.

No se debe desplegar producción hasta completar la configuración Cloudflare de los pasos 1, 4 y 5. Este repositorio no contiene identificadores D1 ni secretos reales.
