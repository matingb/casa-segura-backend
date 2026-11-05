# Tasks

Todas las casillas representan implementación pendiente. La configuración de
OpenSpec y la redacción de estos artefactos no completan tareas de producto.

## 1. Alcance autenticado y contratos comunes

- [ ] 1.1 Agregar el resolvedor mínimo de alcance para los controladores alcanzados, diferenciando asignaciones vigentes y PDV activos; verificar con tests usuario A, A+D, sin PDV, usuario inactivo, asignación revocada y administrador solo A.
- [ ] 1.2 Incorporar respuestas 403 SUCURSAL_FUERA_DE_ALCANCE y 404 RECURSO_NO_DISPONIBLE en los controladores alcanzados; verificar sesión inválida, IDs ajenos/inexistentes, manipulación de identidad y ausencia de datos sensibles en errores.
- [ ] 1.3 Documentar junto al código el contrato compartido de errores y alcance; verificar que coincide con este diseño y el change frontend sin cambiar rutas de módulos excluidos.

## 2. Stock y listas de precios

- [ ] 2.1 Aplicar alcance SQL a las variantes findAll, limit/offset y page/total de producto-sucursal y a sus valores únicos; verificar tests de filtros omitidos/ajenos, totales y paginación sin filas de B.
- [ ] 2.2 Autorizar alta por PDV propio activo y acceso/edición/baja por el PDV real del stock; verificar PATCH con sucursal_id manipulado, DELETE ajeno y ausencia de efectos ante rechazo.
- [ ] 2.3 Conservar reglas de cantidad, margen, monedas y baja con cantidades cero; verificar los tests existentes y regresiones positivas de stock autorizado en A.
- [ ] 2.4 Autorizar lista-sucursal y lista-cliente, incluyendo asociación cliente–PDV; verificar A permitido, B rechazado, cliente ajeno y par propio sin vínculo, sin modificar evaluar/calcular de ventas ocultas.
- [ ] 2.5 Documentar las consultas autorizadas de lista que revalidan acceso antes de exportar; verificar que sus errores y contextos coinciden con los clients acordados.

## 3. Clientes, descuentos y conservación de relaciones

- [ ] 3.1 Limitar listados, búsquedas, filtros, totales y detalles de clientes por intersección con PDV propios; verificar CA/CB/CAB, cliente compartido contado una vez y DTO sin vínculos ajenos.
- [ ] 3.2 Validar todas las asociaciones del alta y permitir editar datos comunes/estado del cliente compartido; verificar alta mixta A+B rechazada sin filas y edición de CAB desde A admitida.
- [ ] 3.3 Sustituir el reemplazo global de sucursal_ids por escritura parcial bajo lock del cliente y autorización transaccional; verificar que guardar [A] conserva B, omitir el campo conserva todo y un ID ajeno revierte también datos comunes.
- [ ] 3.4 Preservar regiones ajenas y retirar solamente la región del vínculo propio eliminado; verificar [A] a [D], cliente sin vínculos rechazado y conservación exacta de la región de B.
- [ ] 3.5 Implementar respuesta de PATCH con data=null y acceso_revocado=true cuando se retira el último vínculo propio y queda B; verificar HTTP 200 sin datos de B y GET posterior con 404.
- [ ] 3.6 Autorizar lectura y cambios de descuentos habituales/especiales por acceso al cliente; verificar CAB editable y CB inaccesible para categoría, subcategoría, producto y eliminación por ID.
- [ ] 3.7 Autorizar regiones de cliente por cliente accesible, PDV propio y vínculo cliente–PDV; verificar asignación de región mixta en A y rechazo de asignación/eliminación en B sin efectos.
- [ ] 3.8 Documentar el reemplazo parcial y la respuesta de pérdida de acceso en la API de clientes; verificar sus ejemplos contra los tests de [A], campo omitido y [] conservando B.

## 4. Configuración de PDV y excepciones

- [ ] 4.1 Agregar GET /api/sucursales/referencias-globales con allowlist de cuatro campos y orden de rutas correcto; verificar todos los PDV del tenant, ningún campo comercial/usuario adicional y aislamiento entre tenants.
- [ ] 4.2 Limitar el listado administrativo, resumen de uso y usuarios a PDV propios; verificar lectura de inactivos propios y rechazo de usuarios/conteos de B.
- [ ] 4.3 Restringir opciones de asignación al permiso usuarios.administrar con arrays vacíos cuando falte; verificar que alta de PDV y autoasignación, edición de propios y prohibiciones de autoquitarse/cambiarse rol conservan las reglas existentes.
- [ ] 4.4 Autorizar cotización efectiva por PDV y filtrar sugerencias a propios activos; verificar que la cotización general y su actualización por cotizacion.actualizar siguen funcionando desde A aunque B herede la tasa.
- [ ] 4.5 Agregar regresiones de excepciones globales de productos, categorías/subcategorías y casa central; verificar descuento de categoría para B permitido, modificación de producto compartido permitida y A central quitando solo esa marca a B.
- [ ] 4.6 Documentar referencias globales y alcance administrativo junto a sucursalClient/contrato backend; verificar que ningún consumidor visible necesita el DTO completo de B para una excepción.

## 5. Regiones con consulta parcial y administración completa

- [ ] 5.1 Filtrar regiones por intersección y proyectar sucursales agregando puede_modificar y motivo_bloqueo; verificar RA editable, RAB proyectada a A y RB ausente para usuario de A.
- [ ] 5.2 Autorizar creación por PDV propios activos y administración sobre la unión de PDV actuales y propuestos; verificar rechazo sin efectos de editar, desactivar, eliminar o quitar B de RAB.
- [ ] 5.3 Mantener restricciones de uso de clientes y FK region_sucursal; verificar cambios válidos de regiones propias, rechazo de quitar PDV usado y asignación de región mixta a un cliente de A.
- [ ] 5.4 Documentar campos de capacidad y código REGION_COMPARTIDA_FUERA_DE_ALCANCE; verificar que coinciden con los tipos y estados del frontend.

## 6. Integración entre repositorios

- [ ] 6.1 Preparar fixtures aislados de PostgreSQL para tenant T A/B/D y otro tenant sin modificar datos personales ni remotos; verificar conectividad y registrar explícitamente cualquier bloqueo del entorno.
- [ ] 6.2 Ejecutar integración real de consultas, escritura parcial concurrente, proyecciones y ausencia de efectos ante rechazo; verificar dos editores A/B sin pérdida de relaciones y cada variante de listado con SQL real.
- [ ] 6.3 Ejecutar npm.cmd test y npm.cmd run build; verificar resultados y distinguir fallos previos/de entorno sin declararlos aprobados.
- [ ] 6.4 Validar con el frontend coordinado stock, cliente compartido, regiones mixtas, exportación tras revocación y las cuatro excepciones; verificar la matriz de aceptación en navegador/API/BD y registrar evidencia.
- [ ] 6.5 Revisar el diff para excluir cambios funcionales de Operaciones, Cuentas financieras, Reposición y evaluar/calcular; ejecutar openspec.cmd validate limitar-acceso-por-pdv --strict --no-interactive y verificar que cada tarea completada tiene evidencia.

## Workflow follow-up

- Revisar y aplicar este change junto con el del frontend cuando el usuario solicite implementar.
- Archivar y sincronizar las specs principales solo después de completar las tareas y validar la entrega coordinada.
