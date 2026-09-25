---
name: skill-architecture-review
description: SOP para revisión de arquitectura, cumplimiento de ADRs, registro de decisiones en formato MADR v3 y validación de patrones.
---

# OpenMemory SOP Skill: Architecture Review & ADR Management

## Purpose
Establecer el procedimiento operativo estándar (SOP) para auditar cambios de código contra los Registros de Decisiones de Arquitectura (ADRs) vigentes del proyecto, verificar el cumplimiento de patrones de diseño y registrar nuevas decisiones arquitectónicas de forma determinista y atómica.

## Scope & Constraints
* **Ámbito:** Revisión de diseño, patrones de desacoplamiento, adición/modificación de estructuras de almacenamiento y validación de ADRs en `.openmemory/adrs/`.
* **Restricciones:** 
  - Prohibida la modificación del core de OpenCode.
  - Prohibido el uso de licencias copyleft AGPL-3.0 (Clean-Room MIT obligatorio).
  - Toda adición de ADR debe ser persistida atómicamente mediante `StorageEngine.saveADR()`.

## Procedure Checklist

1. **Inspección de ADRs Existentes:**
   - Lee el índice de decisiones ejecutando `StorageEngine.listADRs()` o consultando `.openmemory/adrs/`.
   - Revisa las restricciones técnicas de cada ADR aceptado (e.g. arquitectura de almacenamiento local, persistencia atómica via `.tmp` + `fs.renameSync`).

2. **Evaluación de la Propuesta de Cambio:**
   - Compara las modificaciones propuestas contra las decisiones aprobadas.
   - Verifica si la solución introduce nuevas dependencias externas, daemons en segundo plano o bases de datos no autorizadas.

3. **Registro de Nueva Decisión (Format MADR v3):**
   - Si el cambio implica un nuevo patrón estructural, genera un nuevo registro utilizando `StorageEngine.saveADR({ title, status, date, context, decision, consequences })`.
   - Formato resultante en `.openmemory/adrs/ADR-xxx.md`:
     ```markdown
     # ADR-xxx: <Título de la Decisión>
     
     **Status:** ACCEPTED  
     **Date:** YYYY-MM-DD  

     ## Context
     <Descripción del problema o contexto técnico>

     ## Decision
     <Justificación y decisión tomada>

     ## Consequences
     <Consecuencias positivas y negativas>
     ```

4. **Actualización de Meta y Fase:**
   - Si la decisión modifica la meta del proyecto o la fase activa, actualiza el estado mediante `StorageEngine.setActiveGoal(goal, phase)`.
