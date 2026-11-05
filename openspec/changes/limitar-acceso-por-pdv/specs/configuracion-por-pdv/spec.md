# Spec Delta

## Purpose

Proteger la configuración comercial, usuarios y regiones de cada PDV sin alterar
los permisos globales y las excepciones compartidas definidas para el sistema.

## ADDED Requirements

### Requirement: Datos completos de PDV solo para asignados

El sistema SHALL limitar el listado administrativo completo, resumen de uso y usuarios de un PDV a los asignados al usuario. El listado puede incluir PDV propios inactivos para su gestión histórica. Los PDV ajenos solo se identifican mediante la referencia global mínima de las excepciones.

#### Scenario: Configuración con inactivos propios
- **WHEN** un usuario pertenece a A activo y D inactivo y no pertenece a B
- **THEN** el listado administrativo puede devolver A y D con sus datos completos, pero no B

#### Scenario: Usuarios o resumen de B
- **WHEN** el usuario consulta los endpoints de usuarios asignados o resumen de uso de B
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE sin nombres, correos, cantidades ni conteos de B

### Requirement: Modificación de PDV y asignaciones con permisos conservados

El sistema SHALL exigir asociación al PDV para editarlo, desactivarlo, reactivarlo y cambiar su cotización propia. Administrar sus asignaciones requiere además usuarios.administrar; crear un PDV conserva ese permiso global y la autoasignación vigente del creador.

#### Scenario: Administrador de A intenta editar B
- **WHEN** un usuario con usuarios.administrar en A intenta editar datos o usuarios de B sin estar asociado
- **THEN** la solicitud se rechaza sin modificar B ni sus asignaciones

#### Scenario: Crear un nuevo PDV
- **WHEN** un usuario con usuarios.administrar crea D con datos válidos
- **THEN** el alta conserva la asignación del creador y las validaciones vigentes
- **AND** el hecho de no tener previamente una asociación a D no impide crear ese nuevo PDV

### Requirement: Opciones de asignación protegidas

El sistema SHALL entregar el catálogo de usuarios y roles para asignaciones solo a quien posea usuarios.administrar. Sin ese permiso devuelve puede_administrar=false con catálogos vacíos. Los usuarios de un PDV propio siguen siendo consultables para mostrar sus asignaciones existentes.

#### Scenario: Usuario sin administración de asignaciones
- **WHEN** un usuario sin usuarios.administrar abre la edición de un PDV propio
- **THEN** puede ver sus asignaciones existentes pero las opciones de asignación no exponen el directorio de usuarios del tenant

### Requirement: Consulta parcial de regiones

El sistema SHALL mostrar solo regiones que incluyan al menos un PDV del usuario y proyectar sus sucursales a esa intersección. La respuesta SHALL indicar puede_modificar=false y motivo_bloqueo=REGION_COMPARTIDA_FUERA_DE_ALCANCE cuando la región abarque PDV ajenos, sin revelar sus IDs o nombres.

#### Scenario: Región mixta y región exclusivamente ajena
- **WHEN** RA incluye A, RAB incluye A+B y RB incluye B, y el usuario solo pertenece a A
- **THEN** recibe RA editable y RAB con sucursales=[A] y el motivo de bloqueo
- **AND** no recibe RB ni los datos identificatorios de B dentro de RAB

### Requirement: Administración de regiones sin impacto ajeno

El sistema SHALL permitir crear regiones solo con PDV propios activos. Para cambiar nombre, descuento, estado, asociaciones o eliminar una región exige alcance sobre todos sus PDV actuales y propuestos, además de las validaciones de uso existentes.

#### Scenario: Intentar alterar una región mixta
- **WHEN** un usuario de A intenta cambiar el descuento, borrar, desactivar o quitar B de RAB que incluye A+B
- **THEN** recibe 403 REGION_COMPARTIDA_FUERA_DE_ALCANCE y no cambia ninguna parte de la región

#### Scenario: Región totalmente propia
- **WHEN** un usuario pertenece a A+D y crea o administra una región limitada a esos PDV
- **THEN** la acción continúa si cumple las validaciones existentes, incluida la imposibilidad de quitar un PDV utilizado por clientes

#### Scenario: Región completamente ajena por ID
- **WHEN** un usuario de A consulta o modifica directamente RB que solo incluye B
- **THEN** recibe 404 RECURSO_NO_DISPONIBLE sin divulgar la región

### Requirement: Cotizaciones generales y propias con alcances diferentes

El sistema SHALL conservar el acceso compartido a la cotización general y su edición con cotizacion.actualizar. La consulta y edición de cotización propia de PDV exige asociación. Las sugerencias de PDV de la referencia general SHALL estar limitadas a los propios activos.

#### Scenario: Cotización global y sugerencias locales
- **WHEN** un usuario de A con cotizacion.actualizar consulta y actualiza la cotización general
- **THEN** conserva esa facultad aunque B también la herede y las sugerencias solo incluyen sus PDV activos

#### Scenario: Cotización propia ajena
- **WHEN** ese mismo usuario intenta consultar o cambiar la cotización propia de B
- **THEN** recibe 403 SUCURSAL_FUERA_DE_ALCANCE y no obtiene ni modifica los valores de B
