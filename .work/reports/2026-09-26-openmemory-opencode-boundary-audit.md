# OpenMemory — Auditoría Arquitectónica y de Frontera con OpenCode

**Fecha:** 2026-09-26  
**Tipo:** Auditoría de Arquitectura, Desacoplamiento y Continuidad de Conocimiento  
**Modo:** READ-ONLY Estricto (Sin modificaciones de código ni cambios de estado en Git)  
**Dictamen Global:** `STATE B — PARTIALLY ALIGNED` (Arquitectura sólida en almacenamiento y sesión, pero con vacíos en el modelo de trazabilidad de investigación y catálogo de conocimiento).  

---

## 1. Executive Summary

- `[CONCLUSION]` OpenMemory ha completado con éxito 4 fases de desarrollo (F1 Spike, F3 Core Storage & Session Handoff, F4 Integraciones y Empaquetado Producción), acumulando una matriz empírica de **73/73 pruebas pasadas** con latencia de almacenamiento de **2.10 ms/op**.
- `[OBSERVATION]` El motor actual (`StorageEngine`) gestiona eficientemente el estado de proyecto (`project-state.json`), la continuidad de sesión (`handoff.md`), las decisiones arquitectónicas (`ADRs`) y la compatibilidad con el servidor MCP (`openmemory_status`, `openmemory_get_handoff`, `openmemory_save_adr`, `openmemory_create_backup`, `openmemory_run_diagnostics`).
- `[CONCLUSION]` Se detectó que OpenMemory **NO duplica el runtime de ejecución de OpenCode** (no crea subagentes propios, ni motores de búsqueda web, ni cargadores de Skills paralelos). El plugin oficial en `.opencode/plugins/openmemory.ts` se suscribe limpiamente a los ganchos nativos de OpenCode.
- `[HYPOTHESIS]` Existe un vacío arquitectónico significativo: **OpenMemory no dispone de entidades explícitas para capturar y relacionar los hallazgos de investigación (`Research`, `Sources`, `Repositories`, `Findings`) generados por herramientas de exploración de OpenCode (`Scout`, `Explore`, `WebSearch`, `WebFetch`).**
- `[DECISION]` La arquitectura debe evolucionar hacia un modelo donde **OpenCode ejecute la investigación y OpenMemory conserve la trazabilidad del conocimiento estructurado y reutilizable** entre sesiones.

---

## 2. Repository State Audit

- `[EVIDENCE]` **Estado del Árbol de Trabajo:** `On branch master`, `nothing to commit, working tree clean`.
- `[EVIDENCE]` **Sincronización Git:**
  - `HEAD Local:` `8bc4d7fdec5260ff17e424d635e5566887be12e3`
  - `origin/master:` `8bc4d7fdec5260ff17e424d635e5566887be12e3`
  - Estado: `HEAD == origin/master` (100% sincronizado).
- `[EVIDENCE]` **Últimos Commits:**
  1. `8bc4d7f` — `feat(benchmark): complete F4.5 system validation, benchmark, and Phase 4 release`
  2. `3fff00f` — `feat(packaging): implement F4.4 production packaging and distribution framework`
  3. `2ff763b` — `feat(installer): implement non-destructive installer and repository integrator (F4.3)`
  4. `28bbb23` — `feat(mcp): implement F4.2 Model Context Protocol adapter engine using official SDK`
  5. `14eba79` — `feat(skills): implement F4.1 operational SOP skills suite`
- `[CONCLUSION]` No existen cambios colgados, archivos huérfanos ni desincronización entre local y remoto.

---

## 3. Four-Phase Comprehensive Audit (Fases 1 a 4)

### Fase 1 & 2 — Investigación e Integración Inicial (Spike)
* **Objetivo:** Probar viabilidad de integración con ganchos de sesión de OpenCode.
* **Archivos Afectados:** `.opencode/plugins/openmemory-spike.ts`, `.openmemory/spike/`
* **Pruebas:** `.work/experiments/run-spike-tests.ts` (6/6 PASADAS).
* **Clasificación por Requisito:**
  - `session.created` hook: `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - `session.idle` hook: `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - `session.compacted` hook: `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.

### Fase 3 — Motor de Almacenamiento Core y Continuidad (F3.1–F3.5)
* **Objetivo:** Construir motor de persistencia atómica (`StorageEngine`), handoff narrativo (`handoff.md`), registros ADR y diagnóstico.
* **Archivos Afectados:** `src/storage.ts`, `src/cli.ts`, `.opencode/plugins/openmemory.ts`, `.opencode/commands/`
* **Pruebas:** `run-f31` a `run-f35` (34/34 PASADAS).
* **Clasificación por Requisito:**
  - Escritos atómicos (`.tmp` + `renameSync` con retry EPERM): `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - Parser de secciones Handoff y preservación de notas humanas: `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - Sistema de Registros ADR (MADR format): `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - Motor de Diagnóstico y Autosanado (`runDiagnostics`): `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.

### Fase 4 — Integración Avanzada OpenCode & MCP (F4.1–F4.5)
* **Objetivo:** Skills SOP, Adaptador MCP SDK, Instalador no destructivo, Empaquetado npm y Benchmark.
* **Archivos Afectados:** `src/mcp.ts`, `src/installer.ts`, `src/index.ts`, `package.json`, `tsconfig.json`, `README.md`, `LICENSE`, `.opencode/skills/`
* **Pruebas:** `run-f41` a `run-f45` (33/33 PASADAS).
* **Clasificación por Requisito:**
  - Skills SOP Declarativos (4 skills en `.opencode/skills/`): `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - Adaptador MCP oficial (`@modelcontextprotocol/sdk`): `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - Instalador No Destructivo con bloque delimitado `<!-- OPENMEMORY:START -->`: `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - Empaquetado `npm` (`dist/`, `exports`, shebang `cli.js`): `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.
  - Benchmark E2E & Latencia (2.10 ms/op): `IMPLEMENTED`, `INTEGRATED`, `TESTED`, `DOCUMENTED`.

---

## 4. Current Architecture (As-Is)

```markdown
┌────────────────────────────────────────────────────────────────────────┐
│                          OPENCODE RUNTIME                              │
│  ┌──────────────────────┐   ┌─────────────────┐   ┌─────────────────┐  │
│  │ OpenCode Hooks       │   │ Slash Commands  │   │ SOP Skills      │  │
│  │ (created/idle/comp)  │   │ (/status,/hand) │   │ (.opencode/sk)  │  │
│  └──────────┬───────────┘   └────────┬────────┘   └────────┬────────┘  │
└─────────────┼────────────────────────┼─────────────────────┼───────────┘
              │                        │                     │
              ▼                        ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        OPENMEMORY CORE LAYER                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ StorageEngine (src/storage.ts)                                   │  │
│  │  ├── openmemory.json (Manifest & Config)                         │  │
│  │  ├── project-state.json (Goal, Phase, Tasks, SessionRunCount)    │  │
│  │  ├── handoff.md (Progress, ADRs, Next Steps, Developer Notes)    │  │
│  │  ├── adrs/ADR-xxx.md (Architecture Decision Records)             │  │
│  │  └── backups/ (Atomic Pre-modification Snapshots)                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────┐      ┌─────────────────────────────┐  │
│  │ MCP Server (src/mcp.ts)     │      │ Installer (src/installer)   │  │
│  │ (5 STDIO Tools)             │      │ (AGENTS.md injection)       │  │
│  └─────────────────────────────┘      └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

`[OBSERVATION]` La arquitectura As-Is gestiona impecablemente el estado operacional y de sesión, pero carece de un modelo de persistencia para el conocimiento descubierto por las herramientas de investigación de OpenCode.

---

## 5. OpenCode ↔ OpenMemory Boundary Matrix

| Capacidad | OpenCode | OpenMemory | ¿Quién ejecuta? | ¿Quién conserva el resultado? |
|---|---|---|---|---|
| **Web search** |  Sí | ❌ No | OpenCode (`WebSearch`) | OpenMemory (vía Research Record) |
| **Web fetch** |  Sí | ❌ No | OpenCode (`WebFetch`) | OpenMemory (vía Source Artifact) |
| **Explore** |  Sí | ❌ No | OpenCode (`Explore`) | OpenMemory (vía Research Finding) |
| **Scout** |  Sí | ❌ No | OpenCode (`Scout`) | OpenMemory (vía Repository Finding) |
| **Repository inspection** |  Sí | ❌ No | OpenCode (`git`/`file_view`) | OpenMemory (vía Repo Reference) |
| **Dependency research** |  Sí | ❌ No | OpenCode | OpenMemory (vía ADR / Source Record) |
| **Agent execution** |  Sí | ❌ No | OpenCode Runtime | OpenMemory (no ejecuta agentes) |
| **Skill discovery** |  Sí | ❌ No | OpenCode Engine | OpenMemory (Cataloga disponibilidad) |
| **Skill loading** |  Sí | ❌ No | OpenCode Engine | OpenMemory (no carga código en RAM) |
| **Skill execution** |  Sí | ❌ No | OpenCode Engine | OpenMemory (Registra efectividad) |
| **Permissions** |  Sí | ❌ No | OpenCode Security | OpenMemory (Respeta permisos OS) |
| **Memory** | ❌ No |  Sí | OpenCode produce | OpenMemory persiste |
| **Research history** | ❌ No |  Sí | OpenCode investiga | OpenMemory indexa historia |
| **Findings** | ❌ No |  Sí | OpenCode descubre | OpenMemory relaciona hallazgos |
| **Source references** | ❌ No |  Sí | OpenCode lee URLs | OpenMemory indexa fuentes/citas |
| **Repository references** | ❌ No |  Sí | OpenCode clona/lee | OpenMemory guarda repos/versiones |
| **Decisions** | ❌ No |  Sí | Desarrollador/Agente | OpenMemory persiste en ADRs |
| **Session continuity** | ❌ No |  Sí | OpenCode dispara | OpenMemory reconstruye estado |
| **Handoff** | ❌ No |  Sí | OpenCode compila | OpenMemory actualiza handoff.md |

`[CONCLUSION]` La frontera actual es limpia en cuanto a ejecución (OpenCode ejecuta el 100%), pero OpenMemory actualmente solo conserva `ProjectState`, `Handoff` y `ADRs`, perdiendo los resultados de `WebSearch`, `Scout`, `Explore` y referencias a repositorios OSS externos.

---

## 6. Principle of Research Persistence Validation

Scenario evaluated:
```text
OpenCode (Scout / Explore / WebSearch / WebFetch) 
       └─> Investigación / Hallazgos 
                 └─> OpenMemory (¿Existe persistencia estructurada?)
```

- `[EVIDENCE]` Si OpenCode ejecuta un `Scout` o `WebSearch` para evaluar una librería OSS, los hallazgos se escriben temporalmente en la ventana de contexto del agente. Al ocurrir una compactación de sesión (`session.compacted`), **dicha investigación se pierde o se sintetiza vagamente en el texto plano de `handoff.md`**.
- `[CONCLUSION]` No existe actualmente una entidad `Research`, `Source` o `Finding` estructurada en `StorageEngine`. Los hallazgos de investigación no son trazables ni consultables por futuras sesiones salvo que se conviertan manualmente en un `ADR`.

---

## 7. MCP Tools Audit

### Inventario Actual (5 Herramientas Implemetadas en `src/mcp.ts`):
1. `openmemory_status`: Sintetiza el resumen de contexto (`formatProjectContextSummary()`).
2. `openmemory_get_handoff`: Recupera la narrativa de continuidad (`handoff.md`).
3. `openmemory_save_adr`: Crea/actualiza un Registro de Decisión Arquitectónica (`ADR-xxx.md`).
4. `openmemory_create_backup`: Genera una captura de respaldo atómica en `.openmemory/backups/`.
5. `openmemory_run_diagnostics`: Diagnóstica, limpia archivos `.tmp` y autosana el almacenamiento.

### Evaluación de Brechas de MCP:
- `[OBSERVATION]` Faltan herramientas MCP para que los agentes de OpenCode registren hallazgos de investigación estructurados (`Research`, `Sources`, `Repositories`, `Findings`).
- `[HYPOTHESIS]` En lugar de crear 5 herramientas MCP individuales y redundantes (`openmemory_save_research`, `openmemory_save_source`, `openmemory_save_repository`, `openmemory_save_finding`), **es arquitectónicamente superior extender el modelo de datos de `StorageEngine` e implementar una herramienta unificada de conocimiento: `openmemory_record_knowledge` y una de consulta: `openmemory_query_knowledge`.**

---

## 8. Knowledge Model Audit

Conceptos evaluados en el modelo de datos actual:

- `ProjectState` / `TaskState`: `IMPLEMENTED` (Estructurado en `project-state.json`).
- `Handoff`: `IMPLEMENTED` (Estructurado en `handoff.md`).
- `ADR`: `IMPLEMENTED` (Estructurado en `.openmemory/adrs/ADR-xxx.md`).
- `Backup`: `IMPLEMENTED` (Estructurado en `.openmemory/backups/`).
- `Research`: `NOT IMPLEMENTED` (Falta entidad explícita).
- `Source` / `Reference`: `NOT IMPLEMENTED` (Falta registro de URLs, commits, versiones).
- `Repository`: `NOT IMPLEMENTED` (Falta catálogo de repositorios evaluados/reutilizados).
- `Finding`: `NOT IMPLEMENTED` (Falta estructuración de descubrimientos de Scout/Explore).
- `Skill Provenance`: `PARTIAL` (Existen archivos de Skills en `.opencode/skills/`, pero sin catálogo de uso u origen en `StorageEngine`).

`[CONCLUSION]` Una investigación NO es simplemente una memoria de sesión, ni una fuente es un ADR. El modelo debe permitir la relación:  
`Investigación -> Fuentes / Repositorios -> Findings -> Decisiones (ADR) -> Impacto en Proyecto`.

---

## 9. Research ↔ Knowledge Traceability Audit

- `[EVIDENCE]` En el código actual de `src/storage.ts`, los únicos métodos de escritura son `saveProjectState()`, `saveHandoff()`, `saveManifest()`, `saveADR()` y `createBackup()`.
- `[CONCLUSION]` No existe trazabilidad estructurada que conecte una URL investigada o un commit de un repositorio inspeccionado por `Scout` con el `ADR` resultante o con las tareas afectadas.

---

## 10. Skills Architecture Audit

- **Runtime (OpenCode):** OpenCode descubre, carga y ejecuta los archivos `.md` en `.opencode/skills/*`.
- **Conocimiento (OpenMemory):** OpenMemory no debe implementar un runtime propio de Skills.
- `[EVIDENCE]` OpenMemory declaró exitosamente 4 Skills SOP en `.opencode/skills/` (F4.1), los cuales son leídos nativamente por OpenCode.
- `[OBSERVATION]` OpenMemory no lleva actualmente un registro de qué Skills se usaron en qué sesiones ni con qué efectividad.

---

## 11. Agents / Subagents Audit

- `[EVIDENCE]` Al inspeccionar `src/`, `.opencode/` y `package.json`, **OpenMemory NO contiene ningún motor de subagentes, ni bucle de ejecución de agentes, ni llamador de LLM.**
- `[CONCLUSION]` OpenMemory cumple al 100% la regla de no crear un runtime paralelo de agentes. Se comporta exclusivamente como una capa de memoria y continuidad consumida por OpenCode.

---

## 12. Duplication Analysis

- **Categoría A (Correcto - OpenMemory conserva lo producido por OpenCode):**
  - Ganchos de sesión (`session.created`, `session.idle`, `session.compacted`).
  - Preservación de handoff y notas de desarrollador.
  - Almacenamiento de ADRs y diagnósticos.

- **Categoría B (Posible duplicación):**
  - Ninguna detectada en el código actual.

- **Categoría C (Justificado):**
  - Comando CLI `openmemory install` y bloque `<!-- OPENMEMORY:START -->`: Justificado para habilitar la instalación no destructiva en repositorios sin depender exclusivamente del IDE.

- **Categoría D (Arquitectura problemática):**
  - Ninguna detectada. OpenMemory no ha creado un runtime paralelo.

---

## 13. Documentation Consistency Audit

- `[EVIDENCE]` Se auditaron `README.md`, `AGENTS.md`, `.work/CURRENT.md` y todos los reportes en `.work/reports/`.
- `[EVIDENCE]` Toda la documentación coincide con el código compilado en `dist/` y los 73 tests empíricos.
- `[OBSERVATION]` Existe una brecha conceptual en la documentación futura: el roadmap original no especificaba con claridad la separación entre *Investigación de OpenCode* y *Conocimiento Estructurado de OpenMemory*.

---

## 14. Plan & Roadmap Alignment

- `[CONCLUSION]` Las Fases 1, 2, 3 y 4 se han completado e implementado con un 100% de éxito empírico (73/73 tests).
- `[DECISION]` El plan para la siguiente fase (Fase 5 / Evolución de Memoria) **requiere una revisión arquitectónica** para enfocarse en la **Persistencia y Trazabilidad del Conocimiento de Investigación** (`Research & Knowledge Graph`) en lugar de añadir más herramientas desconectadas.

---

## 15. Gaps Identificados

1. **Gap K-1 (Falta de Modelo de Investigación):** No existen estructuras de datos ni almacenamiento para `Research`, `Source`, `Repository` y `Finding`.
2. **Gap K-2 (Trazabilidad de Investigaciones):** Los hallazgos de `Scout`/`Explore`/`WebSearch` se pierden al compactar sesión.
3. **Gap K-3 (Herramientas MCP de Conocimiento):** No existen herramientas MCP para guardar o consultar el conocimiento de investigación acumulado.
4. **Gap K-4 (Métricas de Skills):** No hay registro de qué Skills se ejecutaron y su impacto en la sesión.

---

## 16. Riesgos Identificados

1. **Riesgo R-1 (Duplicación de MCP Tools):** Crear un MCP tool individual para cada tipo de dato (`save_source`, `save_repo`, `save_finding`) inflaría la especificación MCP. *Mitigación:* Crear una interfaz genérica de conocimiento `openmemory_record_knowledge` y `openmemory_query_knowledge`.
2. **Riesgo R-2 (Sobre-complejidad de Grafo):** Intentar implementar una base de datos de grafos compleja rompería la premisa de `zero-dependency`. *Mitigación:* Usar modelos JSON estructurados atómicos en `.openmemory/knowledge/` mantenidos por `StorageEngine`.

---

## 17. Nueva Arquitectura Objetivo (To-Be Hypothesis)

```markdown
                         OPENCODE RUNTIME
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
     Agents                 Skills                 Tools
  (Scout, Explore)    (OpenCode Runtime)    (WebSearch, WebFetch)
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                               ▼ (Resultados & Hallazgos)
                               │
                     ┌──────────────────┐
                     │ OpenMemory Core  │
                     ├──────────────────┤
                     │ Project State    │
                     │ Session Handoff  │
                     │ ADRs             │
                     │ Research Engine  │ ◄─── (NUEVO)
                     │  ├── Sources     │
                     │  ├── Repos       │
                     │  └── Findings    │
                     │ Knowledge Index  │ ◄─── (NUEVO)
                     └──────────────────┘
                               │
                               ▼
                        FUTURAS SESIONES
```

---

## 18. Propuesta para la Siguiente Fase: Fase 5 — Framework de Trazabilidad y Conocimiento de Investigación (Research & Knowledge Engine)

### Definición del Problema:
Las investigaciones realizadas por OpenCode (`Scout`, `Explore`, `WebSearch`) se pierden tras la compactación de contexto o el reinicio de sesión, obligando al agente a re-investigar repositorios o fuentes externas repetidamente.

### Causa Raíz:
`StorageEngine` solo gestiona `project-state.json`, `handoff.md` y `adrs/`, sin entidades para fuentes, repositorios ni hallazgos.

### Cambio Arquitectónico Requerido:
1. Extender `StorageEngine` para soportar `.openmemory/knowledge/research.json` y `.openmemory/knowledge/sources.json`.
2. Añadir MCP Tools unificados: `openmemory_record_knowledge` y `openmemory_query_knowledge`.
3. Actualizar el plugin `.opencode/plugins/openmemory.ts` para capturar automáticamente evidencias de investigación.

### Criterio de Aceptación:
- Tasa de éxito del 100% en nuevas pruebas empíricas.
- Trazabilidad completa `Investigación -> Fuente -> Hallazgo -> Decisión`.
- Cero dependencias adicionales (mantiene Clean-Room MIT).

---

## 19. Evidence Index & References

- **Core Engine:** [src/storage.ts](file:///c:/OpenMemory/src/storage.ts#L1-L100)
- **MCP Server Adapter:** [src/mcp.ts](file:///c:/OpenMemory/src/mcp.ts#L1-L80)
- **Non-Destructive Installer:** [src/installer.ts](file:///c:/OpenMemory/src/installer.ts#L1-L50)
- **Public Export Surface:** [src/index.ts](file:///c:/OpenMemory/src/index.ts#L1-L4)
- **Official OpenCode Plugin:** [.opencode/plugins/openmemory.ts](file:///c:/.opencode/plugins/openmemory.ts#L1-L50)
- **Empirical Test Runner F4.5:** [.work/experiments/run-f45-benchmark-tests.ts](file:///c:/OpenMemory/.work/experiments/run-f45-benchmark-tests.ts#L1-L44)
- **Evidencia F4.5 Result JSON:** [.work/evidence/phase-4.5-benchmark-test-results.json](file:///c:/OpenMemory/.work/evidence/phase-4.5-benchmark-test-results.json)
- **Reporte de Implementación F4.5:** [.work/reports/2026-09-25-2359-phase-4.5-implementation-report.md](file:///c:/OpenMemory/.work/reports/2026-09-25-2359-phase-4.5-implementation-report.md)

---

## 20. Dictamen Final

**ESTADO GLOBAL:** `STATE B — PARTIALLY ALIGNED`

- La arquitectura actual de OpenMemory es **completamente limpia y no duplica el runtime de OpenCode**.
- Sin embargo, existe un **gap claro de conservación de conocimiento de investigación**, el cual debe ser abordado en la Fase 5 mediante la extensión del modelo de datos sin romper las premisas de `zero-dependency` y `Clean-Room MIT`.

*Audit completed in READ-ONLY mode. Awaiting explicit user feedback on Phase 5 Architectural Proposal.*
