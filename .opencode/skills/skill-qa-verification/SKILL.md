---
name: skill-qa-verification
description: SOP para ejecución autónoma de pruebas empíricas, extracción e inspección de logs no truncados previa a diagnósticos y reporte de evidencias.
---

# OpenMemory SOP Skill: QA & Autonomous Empirical Verification

## Purpose
Establecer el procedimiento operativo estándar (SOP) para la verificación empírica de código, ejecución autónoma de scripts de prueba mediante `npx tsx`, inspección silenciosa de logs completos antes de emitir diagnósticos y registro de evidencias empíricas de prueba.

## Scope & Constraints
* **Ámbito:** Suites de prueba en `.work/experiments/`, evidencias en `.work/evidence/` y comandos de regresión.
* **Restricciones:**
  - Prohibido declarar una tarea o corrección como completada sin haber ejecutado primero la prueba empírica.
  - Prohibido adivinar causas de fallos sin leer los logs no truncados o stack traces completos.
  - Prohibido silenciar excepciones o eliminar tests que fallan para "simular" éxito.

## Procedure Checklist

1. **Ejecución de Prueba Empírica:**
   - Ejecuta el script de prueba correspondiente mediante `npx tsx .work/experiments/run-<fase>-tests.ts`.
   - Captura el código de salida (exit code) y las salidas de `stdout` y `stderr`.

2. **Inspección de Logs en Caso de Fallo:**
   - Si una prueba falla, extrae y lee el archivo de log completo en `.openmemory/logs/` o `.work/evidence/`.
   - Formula la hipótesis de diagnóstico basándote estrictamente en la evidencia empírica del log.

3. **Ejecución de Regresión Completa:**
   - Tras cualquier cambio de código, ejecuta la suite de regresión completa de fases previas para garantizar 0 regresiones.

4. **Registro de Resultados y Evidencias:**
   - Guarda los resultados estructurados JSON en `.work/evidence/phase-<fase>-test-results.json`.
   - Registra el recuento exacto de pruebas pasadas y falladas en el reporte de implementación.
