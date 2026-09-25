---
description: OpenMemory — Consultar estado consolidado de memoria, tareas, fase y decisiones ADR
---

# OpenMemory Command: /memory-status

Instrucciones para el agente OpenCode:
1. Inspecciona el archivo `.openmemory/project-state.json` para obtener la fase activa (`activePhase`), la meta actual (`activeGoal`) y el listado de tareas (`activeTasks`).
2. Consulta el directorio `.openmemory/adrs/` para resumir las Decisiones de Arquitectura (ADRs) registradas.
3. Lee la cabecera de `.openmemory/handoff.md` para verificar la continuidad de la sesión.
4. Muestra un reporte estructurado y conciso del estado actual del proyecto al usuario.
