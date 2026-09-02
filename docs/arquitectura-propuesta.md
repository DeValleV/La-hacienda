# Propuesta de arquitectura

## Contexto

La Hacienda es un punto de venta para un negocio pequeño. Se espera un máximo de cinco usuarios concurrentes y un catálogo aproximado de veinte productos. La aplicación debe estar disponible por internet, fuera de la red local, y controlar el acceso a pantallas y operaciones según el usuario.

## Propuesta inicial

Se propone una arquitectura *serverless* en Cloudflare:

```text
Usuarios (navegador)
        |
      HTTPS
        v
Cloudflare Pages (frontend estático)
        |
        v
Cloudflare Worker (API, autenticación y autorización)
        |
        +-- Cloudflare D1 (usuarios, productos, ventas e inventario)
        +-- Cloudflare R2 (respaldos o exportaciones, opcional)
```

Esta alternativa evita operar un servidor propio, ofrece HTTPS y disponibilidad pública, y mantiene los costos bajos para el volumen previsto.

## Aplicación actual

El frontend actual puede conservarse inicialmente. La información de productos y ventas está hoy en memoria del navegador, por lo que el siguiente cambio funcional será consumir una API y persistir los datos en la base de datos.

## Usuarios y permisos

Roles sugeridos:

| Rol | Acceso |
| --- | --- |
| Cajero | Punto de venta, consulta de productos y sus propias ventas. |
| Encargado | Lo anterior, inventario, historial y corte de turno. |
| Administrador | Usuarios, precios, ajustes, reportes y auditoría. |

Los permisos deben comprobarse en la API para cada operación; ocultar una pantalla en el frontend no constituye control de acceso.

La autenticación deberá usar contraseñas con hash fuerte y sesiones seguras mediante cookies `HttpOnly`.

## Datos principales

- `users`: usuario, nombre, hash de contraseña, rol y estado.
- `products`: SKU, nombre, precio, existencia y estado.
- `sales` y `sale_items`: venta, cajero, fecha, forma de pago, total y partidas.
- `inventory_movements`: entradas, ajustes, mermas y movimientos derivados de ventas.
- `audit_log`: cambios relevantes y el usuario que los realizó.

## Respaldo y continuidad

- Habilitar exportación de ventas a CSV.
- Definir un respaldo periódico de la base de datos antes de poner el sistema en producción.
- La primera versión dependerá de conexión a internet. Si las interrupciones de internet son frecuentes, se evaluará una PWA con una cola local de ventas y sincronización posterior.

## Decisiones pendientes

1. Confirmar Cloudflare como plataforma de hosting y datos, o comparar con una alternativa administrada.
2. Definir los métodos de pago y reglas de corte de caja.
3. Precisar si habrá impresión de tickets, facturación o lectores de código de barras.
4. Definir la política de respaldos y quién podrá restaurarlos.
