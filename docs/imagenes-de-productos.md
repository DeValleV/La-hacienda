# Imágenes de productos

Las imágenes son opcionales. Un producto sin imagen conserva la tarjeta de color actual en el punto de venta.

## Configuración inicial

Antes del primer despliegue, cree los buckets que están declarados en `wrangler.toml`:

```bash
pnpm exec wrangler r2 bucket create la-hacienda-product-images
pnpm exec wrangler r2 bucket create la-hacienda-staging-product-images
```

Después aplique las migraciones y despliegue normalmente. Los archivos no son públicos: el Worker comprueba la sesión y la sucursal antes de entregarlos.

## Uso

En **Inventario → Nuevo producto** o **Editar**, seleccione una foto o arrástrela al área de imagen. Se aceptan JPG, PNG y WebP de hasta 5 MB. Al guardar, una nueva foto reemplaza la anterior.
