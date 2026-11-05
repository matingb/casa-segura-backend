# Spec Delta

## Purpose

Permitir trabajar con clientes de los PDV propios y con clientes compartidos,
preservando las relaciones ajenas y evitando consultas de clientes fuera de alcance.

## ADDED Requirements

### Requirement: Visibilidad por al menos un PDV en común

El sistema SHALL permitir consultar y editar un cliente del tenant si existe al menos una asociación cliente–PDV que coincida con una asignación vigente del usuario. Los clientes sin esa coincidencia MUST NOT aparecer en listados, búsqueda, filtros, totales ni detalles por ID.

#### Scenario: Clientes de A, B y compartidos
- **WHEN** un usuario de A consulta clientes y existen CA de A, CB de B y CAB de A+B
- **THEN** recibe CA y CAB una sola vez cada uno, excluye CB y calcula el total sobre dos clientes

#### Scenario: Cliente ajeno por ID o filtro
- **WHEN** un usuario de A intenta leer, editar, desactivar o reactivar directamente CB de B
- **THEN** recibe 404 RECURSO_NO_DISPONIBLE sin datos ni cambios sobre CB

### Requirement: Proyección de asociaciones y regiones del cliente

El sistema SHALL incluir en la respuesta de un cliente solo sus PDV y regiones accesibles para el usuario. Las relaciones ajenas permanecen almacenadas aunque no viajen en el DTO. Datos comunes y descuentos generales del cliente siguen visibles cuando el cliente es accesible.

#### Scenario: Respuesta del cliente compartido
- **WHEN** CAB está asociado a A+B y un usuario de A consulta su detalle o descuentos
- **THEN** ve los datos comunes y descuentos de CAB, pero solo la asociación y región correspondientes a A
- **AND** los identificadores, nombres y condiciones específicas de B no aparecen en esas relaciones

### Requirement: Alta de clientes únicamente en PDV propios

El sistema SHALL exigir al menos un PDV propio activo para crear un cliente. Todos los PDV enviados en el alta MUST pertenecer al tenant y al alcance del usuario; una lista mixta inválida se rechaza completa sin crear cliente ni relaciones.

#### Scenario: Alta en A y B sin acceso a B
- **WHEN** un usuario de A intenta crear un cliente con sucursal_ids=[A,B]
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE y no se crea ninguna parte del cliente

#### Scenario: Alta válida o vacía
- **WHEN** un usuario de A crea un cliente con A activo
- **THEN** el alta continúa con las validaciones existentes
- **AND** una lista vacía o sin un PDV propio activo no crea un cliente

### Requirement: Edición de datos comunes del cliente compartido

El sistema SHALL permitir editar datos comunes, estado y descuentos de un cliente accesible aunque también pertenezca a PDV ajenos. No exige asociación a todos sus PDV ni duplica el cliente por sucursal; el cambio común sigue repercutiendo en todos sus usos.

#### Scenario: Editar CAB desde A
- **WHEN** un usuario de A cambia el contacto, estado o descuento habitual de CAB asociado a A+B
- **THEN** la edición se admite y CAB conserva una única configuración común para A y B
- **AND** las asociaciones y regiones de B no se alteran por esa edición

### Requirement: Reemplazo parcial de asociaciones dentro del alcance propio

En una edición, el sistema SHALL interpretar sucursal_ids como el conjunto deseado de asociaciones dentro del alcance del usuario. MUST preservar las asociaciones ajenas leídas del estado actual y no aceptar IDs ajenos. Omitir sucursal_ids conserva todas las asociaciones.

#### Scenario: Guardar solamente el vínculo visible
- **WHEN** CAB tiene A+B y un usuario de A envía sucursal_ids=[A]
- **THEN** CAB conserva A+B y las regiones de B, aunque B no haya viajado al frontend

#### Scenario: Modificar varios vínculos propios
- **WHEN** el usuario pertenece a A+D, el cliente tiene A+B y se envía sucursal_ids=[D] con D activo
- **THEN** las asociaciones resultantes son B+D y se elimina únicamente la región del vínculo retirado A
- **AND** la región de B se conserva

#### Scenario: Body con una asociación ajena
- **WHEN** un usuario de A incluye B en sucursal_ids al editar un cliente accesible
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE y se revierte también cualquier cambio de datos comunes incluido en la solicitud

### Requirement: Integridad y concurrencia de asociaciones

El sistema SHALL conservar al menos una asociación global del cliente y aplicar autorización, datos comunes y relaciones como una única escritura atómica. Una edición parcial MUST NOT sobrescribir cambios concurrentes en asociaciones o regiones fuera del alcance del editor.

#### Scenario: Eliminar todos los vínculos globales
- **WHEN** CA tiene únicamente A y el usuario intenta guardar sucursal_ids=[]
- **THEN** se rechaza la operación por la regla de al menos un PDV y CA conserva sus datos y relaciones

#### Scenario: Ediciones simultáneas por A y B
- **WHEN** usuarios de A y B editan las asociaciones propias del mismo cliente compartido
- **THEN** cada cambio preserva el estado vigente de las relaciones ajenas y no restaura ni borra vínculos por una copia anterior

### Requirement: Pérdida de acceso por quitar el último vínculo propio

El sistema SHALL permitir retirar el último vínculo propio si queda al menos un vínculo global. La escritura exitosa SHALL responder HTTP 200 con `status: success`, `data: null` y `acceso_revocado: true`, sin devolver el cliente que dejó de ser accesible.

#### Scenario: Retirar A y conservar B
- **WHEN** un usuario de A guarda sucursal_ids=[] para CAB asociado a A+B
- **THEN** CAB queda asociado a B, conserva la región de B y se elimina la de A
- **AND** la respuesta informa acceso_revocado=true y una consulta posterior de CAB devuelve 404 RECURSO_NO_DISPONIBLE

### Requirement: Descuentos del cliente autorizados por visibilidad

El sistema SHALL exigir acceso al cliente para consultar, crear, actualizar o quitar sus descuentos por categoría, subcategoría y producto. Los descuentos siguen siendo comunes al cliente; modificar la configuración global de una categoría es una excepción diferente.

#### Scenario: Descuento de cliente compartido
- **WHEN** un usuario de A modifica un descuento especial de CAB asociado a A+B
- **THEN** se admite como edición común de CAB y puede afectar sus precios en ambos PDV

#### Scenario: Descuento de cliente exclusivamente ajeno
- **WHEN** el usuario intenta usar los IDs de CB y de sus descuentos sin compartir PDV
- **THEN** recibe 404 RECURSO_NO_DISPONIBLE y no se crea, cambia ni elimina ningún descuento

### Requirement: Regiones de cliente para un PDV propio y asociado

El sistema SHALL permitir asignar o quitar una región únicamente cuando el cliente es accesible y el PDV está asociado tanto al usuario como al cliente. La región debe incluir ese PDV y cumplir las validaciones vigentes. Las regiones ajenas del cliente MUST permanecer intactas.

#### Scenario: Región compartida utilizable en A
- **WHEN** CAB pertenece a A+B y una región R incluye A+B, y el usuario solo pertenece a A
- **THEN** puede asignar R a CAB en A sin administrar R ni cambiar la asignación de B

#### Scenario: Intento sobre B o sobre un par sin vínculo
- **WHEN** un usuario de A intenta asignar o quitar la región de CAB en B
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE sin modificar la relación
- **AND** si el PDV es propio pero no está asociado al cliente, recibe 404 RECURSO_NO_DISPONIBLE
