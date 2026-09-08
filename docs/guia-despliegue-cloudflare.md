# Guía de entrega, configuración y despliegue en Cloudflare

Esta guía permite poner **La Hacienda** en funcionamiento desde una cuenta nueva de Cloudflare. Está escrita para quien toma el proyecto sin haber participado en su desarrollo.

> Alcance: la guía crea recursos remotos y publica el sistema. Ejecútala sólo desde una cuenta Cloudflare que pertenezca al proyecto. No guarda claves, tokens ni identificadores reales en el repositorio.

## 1. Qué se va a desplegar

La Hacienda es un punto de venta para comedor industrial con inventario separado por sucursal. No es una página estática: un único **Cloudflare Worker** sirve tanto la interfaz como la API y usa una base **Cloudflare D1** para guardar los datos.

```text
Empleado
   │ navegador, HTTPS y cookie de sesión
   ▼
Cloudflare Worker
   ├── public/  → interfaz HTML, CSS y JavaScript
   └── /api/*   → login, roles, inventario, turnos y ventas
                         │
                         ▼
                    Cloudflare D1
```

No se requieren Cloudflare Pages, R2, KV, servidor propio ni una base de datos externa.

### Funciones entregadas

- Inicio de sesión por sucursal, usuario y contraseña.
- Roles: `cajero`, `encargado` y `administrador`.
- Productos, precio y existencias aislados por sucursal.
- Alta, edición, reposición y desactivación lógica de productos.
- Ventas clasificadas como comedor, facturada o personal.
- Turnos: sólo uno abierto por sucursal; no se puede cobrar fuera de un turno.
- Historial de ventas de sólo lectura con producto, nombre y precio históricos.
- Configuración de usuarios de la sucursal actual, sucursales y catálogos compartidos.
- Exportación CSV de inventario y de ventas del turno.

Las reglas del modelo están explicadas en [database-schema.md](database-schema.md) y la arquitectura técnica en [arquitectura-propuesta.md](arquitectura-propuesta.md).

### Límites intencionales de esta primera versión

- No se guardan método de pago, importe recibido ni cambio.
- No hay SKU: el identificador del producto es `producto.id`.
- No existe una tabla de movimientos de inventario. Las ventas y los turnos sí dejan trazabilidad; las reposiciones sólo cambian el stock actual.
- Categorías, marcas y unidades son compartidas; los productos y sus existencias no se comparten entre sucursales.
- Un administrador administra usuarios de la sucursal donde inició sesión. Al crear una sucursal nueva, hay que crear su administrador inicial antes de retirar el secreto de inicialización.

## 2. Archivos que no se deben modificar sin entender su función

| Archivo o carpeta | Responsabilidad |
| --- | --- |
| `public/` | Interfaz que se publica como asset estático. |
| `src/worker.js` | API, autorización, sesión, ventas y reglas de negocio. |
| `src/auth.js` | Hash de contraseñas, tokens y cookies de sesión. |
| `migrations/0001_initial.sql` | Esquema inicial, restricciones, triggers y datos semilla. |
| `wrangler.toml` | Nombres de Workers, assets y bindings D1 por entorno. |
| `.dev.vars` | Secreto local. No existe en Git y no se debe subir. |

La migración ya contiene dos sucursales semilla: `Sucursal Centro` y `Sucursal Norte`; no contiene usuarios ni contraseñas. También añade cinco productos de ejemplo repartidos entre ambas sucursales. En producción se pueden editar o desactivar desde Inventario; no se deben borrar físicamente.

## 3. Antes de tocar Cloudflare

1. Crear una cuenta Cloudflare y activar MFA/2FA para quien vaya a administrar producción.
2. Instalar Node.js LTS actual y Git en el equipo de despliegue.
3. Obtener una copia limpia del repositorio y revisar que no contenga `.dev.vars`, `.env`, IDs D1 reales ni contraseñas.
4. En la raíz del proyecto ejecutar:

   ```bash
   npm install
   npm test
   npx wrangler login
   ```

   `wrangler login` abre el flujo de autenticación del navegador para vincular la terminal con la cuenta Cloudflare. `npm test` debe terminar con dos pruebas exitosas antes de publicar.

## 4. Probar localmente primero

1. Crear el archivo local de secretos a partir del ejemplo:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Abrir `.dev.vars` y reemplazar el valor de ejemplo de `BOOTSTRAP_TOKEN` por una cadena aleatoria larga, guardada también en un gestor de contraseñas.
3. Aplicar la base local y arrancar el Worker:

   ```bash
   npm run db:migrate:local
   npm run dev
   ```

4. Abrir la URL que imprima Wrangler, normalmente `http://localhost:8787`.
5. Crear el primer administrador local usando el endpoint de inicialización descrito en la sección 7. Para local, la URL será la de Wrangler.

La base D1 local vive en `.wrangler/`; se puede borrar para reiniciar datos de prueba. No hagas esto con una base remota.

## 5. Crear los recursos remotos

Se usan dos entornos separados. Nunca apuntes staging a la base de producción.

| Entorno | Worker | D1 | Objetivo |
| --- | --- | --- | --- |
| Staging | `la-hacienda-staging` | `la-hacienda-staging` | Pruebas antes de publicar. |
| Producción | `la-hacienda` | `la-hacienda` | Operación real. |

Desde la raíz del proyecto, crea primero las dos bases:

```bash
npx wrangler d1 create la-hacienda-staging
npx wrangler d1 create la-hacienda
```

Cada comando imprime un bloque con `database_name` y `database_id`. Si Wrangler ofrece modificar el archivo automáticamente, elige **No**: este proyecto ya tiene dos bloques D1 y conviene actualizarlo manualmente.

Edita [wrangler.toml](../wrangler.toml):

| Placeholder actual | Sustituir por |
| --- | --- |
| `REPLACE_WITH_PRODUCTION_DATABASE_ID` | ID mostrado al crear `la-hacienda`. |
| `REPLACE_WITH_STAGING_DATABASE_ID` | ID mostrado al crear `la-hacienda-staging`. |

No cambies el binding `DB`: el código lo usa como `env.DB`.

## 6. Aplicar migraciones de forma segura

Primero aplica y revisa staging:

```bash
npm run db:migrate:staging
```

Confirma que sólo se aplique `0001_initial.sql`. Después consulta las sucursales semilla:

```bash
npx wrangler d1 execute la-hacienda-staging --remote --command "SELECT id, nombre, codigo, activa FROM sucursal;"
```

Debe devolver las dos sucursales. Conserva sus IDs para crear los administradores iniciales. En una instalación limpia serán normalmente `1` y `2`, pero usa siempre el resultado de la consulta, no una suposición.

Cuando staging esté validado, la misma migración se aplicará a producción con:

```bash
npm run db:migrate:production
```

No edites una migración que ya haya llegado a un entorno remoto. Para cambios futuros se crea otra migración numerada, se prueba localmente, se aplica a staging y sólo después a producción.

## 7. Configurar el secreto y crear administradores iniciales

`BOOTSTRAP_TOKEN` es un secreto temporal que habilita `POST /api/setup/admin`. Sirve para crear el primer administrador cuando no existe ningún usuario. No es una contraseña de uso diario ni debe aparecer en un commit, captura o chat.

1. Genera una cadena aleatoria larga en un gestor de contraseñas.
2. Guarda el secreto de staging. El comando pedirá el valor de forma interactiva:

   ```bash
   npx wrangler secret put BOOTSTRAP_TOKEN --env staging
   ```

   Cloudflare publica una versión del Worker al guardar un secreto; por eso se aplicó la migración antes.

3. Despliega staging:

   ```bash
   npm run deploy:staging
   ```

4. Copia la URL `workers.dev` que muestre el despliegue. Si la cuenta pide elegir un subdominio `workers.dev`, elige uno estable y anótalo. Con la URL completa, crea un administrador por cada sucursal desde una terminal confiable:

   ```bash
   curl --fail-with-body -X POST "<URL-COMPLETA-DE-STAGING>/api/setup/admin" \
     -H "Content-Type: application/json" \
     -H "X-Bootstrap-Token: <BOOTSTRAP_TOKEN>" \
     --data '{"branchId":1,"name":"Administración Centro","username":"admin.centro","password":"cambiar-por-una-clave-larga"}'
   ```

   Repite la operación con el ID de cada sucursal y credenciales distintas. La contraseña debe tener entre 10 y 200 caracteres. No uses la contraseña del ejemplo.

5. Inicia sesión desde la interfaz para comprobar cada administrador. Desde Configuración podrás crear cajeros y encargados para la misma sucursal.
6. Una vez creados los administradores necesarios, elimina `BOOTSTRAP_TOKEN` desde **Workers & Pages → Worker → Settings → Variables and Secrets**. Mientras no exista, el endpoint devolverá error y no podrá crear administradores adicionales.

Si se abre una sucursal después de retirar el secreto, habrá que reintroducir temporalmente un `BOOTSTRAP_TOKEN`, crear su administrador inicial y eliminarlo otra vez. Esto es una limitación conocida del modelo actual de administración por sucursal.

## 8. Validación de staging

Antes de producción, realiza esta lista con cuentas reales de prueba:

- Login correcto y rechazo de contraseña o sucursal incorrectas.
- Un cajero no ve Inventario, Cierres ni Configuración y sólo consulta sus ventas.
- Un encargado puede administrar productos y turnos, pero no usuarios ni sucursales.
- Una venta descuenta stock, guarda nombre/precio histórico y aparece en el historial.
- No se puede cobrar sin turno abierto ni abrir dos turnos en la misma sucursal.
- Un producto desactivado no aparece para cobrar y conserva su historial.
- Un producto de Centro no aparece ni se puede vender desde Norte.
- Exportación CSV de inventario y de ventas del turno.
- Cierre de turno con usuario y fecha correctos.

Revisa errores en **Workers & Pages → Worker → Observability/Logs**. El proyecto habilita observabilidad en `wrangler.toml`.

## 9. Pasar a producción

Sólo después de completar la lista de staging:

1. Confirma que `wrangler.toml` tiene el ID de producción correcto.
2. Aplica la migración de producción si no se hizo en la sección 6:

   ```bash
   npm run db:migrate:production
   ```

3. Define un token de inicialización nuevo, distinto al de staging:

   ```bash
   npx wrangler secret put BOOTSTRAP_TOKEN
   ```

4. Despliega:

   ```bash
   npm run deploy
   ```

5. Crea el administrador de cada sucursal con la URL de producción, verifica login y elimina el secreto como en la sección 7.
6. Conserva la URL `workers.dev` como acceso inicial; no hace falta comprar o migrar un dominio para que el sistema funcione.

## 10. Dominio propio opcional

Cuando ya exista un dominio activo en Cloudflare, añade un subdominio como `comedor.tudominio.mx` desde **Workers & Pages → seleccionar Worker → Settings → Domains & Routes → Add → Custom Domain**. Un Custom Domain es la opción apropiada porque este Worker es el origen completo de la aplicación: Cloudflare crea el DNS y certificado necesarios.

No uses una Route para este caso salvo que el hostname ya tenga un servidor de origen que deba mantenerse.

## 11. Operación diaria y cambios futuros

- Las personas usan la interfaz; no deben ejecutar SQL directamente sobre producción.
- Exporta periódicamente los CSV de ventas y guárdalos fuera del equipo de caja.
- Antes de una migración nueva: prueba local, aplica a staging, valida y luego aplica a producción.
- D1 ofrece Time Travel para recuperación a un punto en el tiempo; verifica su disponibilidad en la cuenta antes de depender de él como procedimiento de recuperación.
- Revisa Logs tras cada despliegue y nunca incluyas contraseñas, tokens ni información sensible en `console.log`.
- Si se detecta un incidente, revoca sesiones desactivando al usuario afectado o cambiando su contraseña desde Configuración; después revisa el historial y los logs.

## 12. Problemas comunes

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `database_id` inválido o Worker sin `env.DB` | IDs de staging/producción invertidos o placeholders sin sustituir. | Revisa exactamente los dos bloques D1 de `wrangler.toml`. |
| Login devuelve error interno tras desplegar | No se aplicó la migración remota. | Ejecuta la migración del entorno correcto y revisa Logs. |
| No hay sucursales en el selector de login | Migración no aplicada o sucursales desactivadas. | Consulta `sucursal` con `wrangler d1 execute`. |
| No se puede crear el primer administrador | Falta `BOOTSTRAP_TOKEN`, es distinto al header o ya fue eliminado. | Configura temporalmente el secreto y verifica la URL/entorno. |
| El cajero ve información equivocada | Se inició sesión con otra sucursal o hay un error de configuración. | Cerrar sesión, confirmar sucursal y revisar `GET /api/me`/Logs. |
| El despliegue cambia datos de prueba | Se usó una base equivocada. | Detén el proceso; no ejecutes comandos `--remote` hasta revisar el nombre de la base. |

## Referencias oficiales

- [D1: creación de bases, bindings y comandos Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Migraciones de D1](https://developers.cloudflare.com/d1/reference/migrations/)
- [Assets estáticos de Workers](https://developers.cloudflare.com/workers/static-assets/)
- [Secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Custom Domains de Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Time Travel y recuperación de D1](https://developers.cloudflare.com/d1/reference/time-travel/)
