# Auditoría de Documentación y Release — OpenMemory v0.3.1

> **Fecha de Auditoría:** 2026-10-05<br>
> **Versión Objetivo:** `0.3.1`<br>
> **Estado:** Documentación Pre-Aplicación

---

## 📋 1. Resumen Ejecutivo y Objetivo

El presente documento constituye la auditoría forense documental y técnica para la alineación del repositorio OpenMemory con la versión **v0.3.1 REAL**.

La versión `0.3.1` fue introducida formalmente en el commit `8c8a430` (`release(v0.3.1): publish corrected consumer-ready release`) tras corregir problemas de resolución del `activePhase` en el hook `session.idle`, asegurar el fallback no nulo en `StorageEngine.getOrInitHandoff()` y verificar la suite de laboratorio de release (`.work/experiments/run-v031-release-lab.ts`).

No obstante, varios componentes documentales (`README.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`) permanecían desalineados o referenciando únicamente la versión v0.3.0 o conjuntos incompletos de comandos y herramientas MCP.

---

## 🔍 2. Inconsistencias Encontradas y Evidencia Empírica

### Inconsistencia 1: Discrepancia de Versión en `README.md`, `ARCHITECTURE.md` y `CONTRACTS.md`
* **Evidencia:** `package.json` declara `"version": "0.3.1"`. Sin embargo, `README.md` (líneas 7, 13, 17, 228), `docs/ARCHITECTURE.md` (líneas 1, 4) y `docs/CONTRACTS.md` (líneas 1, 5) declaran `0.3.0`.
* **Impacto:** Confusión al consumidor final respecto a qué versión está instalada y documentada.

### Inconsistencia 2: Ausencia de Entrada v0.3.1 en `CHANGELOG.md`
* **Evidencia:** `CHANGELOG.md` concluye en `## [0.3.0] - 2026-10-04`. No existe entrada formal para `0.3.1`.
* **Impacto:** Omisión de trazabilidad respecto al cierre de contratos, corrección de `autoHandoffOnIdle`, resolución de `activePhase` y publicación del tarball `openmemory-0.3.1.tgz`.

### Inconsistencia 3: Omición de Comandos CLI en `README.md`
* **Evidencia:** `src/cli.ts` implementa 23 grupos de comandos y subcomandos (`status`, `stage`, `approve`, `report`, `init`/`install`/`setup`, `uninstall`, `backup`, `list-backups`, `restore`, `diagnostics`, `cleanup`, `query`, `record`, `roadmap`, `phase`, `oss`, `migrate`, `adr`, `locks`, `sessions`, `context`, `task`, `logs`). `README.md` solo documenta 7 comandos (`status`, `install`, `uninstall`, `backup`, `list-backups`, `restore`, `diagnostics`, `cleanup`).
* **Impacto:** El desarrollador ignora el soporte CLI para ADRs, Tasks DAG, Sessions, Stage Engine, Context Assembly, Query/Record de Conocimiento, Logs, Roadmap y Migraciones.

### Inconsistencia 4: Conteo y Lista Incompleta de Herramientas MCP
* **Evidencia:** `src/mcp.ts` expone exactamente **29 herramientas MCP**. `README.md` afirma que existen "20 MCP tools" y `docs/ARCHITECTURE.md` también menciona 20 herramientas.
* **Impacto:** Falta de visibilidad sobre 9 herramientas MCP reales (`openmemory_reconcile_sessions`, `openmemory_rotate_event_logs`, `openmemory_save_oss_evaluation`, `openmemory_get_roadmap`, `openmemory_approve_phase`, `openmemory_reject_phase`, `openmemory_get_phase_report`, `openmemory_cleanup_locks`, `openmemory_run_diagnostics`).

### Inconsistencia 5: Documentación de Integración de Hooks OpenCode Incompleta
* **Evidencia:** `src/plugin.ts` captura 9 eventos/hooks de OpenCode:
  1. `session.created`
  2. `session.status`
  3. `session.idle`
  4. `session.compacted`
  5. `session.updated`
  6. `session.deleted`
  7. `session.error`
  8. `experimental.chat.system.transform`
  9. `experimental.session.compacting`
  10. `dispose`
  La documentación previa solo mencionaba una fracción de ellos.
* **Impacto:** Documentación imprecisa sobre la sincronización con el ciclo de vida del agente.

### Inconsistencia 6: Ambigüedad en Instrucciones de Instalación
* **Evidencia:** La documentación no diferenciaba claramente la instalación desde registro npm, la instalación mediante tarball local (`openmemory-0.3.1.tgz`), y el desarrollo/instalación desde el código fuente del repositorio.
* **Impacto:** Dificultad para consumidores instalando tarballs o evaluando el framework sin publicar en registro público.

---

## 🛠️ 3. Cambios Propuestos por Archivo

| Archivo Afectado | Cambios Propuestos | Justificación |
| :--- | :--- | :--- |
| `README.md` | Actualizar versión a `0.3.1`. Documentar los 23 comandos CLI reales, las 29 herramientas MCP en 9 categorías, los 10 hooks de OpenCode, la estructura `.openmemory/`, y los 3 métodos de instalación (npm, tarball, fuente). | Alineación completa con el código fuente real v0.3.1. |
| `CHANGELOG.md` | Agregar entrada `## [0.3.1] - 2026-10-05` detallando correcciones en `session.idle`, `activePhase`, validación de laboratorio v0.3.1 y exportación de tarball. | Cumplimiento de Keep a Changelog. |
| `docs/ARCHITECTURE.md` | Actualizar encabezado a v0.3.1, corregir conteo de herramientas MCP (29) y detallar la lista completa de hooks del plugin. | Precisión técnica arquitectónica. |
| `docs/CONTRACTS.md` | Actualizar versión a v0.3.1 en encabezado manteniendo las definiciones de dominio vigentes. | Coherencia contractual de dominio. |
| `docs/VALIDATION-0.3.1.md` | Crear informe formal de validación empírica para v0.3.1 (tarball `openmemory-0.3.1.tgz`, laboratorio release, suite completa). | Evidencia de release para v0.3.1. |
| `docs/VALIDATION-0.3.0.md` | Conservar intacto como registro histórico de la versión v0.3.0. | Preservación de trazabilidad histórica. |

---

## 📜 4. Decisiones sobre Documentación Existente

1. **Conservación de Registro Histórico v0.3.0 (`docs/VALIDATION-0.3.0.md`):**<br>
   Permanecerá intacto. No se borrará ni modificará su contenido técnico, ya que documenta el hito de validación alcanzado el 2026-10-04.
2. **Actualización de Documentación Activa (`README.md`, `ARCHITECTURE.md`, `CONTRACTS.md`):**<br>
   Se actualizarán para reflejar la versión activa `0.3.1` del paquete (`package.json`).
3. **No Sustitución Ciega de Cadenas:**<br>
   Las referencias a `0.3.0` dentro del bloque de changelog para v0.3.0 y en `docs/VALIDATION-0.3.0.md` se mantendrán.

---

## 🎯 5. Matriz de Validación Documental v0.3.1

| Componente | Estado Real en Código (`src/`) | Documentado en v0.3.1 |
| :--- | :--- | :--- |
| **Package Version** | `0.3.1` | SÍ |
| **CLI Commands** | 23 comandos/subcomandos | SÍ (completo con flags) |
| **MCP Tools** | 29 herramientas STDIO | SÍ (categorizadas) |
| **OpenCode Hooks** | 10 hooks en `plugin.ts` | SÍ |
| **Instalación Tarball** | `openmemory-0.3.1.tgz` | SÍ |
| **Governance Stage Engine** | 12 fases Master Prompt | SÍ |
