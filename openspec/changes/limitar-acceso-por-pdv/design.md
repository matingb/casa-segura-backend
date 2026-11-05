# Design

## Context

La motivación y el alcance están en [proposal.md](proposal.md). Esta revisión se
basa en el código local de `dev`; no confirma el estado de una base desplegada.

Evidencia que condiciona el diseño:

- `src/middlewares/auth.middleware.ts` valida la sesión y `src/utils/tenant.ts`
  resuelve el tenant, pero no existe una autorización común por PDV en los flujos
  alcanzados. `src/config/db.ts` usa `pg.Pool`; el JWT no se configura en cada query.
- `src/repositories/producto-sucursal.repository.ts` ofrece tres variantes de
  listado, valores únicos y acceso por ID; actualmente su límite es el tenant.
- `src/repositories/cliente.repository.ts` agrega todas las sucursales del cliente
  y `reemplazarSucursales` borra y reinserta todas. Proyectar el DTO sin cambiar esa
  escritura borraría vínculos ajenos al guardar un formulario parcial.
- `src/services/cliente-descuento.service.ts` y `src/services/lista-precios.service.ts`
  aceptan clientes/PDV del tenant, sin validar su relación con el usuario.
- `src/services/sucursal.service.ts` ya exige asociación para editar y permiso
  `usuarios.administrar` para alta/asignaciones. Su listado administrativo, usuarios,
  opciones de asignación y resumen de uso permiten más lectura que escritura.
- `src/services/region.service.ts` administra regiones de varios PDV; el descuento
  pertenece a la región y no se puede modificar solo para su proyección visible.
- `src/services/cotizacion.service.ts` devuelve sugerencias de todas las sucursales.
  `CotizacionRepository.autorizacion` ya resuelve el permiso global que se conserva.
- Las migraciones de RLS se centran en tenant. Este change no promete aislamiento
  para rutas ocultas ni para acceso directo por Supabase Data API.

## Goals / Non-Goals

**Goals:** aplicar un único criterio verificable a las APIs del frontend visible;
autorizar antes de leer/escribir; preservar relaciones no visibles; evitar que las
excepciones globales se conviertan en una puerta a datos comerciales ajenos.

**Non-Goals:** un motor nuevo de permisos, un bypass administrador global, duplicar
clientes o regiones por PDV, modificar fórmulas o endurecer globalmente el pool/RLS
de manera que cambie el contrato de Operaciones, Finanzas o Pedidos de reposición.

## Decisions

### 1. Alcance pequeño resuelto en el servidor

Introducir un contexto de autorización para los controladores alcanzados con
identidad, tenant y PDV asignados. Una asignación válida exige `usuario.activo`,
`usuario_sucursal.activo`, pertenencia consistente al tenant y relación real con
`sucursal`. El nombre del rol no amplía este conjunto.

Se distinguen las asignaciones vigentes, que permiten consultar PDV propios
inactivos en flujos históricos/configuración, de los PDV propios activos usados
en altas y nuevas asociaciones. Un vínculo propio inactivo ya existente puede
conservarse; no se agrega como una nueva opción operativa.

Pasar este contexto explícitamente a servicios/repositorios protegidos; no aceptar
su equivalente desde body/query. Usar predicados SQL parametrizados (`EXISTS` o
`ANY`) antes de ordenar, contar y paginar. Para clientes usar `EXISTS` o deduplicar
antes del count; un cliente compartido no genera varias filas.

Alternativas descartadas: filtrar arrays ya consultados, confiar en filtros del
frontend, cambiar todas las rutas con un middleware global o introducir un motor
ABAC/RBAC transversal. La primera alternativa filtra tarde y las otras amplían el
alcance o la complejidad. No modificar los métodos usados por rutas excluidas sin
mantener explícitamente sus contratos.

### 2. Contrato HTTP compartido con el frontend

| Ruta o familia | Contrato objetivo de este change |
| --- | --- |
| `GET /api/sucursales` | Mantener los PDV propios activos del contexto operativo. |
| `GET /api/sucursales/admin?todas=true` | Datos completos únicamente de PDV propios; `todas` conserva la inclusión de inactivos. |
| `GET /api/sucursales/referencias-globales` (nuevo) | Lista tenant mínima: `id`, `nombre`, `activo`, `es_central`. Sin campos adicionales. |
| `/api/sucursales/:id/usuarios` y `/:id/uso` | Asociación obligatoria al PDV; catálogos de asignación solo con el permiso vigente. |
| `/api/producto-sucursal`, sus IDs y valores únicos | Listados/altas/ediciones/bajas autorizados por el PDV real. |
| `/api/clientes`, sus IDs y valores únicos | Visibilidad por intersección; DTO de sucursales proyectado. |
| `PATCH /api/clientes/:id` | `sucursal_ids` reemplaza solo vínculos dentro del alcance; admite respuesta de pérdida de acceso. |
| `/api/clientes/:id/descuentos/*` y `/:id/region/*` | Autorizar cliente; para región exigir además PDV propio y asociado al cliente. |
| `/api/descuentos/lista-sucursal` y `/lista-cliente` | Autorizar PDV y, si existe cliente, el cliente y el par cliente–PDV. |
| `/api/regiones` y `/sucursal/:sucursalId` | Proyección de PDV propios y capacidad de modificación según conjunto completo. |
| `GET /api/configuracion/cotizacion` | General compartida; con sucursal_id exige alcance; sugerencias solo de PDV propios activos. |
| `PATCH /api/configuracion/cotizacion` | Permiso global existente; sin nueva condición de asociación a todos los PDV. |

Mantener los envelopes exitosos y la paginación actuales salvo la respuesta
explícita del PATCH de cliente. Rechazos acordados:

- PDV explícito no autorizado: 403 `SUCURSAL_FUERA_DE_ALCANCE`, también para
  inexistente/de otro tenant, sin comprobarle al solicitante cuál caso es.
- Stock/cliente/región íntegramente fuera de alcance por ID: 404
  `RECURSO_NO_DISPONIBLE`, igual que un ID inexistente.
- Región visible que afecta a PDV ajenos al intentar administrarla: 403
  `REGION_COMPARTIDA_FUERA_DE_ALCANCE`.
- Usuario sin `usuarios.administrar`: opciones con `puede_administrar: false`,
  `usuarios: []` y `roles: []`; no cambiar la lista de asignaciones de un PDV propio.

Resolver los rechazos antes de ensamblar DTO sensibles. Las validaciones de formato,
sesión, negocio y versiones conservan sus comportamientos existentes.

### 3. Asociaciones de clientes con escritura parcial y atómica

Decisión confirmada por el usuario: para cliente A+B basta pertenecer a A para
editar sus datos comunes y descuentos. Estos cambios pueden afectar también a B;
no son descuentos por PDV ni se crean copias del cliente. Su estado activo/inactivo
es igualmente común. La UI lo explica sin divulgar vínculos ajenos.

Con `S` como el conjunto de PDV asignados vigente para esta escritura:

`asociaciones_finales = (asociaciones_actuales - S) unión sucursal_ids_enviados`

Si el campo no se envía, no reemplazar relaciones. Si se envía, todos los IDs deben
ser propios; nuevas asociaciones requieren PDV activos. Un array vacío expresa
retirar la porción propia y es válido solo si queda al menos una asociación global.

Bloquear el cliente y revalidar autorización/relaciones dentro de la transacción.
Actualizar únicamente los vínculos propios retirados/agregados; quitar la región
del vínculo propio retirado y preservar todas las regiones ajenas. La FK y el lock
de cliente común deben impedir pérdidas por dos editores de diferentes PDV.
No usar la proyección del DTO como fuente de la unión ni cargar todas las relaciones
en el frontend. Incluir datos comunes y descuentos que se escriban en esa transacción
cuando formen parte de la misma solicitud.

Si el cliente deja de tener intersección después de un PATCH exitoso, devolver:

```json
{ "status": "success", "data": null, "acceso_revocado": true }
```

Si sigue accesible, devolver el cliente con la proyección actual normal. No enviar
IDs, nombres o regiones ajenos para explicar por qué el cliente sigue existiendo.
No hacer una lectura tenant global después del commit para devolver el cliente.

Alternativas descartadas: reemplazo total (borra datos ajenos), exigir todos los
PDV para cualquier edición (contradice la decisión del usuario) y prohibir retirar
el último vínculo propio aunque quede B (restricción de negocio no solicitada).

### 4. Regiones compartidas y referencias globales

Una región es visible si intersecta S. Su DTO conserva campos comunes y proyecta
`sucursales`; agrega `puede_modificar` y `motivo_bloqueo`, nulo cuando es editable.
Para administrar se exige que todos los PDV actuales y propuestos pertenezcan a S.
Autorizar sobre el conjunto completo antes de su proyección y de cualquier cambio,
incluido DELETE que hoy puede convertirse en desactivación si hay clientes.

Una región A+B se puede asignar al cliente en A, pero no alterar su descuento,
nombre, estado o pertenencias desde una cuenta solo de A. No inferir editabilidad
a partir de la lista proyectada `[A]`. Mantener la FK `region_sucursal` y las
validaciones de clientes en uso.

La nueva referencia global evita depender del DTO administrativo para configurar
categorías. El endpoint debe declararse antes de `/:id` y devolver solo una allowlist
de cuatro campos. Productos y tipos/subtipos conservan sus rutas globales, incluidas
las excepciones de categoría por B. Marcar A como central conserva el update que
quita la marca de B; esa única modificación indirecta está permitida.

### 5. Exportaciones y llamadas compartidas

No se crean endpoints de exportación: las listas de cliente/general existentes
son la comprobación autorizada que el frontend debe ejecutar antes de descargar.
El backend devuelve 403/404 después de una revocación, incluso si la UI conserva
un snapshot. La política de cotización y de conservar/actualizar un snapshot válido
no cambia. No añadir alcance a `/evaluar` o `/calcular`, utilizados por ventas
ocultas y no por las listas actuales.

### 6. Verificación acotada y sin migración obligatoria

Usar fixtures de tenant T con A/B/D, usuario solo A, usuario A+D, administrador
solo A, usuario sin asignaciones, asignación revocada y usuario de otro tenant.
Clientes CA/CB/CAB y regiones RA/RB/RAB deben permitir probar SQL real, proyecciones,
ausencia de efectos y concurrencia. Probar cada variante de listado y cada excepción.

Primero tests unitarios de servicios/controladores, después integración con una BD
local de prueba aislada y finalmente navegación con el frontend coordinado. Si no
hay BD disponible, registrar el bloqueo y no declarar el aislamiento probado.
El modelo actual ya contiene las asociaciones: no requiere migración como parte
del diseño. Un índice adicional solo se justifica con el plan de consultas medido.

## Risks / Trade-offs

- Clientes compartidos permiten cambios comunes que afectan a B → decisión explícita
  del usuario; relaciones de B preservadas y alcance común explicado en pantalla.
- Categorías y cotización general siguen pudiendo impactar B → excepciones explícitas,
  con regresiones positivas para evitar endurecerlas por accidente.
- El mismo DTO administrativo se usa hoy en varias pantallas → desplegar en conjunto
  el consumidor de referencias mínimas y el cambio de alcance del endpoint existente.
- Regiones mixtas ya no son administrables por usuarios parciales → mantener su
  consulta parcial y asignación a clientes propios, con capacidad explícita del servidor.
- Consultas repetidas o counts duplicados → contexto de lectura por solicitud, SQL
  parametrizado y `EXISTS` para clientes; revalidación transaccional en escrituras.
- Rutas ocultas y Data API no quedan protegidas por esta entrega → la garantía se
  limita expresamente a las APIs alcanzadas del frontend visible; no presentar la
  entrega como una auditoría integral ni alterar políticas globales de otros módulos.

## Migration Plan

1. Implementar contexto/consultas y el endpoint de referencias; verificar las
   excepciones y el guardado parcial antes de exponer DTO proyectados.
2. Integrar el [change frontend](../../../../casa-segura-frontend/openspec/changes/limitar-acceso-por-pdv/design.md)
   en un entorno de prueba con ambos contratos actualizados. No liberar por separado
   un frontend antiguo que sobrescriba vínculos con un backend nuevo incompatible.
3. Ejecutar la matriz de aceptación con PostgreSQL y navegador, comprobar que los
   módulos excluidos no recibieron cambios funcionales y publicar ambos repos juntos.
4. Ante fallo, retirar la entrega coordinada; el rollback de código vuelve al
   comportamiento anterior de acceso y debe quedar expresamente registrado. No
   revertir asociaciones guardadas ni borrar registros; no hay migración destructiva.
