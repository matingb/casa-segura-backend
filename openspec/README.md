# OpenSpec — Casa Segura Backend

Configurado con OpenSpec CLI 1.16.0, schema `spec-driven` e integración local para
Codex (`.agents/skills/openspec-*`) y Claude Code (`.claude/skills` y `/opsx:*`).
Los artefactos se redactan en español; los marcadores estructurales se conservan
en inglés para que OpenSpec pueda validarlos.

## Uso

Ejecutar desde este repositorio. En PowerShell usar `openspec.cmd`.

```powershell
openspec.cmd list
openspec.cmd context --json
openspec.cmd status --change limitar-acceso-por-pdv
openspec.cmd validate limitar-acceso-por-pdv --strict --no-interactive
```

Para otro equipo, instalar la versión utilizada con
`npm.cmd install -g @fission-ai/openspec@1.16.0`. La instalación no forma parte
del runtime de la aplicación. Las skills y los comandos locales se comparten en Git.

En Codex usar `openspec-propose`; en Claude Code, `/opsx:propose`.
Un change contiene `proposal.md`, `specs/<capability>/spec.md`, `design.md` y
`tasks.md`. Proponer no implementa. Aplicar o archivar requiere la fase correspondiente;
no marcar tareas pendientes ni promover deltas a `openspec/specs` antes de tiempo.

## Coordinación

El change [limitar-acceso-por-pdv](changes/limitar-acceso-por-pdv/proposal.md) tiene
un [par en frontend](../../casa-segura-frontend/openspec/changes/limitar-acceso-por-pdv/proposal.md).
Cada repo conserva sus tareas, y ambos deben mantener el mismo contrato funcional.
El frontend define la experiencia; el backend aplica el límite de acceso a los
endpoints que esa experiencia utiliza. Este change no implementa permisos para
Operaciones, Pedidos de reposición ni Cuentas financieras.
