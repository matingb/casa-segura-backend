---
name: levantar-proyecto
description: Levanta el entorno completo de casa-segura-backend — baja lo que haya quedado corriendo, arranca Docker Desktop, inicia Supabase local (API, DB, Auth), aplica las migraciones pendientes y arranca el servidor Express en modo dev. Usar cuando el usuario pida "levantar el proyecto", "levantar el backend", "prender todo", "arrancar el server", o similar.
---

# Levantar proyecto casa-segura-backend

Este proyecto necesita Docker (para Supabase local) y el servidor Express corriendo.
Seguí estos pasos en orden, desde la raíz del repo (`c:\casa-segura-backend`).

## 1. Bajar lo que ya esté corriendo

Siempre, antes de levantar nada, asegurate de partir de un entorno limpio — evita
quedarte con un server viejo escuchando en el puerto (que hace parecer que "ya
levantó" cuando en realidad es el proceso anterior) o con contenedores a medio
arrancar.

Verificá ambas cosas:

```bash
netstat -ano | grep ":8080" | grep LISTENING
docker ps --format "{{.Names}}" | grep -i -E "supabase|casa_segura"
```

- Si hay algo en alguno de los dos, corré la skill `bajar-proyecto` completa antes
  de seguir.
- Si ambos están vacíos, no hay nada que bajar: pasá directo al paso 2.

## 2. Verificar/arrancar Docker Desktop

```powershell
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
}
```

Si Docker no estaba corriendo, esperá a que el motor esté listo antes de seguir
(sondeá `docker info` cada pocos segundos, hasta ~2 minutos). Si tras 2 minutos
sigue sin responder, avisale al usuario en vez de seguir reintentando indefinidamente.

## 3. Levantar Supabase local

Desde `c:\casa-segura-backend`:

```bash
npx supabase start
```

- La primera vez descarga las imágenes de Docker (puede tardar varios minutos).
- Si ya está corriendo, el comando lo indica y no hace nada malo (es idempotente).
- Al terminar, imprime las URLs y keys (API URL, anon key, service_role key, etc).
  Estas deben coincidir con `SUPABASE_URL` y `SUPABASE_KEY` del `.env` del proyecto
  (API en `http://127.0.0.1:54321`, DB en `127.0.0.1:54322`, project_id `casa_segura`).
  Si detectás que difieren, avisá al usuario antes de continuar.

## 4. Correr migraciones pendientes

`supabase start` aplica las migraciones y el `seed.sql` **solo cuando crea la base
por primera vez**. Si el volumen de Docker ya existía, el output dice
`Starting database from backup...` y las migraciones agregadas desde entonces
**no** se aplican solas. Por eso hay que verificar siempre, antes de levantar el
server — si no, el backend arranca contra un esquema viejo y los errores aparecen
recién al usar los endpoints.

Compará lo aplicado en la DB contra los archivos locales:

```bash
npx supabase migration list --local
```

Cada entrada con `local` y `remote` iguales ya está aplicada. Una con `local` pero
sin `remote` está pendiente.

- **Si no hay pendientes:** no corras nada, pasá al paso 5.
- **Si hay pendientes:** aplicalas sin destruir datos con

  ```bash
  npx supabase migration up --local
  ```

  Volvé a correr `migration list --local` para confirmar que quedaron aplicadas.

- **Si `migration up` falla** (típicamente porque el estado de la base divergió de
  los archivos), **no** corras `supabase db reset` por tu cuenta: ese comando
  recrea la base desde cero y corre el seed, perdiendo todos los datos locales.
  Avisale al usuario, explicale que la salida es un reset destructivo, y esperá
  que lo pida explícitamente.

## 5. Levantar el backend (Express)

Desde `c:\casa-segura-backend`:

```bash
npm run dev
```

Corré esto en background. Confirmá que levantó bien viendo en el output algo como:

```
[server]: Server is running at http://localhost:8080
```

## 6. Smoke test

```bash
curl -s -w "\nHTTP %{http_code}\n" http://localhost:8080/api/auth/me
```

Un `401 Authentication token missing` confirma que el server y la conexión a Supabase
están funcionando (no es un error, es la respuesta esperada sin token).

## Notas

- No asumas que `docker`/`supabase` están en el PATH de la sesión actual sin
  verificarlo primero — si no están, decíselo al usuario en vez de reinstalar nada.
- No hace falta `npm install` salvo que `node_modules` esté ausente o incompleto.
- Nunca edites el `.env` por tu cuenta para "arreglar" una key que no coincide:
  reportá la diferencia y dejá que el usuario decida.
- Ningún paso de esta skill debe borrar datos. `supabase db reset` y
  `supabase stop --no-backup` quedan fuera salvo pedido explícito del usuario.
