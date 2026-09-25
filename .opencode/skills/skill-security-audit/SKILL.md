---
name: skill-security-audit
description: SOP para auditoría de licencias de dependencias, operaciones de archivo no destructivas, backups previos y cumplimiento de Clean-Room MIT.
---

# OpenMemory SOP Skill: Security, License Audit & Non-Destructive Operations

## Purpose
Establecer el procedimiento operativo estándar (SOP) para auditar la seguridad del código, garantizar la compatibilidad de licencias (Clean-Room MIT, rechazo estricto de copyleft AGPL-3.0) y aplicar protocolos de modificación no destructiva con respaldo previo de archivos.

## Scope & Constraints
* **Ámbito:** Gestión de dependencias en `package.json`, inyección de bloques en `AGENTS.md`, creación de backups en `.openmemory/backups/`.
* **Restricciones:**
  - Prohibido copiar o adaptar código fuente bajo licencias copyleft (AGPL-3.0 / GPL).
  - Prohibido sobrescribir `AGENTS.md` u otros archivos del usuario sin crear primero una copia de respaldo timestamped.
  - Toda inyección en archivos del usuario debe estar delimitada por marcas HTML explícitas (`<!-- OPENMEMORY:START -->` ... `<!-- OPENMEMORY:END -->`).

## Procedure Checklist

1. **Auditoría de Licencias de Dependencias:**
   - Revisa cualquier nueva dependencia npm que se pretenda incluir.
   - Confirma que la licencia sea permisiva (MIT, Apache 2.0, BSD).
   - Rechaza explícitamente cualquier módulo bajo AGPL-3.0 (e.g. `claude-mem`).

2. **Creación de Respaldo Previo (Pre-modification Backup):**
   - Antes de modificar `AGENTS.md` o archivos de configuración existentes, crea una copia de seguridad en `.openmemory/backups/<filename>.<timestamp>.bak`.

3. **Inyección Delimitada No Destructiva:**
   - Para insertar punteros de OpenMemory en archivos del usuario, utiliza bloques delimitados:
     ```markdown
     <!-- OPENMEMORY:START -->
     ## OpenMemory Context Pointer
     * Active Session Handoff: .openmemory/handoff.md
     * Active Project State Index: .openmemory/project-state.json
     * Core Storage Engine: src/storage.ts
     <!-- OPENMEMORY:END -->
     ```

4. **Verificación de Aislamiento en `.openmemory/`:**
   - Confirma que todos los datos operativos y logs residan dentro del directorio aislado `.openmemory/`.
