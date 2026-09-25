---
name: skill-session-handoff
description: SOP para extracción estructurada de resúmenes de sesión, actualización de handoff.md, tope de 500 palabras y preservación verbatim de notas humanas.
---

# OpenMemory SOP Skill: Session Handoff & Continuity Engine

## Purpose
Establecer el procedimiento operativo estándar (SOP) para capturar el progreso de la sesión activa, actualizar la narrativa de continuidad en `.openmemory/handoff.md`, aplicar el límite estricto de 500 palabras y preservar las secciones de propiedad humana sin alteración.

## Scope & Constraints
* **Ámbito:** Eventos de ciclo de vida de sesión (`session.compacted`, `session.idle`), actualización de resúmenes y recuperación inter-sesión.
* **Restricciones:**
  - Las secciones automáticas (`## Progress Summary`, `## Uncommitted Work & Next Steps`) son gestionadas por la máquina.
  - Las secciones humanas (`## Key Architectural Decisions`, `## Developer Notes`) deben ser preservadas 100% verbatim.
  - El documento total debe respetar el techo máximo de 500 palabras (`maxHandoffWords`).

## Procedure Checklist

1. **Lectura del Estado de Handoff Actual:**
   - Lee el archivo `.openmemory/handoff.md` mediante `StorageEngine.getOrInitHandoff()`.
   - Ejecuta `StorageEngine.parseHandoffSections()` para clasificar cabeceras automáticas y humanas.

2. **Sintetización del Progreso Reciente:**
   - Extrae las tareas completadas y los hitos alcanzados durante la sesión actual.
   - Formula los siguientes pasos pendientes estructurados como lista numerada.

3. **Actualización No Destructiva:**
   - Ejecuta `StorageEngine.updateHandoff({ activeGoal, activePhase, progressSummary, nextSteps })`.
   - Verifica que las notas manuales ingresadas por desarrolladores humanos se mantengan intactas.

4. **Verificación del Techo de Palabras:**
   - Si el contenido total excede 500 palabras, `StorageEngine.truncateHandoffWords()` aplicará el truncamiento seguro de la narrativa agregando el aviso `*(Truncated to maxHandoffWords limit)*`.
