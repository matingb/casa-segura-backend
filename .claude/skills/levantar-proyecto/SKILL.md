---
name: levantar-proyecto
description: Levanta el entorno completo de casa-segura-backend — arranca Docker Desktop, inicia Supabase local (API, DB, Auth) y arranca el servidor Express en modo dev. Usar cuando el usuario pida "levantar el proyecto", "levantar el backend", "prender todo", "arrancar el server", o similar.
---

# Levantar proyecto casa-segura-backend

Este proyecto necesita Docker (para Supabase local) y el servidor Express corriendo.
Seguí estos pasos en orden, desde la raíz del repo (`c:\casa-segura-backend`).

## 1. Verificar/arrancar Docker Desktop

```powershell
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
}
```

Si Docker no estaba corriendo, esperá a que el motor esté listo antes de seguir
(sondeá `docker info` cada pocos segundos, hasta ~2 minutos). Si tras 2 minutos
sigue sin responder, avisale al usuario en vez de seguir reintentando indefinidamente.

## 2. Levantar Supabase local

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

## 3. Levantar el backend (Express)

Desde `c:\casa-segura-backend`:

```bash
npm run dev
```

Corré esto en background. Confirmá que levantó bien viendo en el output algo como:

```
[server]: Server is running at http://localhost:8080
```

## 4. Smoke test

```bash
curl -s -w "\nHTTP %{http_code}\n" http://localhost:8080/api/auth/me
```

Un `401 Authentication token missing` confirma que el server y la conexión a Supabase
están funcionando (no es un error, es la respuesta esperada sin token).

## Notas

- No asumas que `docker`/`supabase` están en el PATH de la sesión actual sin
  verificarlo primero — si no están, decíselo al usuario en vez de reinstalar nada.
- No hace falta `npm install` salvo que `node_modules` esté ausente o incompleto.
