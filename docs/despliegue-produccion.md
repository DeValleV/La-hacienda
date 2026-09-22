# Runbook de despliegue a producción

Este procedimiento publica una instalación nueva de **Ikano**. La migración inicial `0001_initial.sql` crea el esquema final y deja sólo la sucursal Ikano y sus cuatro categorías, sin usuarios, productos ni datos operativos.

## Antes de empezar

```bash
git status
pnpm install
pnpm test
pnpm exec wrangler login
```

## Crear y configurar D1

```bash
pnpm exec wrangler d1 create la-hacienda-staging
pnpm exec wrangler d1 create la-hacienda
```

Sustituye los valores de `database_id` en `wrangler.toml` con los UUID que devuelva Cloudflare. Staging usa `la-hacienda-staging`; producción usa `la-hacienda`. No continúes hasta que ambos bindings `DB` apunten a sus D1 correspondientes.

## Staging

```bash
pnpm run db:migrate:staging
pnpm exec wrangler secret put BOOTSTRAP_TOKEN --env staging
pnpm run deploy:staging
```

Comprueba la línea base:

```bash
pnpm exec wrangler d1 execute la-hacienda-staging --remote --env staging --command "SELECT id,nombre,codigo FROM sucursal; SELECT nombre FROM categoria ORDER BY id; SELECT COUNT(*) AS productos FROM producto;"
```

Crea el administrador inicial con la URL que imprima el despliegue. No uses literalmente `<URL-STAGING>`: sustitúyelo por la URL completa, por ejemplo `https://la-hacienda-staging.<cuenta>.workers.dev`.

```bash
curl --fail-with-body -X POST "<URL-STAGING>/api/setup/admin" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: <TOKEN-STAGING>" \
  --data '{"branchId":1,"name":"Administración Ikano","username":"admin","password":"<CONTRASEÑA-LARGA>"}'
```

Valida login, alta de producto, venta, reembolso, cierre de turno y ambos reportes Excel. Cuando termine la inicialización, elimina el secreto de staging (y rota el token si se expuso):

```bash
pnpm exec wrangler secret delete BOOTSTRAP_TOKEN --env staging
```

## Producción

Cuando staging esté validado:

```bash
pnpm run db:migrate:production
pnpm exec wrangler secret put BOOTSTRAP_TOKEN
pnpm run deploy
```

El comando `pnpm run deploy` imprime la URL de producción. Crea el administrador inicial usando esa URL y el token que introdujiste en el paso anterior:

```bash
curl --fail-with-body -X POST "<URL-PRODUCCION>/api/setup/admin" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: <TOKEN-PRODUCCION>" \
  --data '{"branchId":1,"name":"Administración Ikano","username":"admin","password":"<CONTRASEÑA-LARGA-Y-SEGURA>"}'
```

Verifica el inicio de sesión con ese usuario y elimina el secreto de bootstrap para que no puedan crearse más administradores sin autorización:

```bash
pnpm exec wrangler secret delete BOOTSTRAP_TOKEN
```

## Después

- Guarda de forma segura las credenciales iniciales.
- Revisa Observability/Logs tras el despliegue.
- Exporta periódicamente inventario e historial de ventas.
- Para cambios futuros, crea una migración nueva; no edites migraciones aplicadas remotamente.
