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

## 3. Requisitos compartidos

Instala Node.js LTS actual, Git y [pnpm](https://pnpm.io/installation) en el equipo que se usará. Todas las instrucciones siguientes se ejecutan desde la raíz del repositorio.

```bash
pnpm install
pnpm test
```

La primera instalación genera `pnpm-lock.yaml`; debe conservarse y versionarse junto con el código. Las dos pruebas deben terminar correctamente antes de continuar.

## 4. Flujo completo: ejecutar sólo en local

Este flujo no requiere cuenta Cloudflare ni crea recursos remotos. Sirve para desarrollar, hacer demostraciones y validar cambios de manera aislada.

```text
instalar dependencias → crear secreto local → migrar D1 local
→ arrancar Worker local → crear administrador local → usar la interfaz
```

### Paso 1: instalar y preparar el secreto local

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

Abre `.dev.vars` y cambia el valor de `BOOTSTRAP_TOKEN` por una cadena aleatoria larga. Este archivo sólo existe en la máquina local y está ignorado por Git.

### Paso 2: crear la base local y arrancar la aplicación

```bash
pnpm run db:migrate:local
pnpm run dev
```

Wrangler crea una D1 local, aplica `migrations/0001_initial.sql` y muestra una URL, normalmente `http://localhost:8787`. Mantén ese proceso abierto y usa esa URL en el navegador.

### Paso 3: crear administradores locales

La base local empieza sin usuarios. Desde otra terminal, crea un administrador para cada sucursal semilla. Sustituye los valores entre `<...>`; conserva la URL local tal como la imprimió Wrangler.

```bash
curl --fail-with-body -X POST "http://localhost:8787/api/setup/admin" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: <TOKEN-DE-.dev.vars>" \
  --data '{"branchId":1,"name":"Administración Centro","username":"admin.centro","password":"<CONTRASEÑA-LARGA>"}'
```

Repite para `branchId: 2` si quieres probar Sucursal Norte. Inicia sesión desde la interfaz y crea los demás usuarios, productos o turnos de prueba.

### Paso 4: validar y reiniciar si hace falta

- Ejecuta `pnpm test` para validar migración y contrato de la interfaz.
- Usa `Ctrl+C` en la terminal de `pnpm run dev` para detener el Worker.
- La D1 local vive bajo `.wrangler/`. Se puede borrar para reiniciar todos los datos locales, pero nunca se debe aplicar esa acción a una D1 remota.

El flujo local termina aquí: no hay dominio, cuenta Cloudflare, Worker publicado ni datos compartidos con otra persona.

## 5. Flujo completo: publicar en Cloudflare

Este flujo crea y modifica recursos remotos. Debe hacerlo sólo quien sea dueño de la cuenta Cloudflare del proyecto. Parte de un repositorio que ya pasó el flujo local.

```text
crear cuenta y autenticar Wrangler → crear D1 de staging y producción
→ configurar IDs → migrar staging → secreto → desplegar staging
→ crear administradores y validar → migrar y desplegar producción
```

### Paso 1: preparar la cuenta y la terminal

1. Crear una cuenta Cloudflare y activar MFA/2FA para quienes administrarán producción.
2. Verificar que el repositorio no contenga `.dev.vars`, `.env`, contraseñas, tokens ni IDs D1 reales.
3. Instalar dependencias, ejecutar pruebas e iniciar sesión con Cloudflare:

   ```bash
   pnpm install
   pnpm test
   pnpm exec wrangler login
   ```

   El último comando abre el navegador para autorizar la terminal.

### Paso 2: crear las dos bases D1

Se usan dos entornos separados. Nunca apuntes staging a la base de producción.

| Entorno | Worker | D1 | Objetivo |
| --- | --- | --- | --- |
| Staging | `la-hacienda-staging` | `la-hacienda-staging` | Pruebas antes de publicar. |
| Producción | `la-hacienda` | `la-hacienda` | Operación real. |

```bash
pnpm exec wrangler d1 create la-hacienda-staging
pnpm exec wrangler d1 create la-hacienda
```

Cada comando imprime `database_name` y `database_id`. Si ofrece modificar el archivo automáticamente, elige **No**: el proyecto ya define ambos entornos.

Edita [wrangler.toml](../wrangler.toml):

| Placeholder actual | Sustituir por |
| --- | --- |
| `REPLACE_WITH_PRODUCTION_DATABASE_ID` | ID mostrado al crear `la-hacienda`. |
| `REPLACE_WITH_STAGING_DATABASE_ID` | ID mostrado al crear `la-hacienda-staging`. |

No cambies el binding `DB`: el código lo usa como `env.DB`.

### Paso 3: migrar y desplegar staging

Aplica la migración sólo a staging:

```bash
pnpm run db:migrate:staging
pnpm exec wrangler d1 execute la-hacienda-staging --remote --command "SELECT id, nombre, codigo, activa FROM sucursal;"
```

La consulta debe mostrar las dos sucursales semilla. Anota sus IDs; en una base limpia serán normalmente `1` y `2`, pero usa siempre el resultado real.

Genera un `BOOTSTRAP_TOKEN` aleatorio y guárdalo temporalmente como secreto de staging:

```bash
pnpm exec wrangler secret put BOOTSTRAP_TOKEN --env staging
pnpm run deploy:staging
```

`secret put` publica una versión del Worker, por lo que la migración debe ir antes. El despliegue posterior confirma que assets, código y binding D1 son los correctos.

### Paso 4: crear administradores y validar staging

Copia la URL `workers.dev` que imprima el despliegue. Si Cloudflare pide elegir un subdominio `workers.dev`, usa uno estable. Por cada sucursal, ejecuta desde una terminal confiable:

```bash
curl --fail-with-body -X POST "<URL-COMPLETA-DE-STAGING>/api/setup/admin" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: <BOOTSTRAP_TOKEN-DE-STAGING>" \
  --data '{"branchId":1,"name":"Administración Centro","username":"admin.centro","password":"<CONTRASEÑA-LARGA>"}'
```

Repite con el ID de cada sucursal y credenciales distintas. Después inicia sesión y completa la validación de staging.

## 6. Checklist de validación de staging

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

## 7. Completar el flujo remoto: producción

Sólo después de completar staging:

1. Confirma una última vez que el ID de producción en `wrangler.toml` pertenece a `la-hacienda`, no a staging.
2. Aplica la migración a producción:

   ```bash
   pnpm run db:migrate:production
   ```

3. Define un `BOOTSTRAP_TOKEN` nuevo, distinto al de staging, y publica producción:

   ```bash
   pnpm exec wrangler secret put BOOTSTRAP_TOKEN
   pnpm run deploy
   ```

4. Crea un administrador inicial para cada sucursal con la URL de producción, exactamente como en el paso 4 del flujo remoto pero usando credenciales y token de producción.
5. Verifica login en producción y elimina `BOOTSTRAP_TOKEN` desde **Workers & Pages → Worker → Settings → Variables and Secrets**. Mientras no exista, el endpoint de inicialización no puede crear administradores.
6. Conserva la URL `workers.dev` como acceso inicial; no hace falta comprar o migrar un dominio para que el sistema funcione.

Si se abre una sucursal después de retirar el secreto, habrá que reintroducir temporalmente un `BOOTSTRAP_TOKEN`, crear su administrador inicial y eliminarlo otra vez. Esto es una limitación conocida del modelo actual de administración por sucursal.

No edites una migración que ya haya llegado a un entorno remoto. Para cambios futuros se crea otra migración numerada, se prueba localmente, se aplica a staging, se valida y sólo después llega a producción.

## 8. Dominio propio opcional

Cuando ya exista un dominio activo en Cloudflare, añade un subdominio como `comedor.tudominio.mx` desde **Workers & Pages → seleccionar Worker → Settings → Domains & Routes → Add → Custom Domain**. Un Custom Domain es la opción apropiada porque este Worker es el origen completo de la aplicación: Cloudflare crea el DNS y certificado necesarios.

No uses una Route para este caso salvo que el hostname ya tenga un servidor de origen que deba mantenerse.

## 9. Operación diaria y cambios futuros

- Las personas usan la interfaz; no deben ejecutar SQL directamente sobre producción.
- Exporta periódicamente los CSV de ventas y guárdalos fuera del equipo de caja.
- Antes de una migración nueva: prueba local, aplica a staging, valida y luego aplica a producción.
- D1 ofrece Time Travel para recuperación a un punto en el tiempo; verifica su disponibilidad en la cuenta antes de depender de él como procedimiento de recuperación.
- Revisa Logs tras cada despliegue y nunca incluyas contraseñas, tokens ni información sensible en `console.log`.
- Si se detecta un incidente, revoca sesiones desactivando al usuario afectado o cambiando su contraseña desde Configuración; después revisa el historial y los logs.

## 10. Problemas comunes

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
