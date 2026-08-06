import { supabaseAdmin } from '../config/supabase-admin';

const BUCKET = 'productos';

export async function uploadProductImage(
  tenantId: string,
  productoId: string,
  buffer: Buffer,
  mimetype: string
): Promise<string> {

  const storagePath = `${tenantId}/${productoId}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimetype,
      upsert: true,
    });

  if (error) {
    throw new Error(`Error al subir imagen al Storage: ${error.message}`);
  }

  return storagePath;
}

export function getPublicUrl(storagePath: string): string {
  const { data } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return data.publicUrl;
}


export async function deleteProductImage(storagePath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (error) {
    console.warn(`[Storage] No se pudo eliminar ${storagePath}:`, error.message);
  }
}
