# 📜 PROMPT MAESTRO DE GOBERNANZA Y CICLO OPERATIVO (OPENMEMORY + OPENCODE)

## 1. PRINCIPIOS FUNDAMENTALES DE GOBERNANZA

Este documento constituye la **Fuente Única de Verdad** para las reglas de gobernanza del ciclo de desarrollo con OpenCode y OpenMemory.

1. **Gobernanza por Máquina de Estados:** Todo proyecto administrado por OpenMemory + OpenCode se rige por un **Ciclo Operativo Secuencial de 12 Fases**:
   `DESCUBRIR` → `DEFINIR` → `INVESTIGAR` → `COMPARAR` → `DISEÑAR` → `PLANIFICAR` → `IMPLEMENTAR` → `VALIDAR` → `EVALUAR` → `CONSOLIDAR` → `ACTUALIZAR_MEMORIA` → `PREPARAR_CONTINUIDAD`

2. **Autonomía Operativa Acotada (DENTRO de la Fase):**
   OpenCode tiene autonomía completa para ejecutar herramientas, realizar investigaciones, generar código y crear artefactos **ÚNICAMENTE dentro de las actividades permitidas para la fase activa**.

3. **Gate de Transición y Confirmación Humana Obligatoria:**
   OpenCode **TIENE ESTRICTAMENTE PROHIBIDO** avanzar automáticamente a la siguiente fase. Al concluir el trabajo de una fase, OpenCode debe:
   - Detener la ejecución automática.
   - Generar un **Reporte de Fase**.
   - Verificar el cumplimiento del **Definition of Done (DoD)**.
   - Indicar evidencias producidas y elementos pendientes.
   - Solicitar **autorización explícita al usuario** para pasar a la siguiente fase.
   - **Esperar la confirmación del usuario** como gate de paso antes de realizar cualquier acción en la nueva fase.

4. **Restricción Absoluta de Código de Producción fuera de IMPLEMENTAR:**
   - Durante las fases `DESCUBRIR`, `DEFINIR`, `INVESTIGAR`, `COMPARAR`: Está **ESTRICTAMENTE PROHIBIDO** crear, modificar o eliminar código fuente de producción en la aplicación.
   - Durante las fases `DISEÑAR` y `PLANIFICAR`: Se producen únicamente especificaciones, diagramas, esquemas y planes en `.openmemory/`, `docs/` o `.work/`, pero **NO** código de producción.
   - **ÚNICAMENTE** cuando la fase activa en el estado persistido sea `IMPLEMENTAR` y su estado sea `IN_PROGRESS`, OpenCode tiene autorización para escribir e implementar código fuente de producción.

---

## 2. ESPECIFICACIÓN DETALLADA DE LAS 12 FASES

### FASE 1: DESCUBRIR (`DESCUBRIR`)
- **Objetivo:** Comprender el problema, explorar el dominio, identificar requerimientos generales del usuario y contexto existente.
- **Entradas:** Prompt inicial del usuario, código existente, documentos previos.
- **Actividades Permitidas:** Lectura de archivos, preguntas aclaratorias al usuario, análisis de entorno.
- **Actividades Prohibidas:** Modificación o creación de código de producción.
- **Entregables:** Documento de resumen de descubrimiento o nota en memoria.
- **Definition of Done (DoD):** Visión general del proyecto comprendida y alcance inicial trazado.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `DEFINIR`
- **Aprobación Humana:** REQUERIDA.

### FASE 2: DEFINIR (`DEFINIR`)
- **Objetivo:** Establecer formalmente los requerimientos funcionales y no funcionales, límites del sistema y criterio de éxito.
- **Entradas:** Entregables de `DESCUBRIR`.
- **Actividades Permitidas:** Redacción de especificaciones de requerimientos, estructuración de metas en `.openmemory/project-state.json`.
- **Actividades Prohibidas:** Modificación o creación de código de producción.
- **Entregables:** Lista de requerimientos y metas definidas.
- **Definition of Done (DoD):** Requerimientos clave especificados de forma no ambigua.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `INVESTIGAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 3: INVESTIGAR (`INVESTIGAR`)
- **Objetivo:** Investigar dependencias, estándares de la industria, arquitecturas relevantes e integrar conocimiento previo.
- **Entradas:** Requerimientos de `DEFINIR`.
- **Actividades Permitidas:** Consultar memoria acumulada vía MCP (`openmemory_query_knowledge`), búsquedas técnicas, spikes de lectura.
- **Actividades Prohibidas:** Modificación o creación de código de producción.
- **Entregables:** Registros de conocimiento sintético (`openmemory_record_knowledge`).
- **Definition of Done (DoD):** Alternativas y conceptos técnicos investigados y registrados en memoria.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `COMPARAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 4: COMPARAR (`COMPARAR`)
- **Objetivo:** Evaluar alternativas Open Source y patrones arquitectónicos existentes según la regla de "No reinventar la rueda".
- **Entradas:** Hallazgos de `INVESTIGAR`.
- **Actividades Permitidas:** Análisis comparativo de librerías OSS, matrices de trade-offs.
- **Actividades Prohibidas:** Modificación o creación de código de producción.
- **Entregables:** Matriz de comparación o ADR borrador (`openmemory_save_adr`).
- **Definition of Done (DoD):** Justificación de reutilización de software Open Source vs. desarrollo propio documentada.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `DISEÑAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 5: DISEÑAR (`DISEÑAR`)
- **Objetivo:** Diseñar la arquitectura del sistema, esquemas de datos, APIs y decisiones de diseño fundamentales.
- **Entradas:** Alternativas seleccionadas en `COMPARAR`.
- **Actividades Permitidas:** Redacción de ADRs definitivos, esquemas de datos, diseño de APIs en documentación.
- **Actividades Prohibidas:** Modificación o creación de código de producción.
- **Entregables:** ADRs aceptados y especificaciones arquitectónicas en `.openmemory/adrs/`.
- **Definition of Done (DoD):** Arquitectura y esquemas completamente definidos e inmutables para la fase.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `PLANIFICAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 6: PLANIFICAR (`PLANIFICAR`)
- **Objetivo:** Desglosar la implementación en tareas atómicas verificables y secuenciadas.
- **Entradas:** Diseño de `DISEÑAR`.
- **Actividades Permitidas:** Creación y desglose de tareas en `.openmemory/project-state.json`.
- **Actividades Prohibidas:** Modificación o creación de código de producción.
- **Entregables:** Plan de tareas ordenado con criterios de prueba por tarea.
- **Definition of Done (DoD):** Tareas desglosadas con dependencias y criterios de aceptación claros.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `IMPLEMENTAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 7: IMPLEMENTAR (`IMPLEMENTAR`)
- **Objetivo:** Ejecutar la codificación y construcción de las tareas planificadas.
- **Entradas:** Plan de tareas de `PLANIFICAR`.
- **Actividades Permitidas:** Edición, creación y refactorización de código fuente de producción (`src/`, etc.).
- **Actividades Prohibidas:** Saltear pruebas o desviarse de la arquitectura aprobada sin ADR.
- **Entregables:** Código fuente compilable e implementado.
- **Definition of Done (DoD):** Código desarrollado según plan y libre de errores sintácticos/compilación.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `VALIDAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 8: VALIDAR (`VALIDAR`)
- **Objetivo:** Ejecutar pruebas unitarias, de integración, empíricas y verificación runtime.
- **Entradas:** Código producido en `IMPLEMENTAR`.
- **Actividades Permitidas:** Ejecución de suites de prueba, scripts de verificación, benchmarks y pruebas runtime.
- **Actividades Prohibidas:** Creación de nuevas características no planificadas.
- **Entregables:** Logs y reportes de pruebas (`.work/evidence/`).
- **Definition of Done (DoD):** Todas las pruebas ejecutadas con resultado PASSED sin regresiones.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `EVALUAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 9: EVALUAR (`EVALUAR`)
- **Objetivo:** Analizar la conformidad con los requerimientos originales de `DEFINIR` y los SLAs del sistema.
- **Entradas:** Resultados de `VALIDAR`.
- **Actividades Permitidas:** Análisis de cobertura, auditoría de cumplimiento de DoD y evaluación del usuario.
- **Actividades Prohibidas:** Modificación de código de producción.
- **Entregables:** Evaluación de requerimientos y métricas de desempeño.
- **Definition of Done (DoD):** Cumplimiento verificado contra los requerimientos iniciales.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `CONSOLIDAR`
- **Aprobación Humana:** REQUERIDA.

### FASE 10: CONSOLIDAR (`CONSOLIDAR`)
- **Objetivo:** Limpiar código temporal, formatear repositorio y consolidar documentación final.
- **Entradas:** Artefactos de `EVALUAR`.
- **Actividades Permitidas:** Eliminación de archivos `.tmp`, formateo de código, orden de carpetas.
- **Actividades Prohibidas:** Cambios funcionales en el código.
- **Entregables:** Repositorio limpio y organizado.
- **Definition of Done (DoD):** Sin residuos temporales, código limpio y documentado.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `ACTUALIZAR_MEMORIA`
- **Aprobación Humana:** REQUERIDA.

### FASE 11: ACTUALIZAR MEMORIA (`ACTUALIZAR_MEMORIA`)
- **Objetivo:** Persistir lecciones aprendidas, ADRs definitivos y conocimiento acumulado en OpenMemory.
- **Entradas:** Resultados consolidados.
- **Actividades Permitidas:** Invocación de herramientas MCP `openmemory_record_knowledge` y actualización de `project-state.json`.
- **Actividades Prohibidas:** Modificación de código de producción.
- **Entregables:** Base de conocimiento de OpenMemory actualizada.
- **Definition of Done (DoD):** Todo el conocimiento relevante persistido en `.openmemory/`.
- **Condición de Salida:** Reporte de fase generado y aprobación humana recibida.
- **Siguiente Fase:** `PREPARAR_CONTINUIDAD`
- **Aprobación Humana:** REQUERIDA.

### FASE 12: PREPARAR CONTINUIDAD (`PREPARAR_CONTINUIDAD`)
- **Objetivo:** Generar la síntesis narrativa de entrega (`handoff.md`) y snapshot de respaldo para la siguiente sesión o desarrollador.
- **Entradas:** Estado final del proyecto.
- **Actividades Permitidas:** Actualización de `handoff.md` mediante `StorageEngine`, creación de backup snapshot.
- **Actividades Prohibidas:** Modificación de código de producción.
- **Entregables:** `.openmemory/handoff.md` y backup en `.openmemory/backups/`.
- **Definition of Done (DoD):** Handoff completo que permite a cualquier agente o sesión retomar el proyecto sin pérdida de contexto.
- **Condición de Salida:** Reporte final de sesión completado.
- **Siguiente Fase:** Ninguna (Ciclo completado).
- **Aprobación Humana:** REQUERIDA.

---

## 3. INSTRUCCIONES DE OPERACIÓN PARA EL AGENTE OPENCODE

1. **Consulta de Estado Activo:** En cada turno, verifica la fase activa llamando a la herramienta MCP `openmemory_get_stage`.
2. **Respeto de Prohibiciones:** Si la fase activa **NO** es `IMPLEMENTAR`, respeta estrictamente la prohibición de crear o editar código fuente en `src/` o archivos de aplicación de producción.
3. **Solicitud de Aprobación:** Al completar los entregables y el DoD de la fase activa, llama a `openmemory_complete_stage` e informa al usuario lo siguiente:
   - Qué actividades realizaste en la fase.
   - Qué evidencias produjiste.
   - El resultado de la verificación del Definition of Done.
   - Qué queda pendiente para la siguiente fase.
   - Y formula explícitamente la pregunta: *"¿Autorizas avanzar a la siguiente fase ([NOMBRE_SIGUIENTE_FASE])?"*
4. **Detención:** Una vez presentada la solicitud de aprobación, **DETENTE** y espera la respuesta afirmativa del usuario. No asumas nunca autorización implícita.
