# Spec Delta

## Purpose

Limitar stock y listas de precios de las pantallas actuales a los PDV asociados,
tanto en consultas generales como en acceso directo y escritura.

## ADDED Requirements

### Requirement: Consulta de stock por PDV autorizado

El sistema SHALL limitar todas las variantes de listado y detalle de stock al alcance por PDV del usuario. La restricción incluye cantidades, costos, precios, márgenes, descuentos, mínimos y estados; los filtros operativos y de búsqueda no reemplazan esa autorización.

#### Scenario: Listados paginados y no paginados
- **WHEN** un usuario de A consulta stock con página/total, límite/offset o sin paginación
- **THEN** solo recibe filas de A y la paginación se calcula sobre esas filas

#### Scenario: Detalle de stock de B
- **WHEN** un usuario de A consulta directamente el ID de un stock de B
- **THEN** recibe 404 RECURSO_NO_DISPONIBLE sin cantidades ni datos comerciales de B

### Requirement: Filtros y totales de stock autorizados

El sistema SHALL calcular valores únicos, totales y resultados de búsqueda sobre el mismo alcance autorizado que el catálogo. Un filtro solicitado por nombre o ID MUST NOT revelar ni incorporar stocks de un PDV ajeno.

#### Scenario: Valores únicos de sucursal
- **WHEN** un usuario de A abre los filtros de stock y solo B tiene productos de cierta marca
- **THEN** ni B ni esa marca aparecen por sus registros de B y el total no los cuenta

#### Scenario: Filtro explícito por B
- **WHEN** una consulta de stock incluye el ID de B sin asociación válida
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE y no ejecuta una consulta sin restricción

### Requirement: Altas y cambios de stock en PDV propios

El sistema SHALL autorizar alta, edición, habilitación, ajustes de cantidades y baja de stock según el PDV real del registro. Para altas exige un PDV propio activo. Cambiar o agregar IDs en el body MUST NOT trasladar ni ampliar el alcance de un stock existente.

#### Scenario: Alta propia y alta ajena
- **WHEN** un usuario de A solicita altas equivalentes para A activo y B
- **THEN** el alta de A puede continuar y la de B se rechaza con 403 SUCURSAL_FUERA_DE_ALCANCE sin insertar filas

#### Scenario: Modificar o eliminar stock ajeno
- **WHEN** un usuario de A envía un PATCH o DELETE al stock de B, incluso con sucursal_id=A
- **THEN** recibe 404 RECURSO_NO_DISPONIBLE y no se modifican cantidades, precios, costos, habilitación ni deleted_at

#### Scenario: Reglas de negocio conservadas
- **WHEN** el stock pertenece a A pero tiene cantidades disponibles o reservadas distintas de cero
- **THEN** la eliminación continúa rechazada por la regla existente
- **AND** una edición autorizada conserva las validaciones actuales de cantidades, descuentos, precio y margen

### Requirement: Lista general de precios limitada al PDV

El sistema SHALL autorizar el PDV antes de devolver una lista general de precios. Datos, descuentos, costos, márgenes y contexto monetario SHALL corresponder solo al PDV solicitado y autorizado, sin cambiar las fórmulas ni el contrato monetario vigente.

#### Scenario: Lista general de A
- **WHEN** un usuario asociado a A solicita su lista general
- **THEN** recibe únicamente los productos y condiciones de A que cumplen los filtros operativos existentes

#### Scenario: Lista general de B mediante llamada directa
- **WHEN** el mismo usuario solicita la lista general de B
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE sin lista ni contexto monetario de B

### Requirement: Lista de cliente exige cliente y PDV compatibles

El sistema SHALL devolver la lista de precios de un cliente únicamente si el cliente es accesible, el PDV pertenece al usuario y existe asociación cliente–PDV para ese par. Compartir otro PDV con el cliente MUST NOT habilitar una lista para un PDV ajeno.

#### Scenario: Cliente compartido con B
- **WHEN** el cliente C pertenece a A y B y un usuario de A solicita la lista de C para A
- **THEN** obtiene la lista de A; solicitarla para B devuelve 403 SUCURSAL_FUERA_DE_ALCANCE

#### Scenario: Cliente sin vínculo con el PDV elegido
- **WHEN** un usuario de A y D solicita en D la lista de un cliente asociado únicamente a A
- **THEN** recibe 404 RECURSO_NO_DISPONIBLE y no se calcula una lista para un par sin asociación

### Requirement: Cotización efectiva de un PDV autorizado

El sistema SHALL exigir alcance sobre el PDV para consultar su cotización efectiva. Consultar la cotización general sigue permitido como contexto compartido; sus sugerencias de sucursales SHALL incluir únicamente PDV propios autorizados.

#### Scenario: Cotización propia de B
- **WHEN** un usuario de A consulta la cotización con sucursal_id=B
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE sin la tasa ni los metadatos propios de B

#### Scenario: Referencia general de productos
- **WHEN** un usuario de A consulta el contexto monetario general para editar el catálogo compartido
- **THEN** recibe la referencia general y sugerencias solo de sus PDV activos
- **AND** el permiso global de actualización conserva su significado anterior
