# Spec Delta

## Purpose

Definir el límite de acceso por PDV para las APIs utilizadas por las pantallas
visibles, conservando las excepciones compartidas acordadas para el tenant.

## ADDED Requirements

### Requirement: Alcance derivado de la identidad autenticada

El sistema SHALL resolver el tenant y las asignaciones activas del usuario activo desde su identidad autenticada. Un identificador o rol enviado por el cliente MUST NOT ampliar ese alcance. Los permisos administrativos existentes no otorgan un bypass general por PDV.

#### Scenario: Usuario asociado a un solo PDV
- **WHEN** un usuario del tenant T está asignado a A y consulta un recurso protegido de B en T
- **THEN** el sistema rechaza el acceso aunque el usuario tenga un rol administrador en A

#### Scenario: Solicitud con identidad manipulada
- **WHEN** una solicitud incluye un tenant, usuario, rol o lista de PDV diferentes de los autenticados
- **THEN** esos valores no amplían los recursos accesibles ni permiten una escritura ajena

#### Scenario: Usuario o asignación desactivados
- **WHEN** el usuario está inactivo o su asignación a A fue desactivada antes de una nueva solicitud protegida
- **THEN** esa solicitud no obtiene ni modifica datos de A mediante la asignación revocada

### Requirement: Listados sin ampliación implícita

Los listados protegidos SHALL devolver únicamente recursos autorizados, incluidos totales, paginación y valores de filtros. Omitir el filtro PDV MUST NOT ampliar el alcance al tenant completo. Un usuario sin asignaciones obtiene listas vacías y no puede crear recursos protegidos.

#### Scenario: Consulta sin filtro de PDV
- **WHEN** un usuario de A solicita un listado sin filtro y existen recursos en A y B
- **THEN** la respuesta, su total y sus opciones de filtro solo consideran los recursos permitidos para A

#### Scenario: Sin PDV asociados
- **WHEN** un usuario sin asignaciones consulta listados protegidos
- **THEN** recibe HTTP 200 con listas vacías y total cero cuando corresponda
- **AND** las excepciones globales siguen sujetas a sus reglas propias

### Requirement: Rechazos consistentes y sin efectos

El sistema SHALL responder 403 con `code: SUCURSAL_FUERA_DE_ALCANCE` ante un PDV explícito no autorizado y 404 con `code: RECURSO_NO_DISPONIBLE` ante un recurso protegido ajeno o inexistente. Un rechazo MUST NOT revelar datos del recurso ni producir escrituras parciales.

#### Scenario: PDV explícito ajeno en filtro o alta
- **WHEN** una solicitud protegida indica B sin una asignación válida, incluso si B no existe o pertenece a otro tenant
- **THEN** recibe 403 con SUCURSAL_FUERA_DE_ALCANCE sin sustituir B por todos los PDV

#### Scenario: URL de un recurso ajeno
- **WHEN** se consulta o modifica directamente el identificador de un stock o cliente fuera de alcance
- **THEN** recibe el mismo 404 RECURSO_NO_DISPONIBLE que un identificador inexistente
- **AND** los datos y relaciones conservan su estado previo

### Requirement: Referencias globales mínimas para excepciones

El sistema SHALL ofrecer referencias de todos los PDV del tenant con solo `id`, `nombre`, `activo` y `es_central` para categorías y casa central. Esa referencia MUST NOT incluir stock, descuentos del PDV, cotizaciones, usuarios, roles ni asignaciones.

#### Scenario: Configurar una categoría para B
- **WHEN** un usuario de A abre la configuración global de categorías
- **THEN** puede identificar B mediante la referencia mínima y configurar sus excepciones de categoría
- **AND** no recibe otros datos comerciales ni usuarios de B mediante esa referencia

### Requirement: Catálogo de productos y categorías compartidos

El sistema SHALL conservar el alcance tenant del catálogo de productos y de la configuración completa de categorías/subcategorías. Incluye ABM, precios y descuentos base de productos, descuentos generales de categorías y excepciones por cualquier PDV del mismo tenant.

#### Scenario: Producto o descuento de categoría con impacto en B
- **WHEN** un usuario de A modifica un producto compartido o crea, cambia o quita una excepción de categoría/subcategoría para B
- **THEN** la falta de asociación a B no bloquea esa acción
- **AND** siguen vigentes las validaciones de tenant, negocio y eliminación existentes

#### Scenario: Categoría de otro tenant
- **WHEN** se intenta usar una categoría, producto o PDV de otro tenant mediante esta excepción
- **THEN** el sistema rechaza la solicitud; la excepción no elimina el aislamiento entre tenants

### Requirement: Designación de casa central como excepción acotada

El sistema SHALL permitir marcar como central un PDV propio y quitar automáticamente la condición al anterior, aunque este sea ajeno al usuario. Esta excepción MUST NOT habilitar la edición del nombre, descuento, cotización, usuarios o estado de un PDV ajeno.

#### Scenario: Reemplazar la casa central ajena
- **WHEN** un usuario asociado a A marca A como central y la central anterior es B
- **THEN** A queda central y B pierde únicamente esa condición dentro de la misma operación
- **AND** las demás propiedades y asignaciones de B no cambian

### Requirement: Cotización general con permiso global conservado

El sistema SHALL conservar la autorización global `cotizacion.actualizar` para modificar la cotización general del tenant. La falta de asociación a todos los PDV que heredan esa cotización MUST NOT agregar un bloqueo. La edición de cotizaciones propias de PDV sigue limitada a los asociados.

#### Scenario: Permiso global desde un solo PDV
- **WHEN** un usuario de A posee cotizacion.actualizar por su asignación vigente y B hereda la cotización general
- **THEN** puede actualizar la cotización general con las validaciones y versión existentes, aunque no esté asociado a B

#### Scenario: Sin permiso global
- **WHEN** un usuario asociado a varios PDV carece de cotizacion.actualizar
- **THEN** no puede modificar la cotización general por el solo hecho de estar asociado a esos PDV
