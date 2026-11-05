# Acceso por punto de venta

## Resolución del alcance

Las rutas protegidas resuelven el usuario a partir de `req.user.id` (`auth_id`) y consultan `public.usuario`, `public.usuario_sucursal` y `public.sucursal`. Solo cuentan usuarios activos y asignaciones activas del mismo tenant. Un rol administrativo no amplía por sí solo el acceso a datos de otro PDV.

El alcance conserva dos conjuntos: PDV asignados, incluidos los inactivos propios para consultar y conservar relaciones, y PDV propios activos, válidos para altas y nuevas asignaciones. Los IDs recibidos en filtros o cuerpos nunca definen el alcance.

## Contratos protegidos

- Stock filtra listados, detalles, valores únicos, conteos, altas, cambios y bajas por el PDV real de `producto_sucursal`. Un filtro explícito `sucursalId` se valida antes de consultar. La lista completa de precios también acepta ese filtro en SQL.
- Clientes aparecen cuando tienen al menos una asociación con el usuario. Los filtros, el total y la paginación usan esa intersección; el DTO solo proyecta los PDV propios.
- `PATCH /api/clientes/:id` reemplaza únicamente las asociaciones propias cuando incluye `sucursal_ids`. Las demás se conservan. Puede enviar `[]` si queda una asociación global; la respuesta será `{ "status": "success", "data": null, "acceso_revocado": true }` cuando el usuario pierda acceso.
- Los campos comerciales comunes y los descuentos de un cliente accesible continúan siendo compartidos. Retirar un PDV propio también elimina la región de ese vínculo, no las regiones de otros PDV.
- Regiones se devuelven solo si incluyen algún PDV propio y con `sucursales` proyectadas a esos PDV. `puede_modificar=false` y `motivo_bloqueo=REGION_COMPARTIDA_FUERA_DE_ALCANCE` indican una región visible que también pertenece a PDV ajenos. Crear exige PDV propios activos; administrar exige control de todas las asociaciones actuales y propuestas.
- `/api/descuentos/lista-sucursal` y `/api/descuentos/lista-cliente` validan el PDV activo. La lista de cliente también valida el vínculo cliente–PDV. El frontend debe pedir una respuesta nueva antes de exportar.
- `/api/sucursales/admin` devuelve datos completos solo de los PDV asignados; `todas=true` también incluye los inactivos propios. `/api/sucursales/referencias-globales` expone solo `id`, `nombre`, `activo` y `es_central` para las excepciones globales de categorías y casa central.
- Crear un PDV conserva el permiso `usuarios.administrar` y la autoasignación del creador. Editar, reactivar, desactivar, leer usuarios o consultar uso requiere estar asignado; administrar asignaciones requiere además el permiso vigente.
- La cotización general conserva `cotizacion.actualizar`. Las sugerencias de PDV incluyen solo PDV propios activos. La cotización propia exige asociación con el PDV.

## Errores de alcance

- PDV explícito no autorizado: HTTP 403, `code: SUCURSAL_FUERA_DE_ALCANCE`, también si el ID no existe o pertenece a otro tenant.
- Stock, cliente o región completamente fuera de alcance por ID: HTTP 404, `code: RECURSO_NO_DISPONIBLE`.
- Región visible pero compartida al intentar administrarla: HTTP 403, `code: REGION_COMPARTIDA_FUERA_DE_ALCANCE`.
- Usuario sin `usuarios.administrar`: `{ puede_administrar: false, usuarios: [], roles: [] }`; los usuarios existentes de un PDV propio siguen siendo consultables.

La implementación no requiere una migración: usa las asociaciones ya existentes. Las rutas de Operaciones, Reposición, Cuentas y los cálculos `/evaluar` y `/calcular` conservan sus contratos actuales.
