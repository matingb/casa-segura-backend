<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->

<!-- OPENSPEC:START -->

## OpenSpec

- Configuración y uso: [openspec/README.md](openspec/README.md).
- Usar las skills locales `openspec-*` para proponer, revisar y aplicar changes.
- Una solicitud de plan/spec produce artefactos; implementar requiere un pedido posterior.
- Los changes coordinados con `../casa-segura-frontend` usan el mismo identificador.
- Validar los artefactos con `openspec.cmd validate <change-id> --strict --no-interactive`.
- Mantener las tareas de implementación pendientes hasta ejecutar y verificar el trabajo.

<!-- OPENSPEC:END -->
