# Proposal

## Why

Las pantallas visibles de Casa Segura permiten consultar y modificar stock,
clientes y configuración comercial de PDV ajenos porque varias consultas solo
filtran por tenant. La asociación usuario–PDV debe ser el límite efectivo de esos
flujos, con las excepciones compartidas indicadas por el usuario.

## What Changes

- **BREAKING**: limitar listados, detalles, filtros, totales y escrituras de stock,
  clientes, listas de precios, regiones y configuración propia a los PDV asignados
  al usuario autenticado; rechazar identificadores manipulados en esas mismas APIs.
- Un cliente es visible y editable si comparte al menos un PDV con el usuario.
  Sus datos comunes y descuentos siguen siendo únicos: una edición puede repercutir
  en otros PDV del mismo cliente. Ocultar y preservar asociaciones y regiones ajenas.
- Reemplazar solo la porción editable de `sucursal_ids` del cliente, conservando
  relaciones ajenas dentro de la misma transacción. Si se pierde el último vínculo
  propio y quedan otros, informar la pérdida de acceso sin devolver datos ocultos.
- Proyectar las regiones a los PDV propios. Administrar una región exige cubrir
  todos sus PDV actuales y los propuestos; una región mixta sigue siendo utilizable
  para asignaciones de clientes en PDV propios.
- Separar referencias mínimas globales de PDV de sus datos comerciales y usuarios.
- Conservar cuatro excepciones: catálogo compartido de productos; configuración
  completa de categorías/subcategorías, incluyendo descuentos y excepciones por PDV;
  designación de casa central; y cotización general con su permiso global actual.
- Mantener los permisos existentes de administración de usuarios y alta de PDV.
  Ser administrador no otorga un bypass general a los límites por PDV.

## Capabilities

### New Capabilities

- `acceso-por-pdv`: alcance autenticado, rechazos, referencias globales y excepciones.
- `stock-y-listas-por-pdv`: stock, filtros y listas generales/de clientes limitados por PDV.
- `clientes-por-pdv`: visibilidad y edición de clientes, descuentos y asociaciones parciales.
- `configuracion-por-pdv`: administración propia de PDV, regiones y cotizaciones.

### Modified Capabilities

Ninguna: el repositorio se inicializa sin specs principales previas. Los requisitos
describen el comportamiento objetivo y no afirman que ya esté implementado.

## Impact

Servicios, repositorios y controladores de `producto-sucursal`, `cliente`,
`cliente-descuento`, `lista-precios`, `region`, `sucursal` y lectura de `cotizacion`.
No requiere nuevas dependencias ni cambios de esquema como condición inicial.
El [change par del frontend](../../../../casa-segura-frontend/openspec/changes/limitar-acceso-por-pdv/proposal.md)
debe consumir los mismos contratos.

Fuera de alcance: Operaciones, Pedidos de reposición, Cuentas financieras y sus
rutas ocultas, el endpoint de evaluación de ventas no usado por las pantallas
alcanzadas, ABM de roles ajeno a ellas, habilitación de módulos, auditoría integral
de Supabase/Data API/RLS y cambios de fórmulas monetarias. Este pedido crea solamente
configuración de OpenSpec y artefactos; las tareas de producto quedan pendientes.
