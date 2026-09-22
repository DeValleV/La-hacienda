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

Sustituye los dos marcadores `REPLACE_WITH_...DATABASE_ID` de `wrangler.toml` con los IDs que devuelva Cloudflare. Staging usa `la-hacienda-staging`; producción usa `la-hacienda`.

## Staging

```bash
pnpm run db:migrate:staging
pnpm exec wrangler secret put BOOTSTRAP_TOKEN --env staging
pnpm run deploy:staging
```

Comprueba la línea base:

```bash
pnpm exec wrangler d1 execute la-hacienda-staging --remote --command "SELECT id,nombre,codigo FROM sucursal; SELECT nombre FROM categoria ORDER BY id; SELECT COUNT(*) AS productos FROM producto;"
```

Crea el administrador inicial con la URL que imprima el despliegue:

```bash
curl --fail-with-body -X POST "<URL-STAGING>/api/setup/admin" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: <TOKEN-STAGING>" \
  --data '{"branchId":1,"name":"Administración Ikano","username":"admin","password":"<CONTRASEÑA-LARGA>"}'
```

Valida login, alta de producto, venta, reembolso, cierre de turno y ambos reportes Excel. Elimina el secreto de staging cuando termines la inicialización.

## Producción

Cuando staging esté validado:

```bash
pnpm run db:migrate:production
pnpm exec wrangler secret put BOOTSTRAP_TOKEN
pnpm run deploy
```

Repite la creación del administrador usando la URL y token de producción. Verifica el inicio de sesión y elimina `BOOTSTRAP_TOKEN` desde Workers & Pages → Settings → Variables and Secrets.

## Después

- Guarda de forma segura las credenciales iniciales.
- Revisa Observability/Logs tras el despliegue.
- Exporta periódicamente inventario e historial de ventas.
- Para cambios futuros, crea una migración nueva; no edites migraciones aplicadas remotamente.
