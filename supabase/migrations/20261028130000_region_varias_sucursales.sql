-- Una región agrupa uno o más puntos de venta (sucursales), y un punto de venta
-- puede estar en varias regiones.
--
-- La región deja de pertenecer a una sola sucursal: la relación pasa a
-- `region_sucursal`. Cada región existente conserva su sucursal actual.
--
-- La asignación de región a un cliente sigue siendo por punto de venta
-- (`cliente_region`: una región por cliente y sucursal), pero ahora la región
-- tiene que incluir ese punto de venta: lo garantiza la FK compuesta contra
-- `region_sucursal`, que además impide sacar de una región un punto de venta
-- que algún cliente usa con ella.

CREATE TABLE public.region_sucursal (
    region_id   UUID NOT NULL REFERENCES public.region(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (region_id, sucursal_id)
);

CREATE INDEX idx_region_sucursal_sucursal ON public.region_sucursal(sucursal_id);

COMMENT ON TABLE public.region_sucursal IS
  'Puntos de venta (sucursales) que forman cada región.';

INSERT INTO public.region_sucursal (region_id, sucursal_id)
SELECT id, sucursal_id FROM public.region;

ALTER TABLE public.cliente_region
  ADD CONSTRAINT cliente_region_region_sucursal_fkey
    FOREIGN KEY (region_id, sucursal_id)
    REFERENCES public.region_sucursal (region_id, sucursal_id);

-- El nombre deja de ser único por sucursal; la unicidad por empresa la valida
-- la aplicación (puede haber nombres repetidos de cuando eran por sucursal).
ALTER TABLE public.region DROP CONSTRAINT region_nombre_unique;
DROP INDEX public.idx_region_tenant_sucursal;
DROP INDEX public.idx_region_activo;
ALTER TABLE public.region DROP COLUMN sucursal_id;

CREATE INDEX idx_region_tenant_activo ON public.region(tenant_id, activo);

COMMENT ON TABLE public.region IS
  'Regiones comerciales con su descuento porcentual. Sus puntos de venta están en region_sucursal.';
