---
name: bajar-proyecto
description: Apaga el entorno completo de casa-segura-backend — para el servidor Express en dev y baja los contenedores de Supabase local (Docker). Usar cuando el usuario pida "bajar el proyecto", "cerrar el backend", "apagar todo", "parar el server", o similar.
---

# Bajar proyecto casa-segura-backend

## 1. Parar el servidor Express

Si quedó un proceso `npm run dev` / `tsx` corriendo en background (lanzado por
Claude Code en esta sesión), detenelo con el mecanismo de background tasks
disponible (p. ej. `TaskStop` o matando el proceso que escucha en el puerto
de `.env` — por defecto 8080):

```bash
netstat -ano | grep ":8080" | grep LISTENING
```

Tomá el PID de la última columna y matalo:

```bash
taskkill //F //PID <PID>
```

Si no hay ningún proceso escuchando en ese puerto, no hay nada que hacer en este paso.

## 2. Bajar Supabase local

Desde `c:\casa-segura-backend`:

```bash
npx supabase stop
```

Esto detiene y remueve los contenedores de Supabase (API, DB, Auth, Studio, etc.)
sin borrar los datos (persisten en el volumen de Docker hasta un `supabase stop --no-backup`
o `supabase db reset`, que NO se deben correr salvo pedido explícito del usuario).

## 3. (Opcional) Cerrar Docker Desktop

No lo cierres por defecto — dejar Docker Desktop corriendo no tiene costo real y
el usuario puede querer levantar otra cosa. Solo cerralo si el usuario lo pide
explícitamente:

```powershell
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
```

## Confirmación

Verificá que todo bajó:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/ --max-time 3
```

Debería fallar la conexión (server abajo). Y `docker ps` no debería listar
contenedores de `casa_segura`/supabase.
