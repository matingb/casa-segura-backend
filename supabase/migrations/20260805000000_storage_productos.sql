-- =============================================================================
-- CasaSegura — Supabase Storage: bucket público para imágenes de productos
-- =============================================================================

-- Crear bucket público "productos"
-- public = true → los archivos se pueden leer públicamente sin signed URL
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  true,
  5242880,  -- 5 MB máximo por imagen
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================
-- POLÍTICAS DE STORAGE
-- ============================================================

-- Lectura pública: Cualquiera puede ver las imágenes (es un catálogo público)
CREATE POLICY "public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'productos');

-- Escritura: Sólo el service_role (backend) puede operar (subir, borrar, actualizar).
CREATE POLICY "service_role_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'productos');

CREATE POLICY "service_role_update" ON storage.objects
  FOR UPDATE TO service_role
  USING (bucket_id = 'productos');

CREATE POLICY "service_role_delete" ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'productos');
