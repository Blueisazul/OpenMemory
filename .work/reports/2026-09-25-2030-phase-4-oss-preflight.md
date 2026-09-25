# OpenMemory — Phase 4 OSS & Technical Preflight Discovery Report

**Date:** 2026-09-25 20:30  
**Phase:** Phase 4 — Operational SOP Skills, MCP Adapter Engine & Production Distribution Framework  
**Status:** `READY_FOR_IMPLEMENTATION` (Awaiting Explicit User Authorization)  

---

## 1. Executive Summary & Verification of Preflight Conditions

In accordance with project guidelines and the mandate to evaluate existing open-source and native solutions before building custom code:

| Condition | Status | Empirical Evidence / Detail |
|---|---|---|
| **Repository Sync** | **VERIFIED** | Local repo synchronized with `origin/master` (HEAD: `f2bc86f`). `git status` clean (`nothing to commit, working tree clean`). |
| **Read-Only Mode** | **VERIFIED** | Discovery executed strictly in read-only mode. Zero production code files modified. |
| **Baseline Non-Regression** | **VERIFIED** | **40/40 Baseline Tests PASSED** (Spike: 6/6, Storage: 4/4, Plugin: 8/8, Handoff: 7/7, Context: 7/7, E2E: 8/8). |
| **OSS & Native Analysis** | **VERIFIED** | Evaluated OpenCode native skill engine, `@modelcontextprotocol/sdk` (MIT), standard npm `bin`/`exports` packaging, and MADR format standards. |
| **Report Generation** | **VERIFIED** | Documented in `.work/reports/2026-09-25-2030-phase-4-oss-preflight.md`. |
| **Implementation Gate** | **HOLD** | Stopped prior to any code modification, awaiting explicit user authorization. |

---

## 2. Component-by-Component Classification & Trade-off Analysis

### Component 1: SOP Skills Suite (F4.1)
* **Classification:** **USAR NATIVO**
* **Evaluated Options:** Custom TypeScript skill parser vs OpenCode Native Skill Engine.
* **Findings:** OpenCode natively discovers, parses YAML frontmatter, and loads skills placed under `.opencode/skills/<name>/SKILL.md`. Writing custom TypeScript parser code would duplicate native OpenCode capabilities.
* **Decision:** OpenMemory will solely supply declarative Markdown SOP files (`skill-architecture-review`, `skill-session-handoff`, `skill-qa-verification`, `skill-security-audit`) under `.opencode/skills/`.

### Component 2: MCP Server Adapter Engine (F4.2)
* **Classification:** **INTEGRAR OSS** (`@modelcontextprotocol/sdk`)
* **Evaluated Options:** Custom STDIO JSON-RPC 2.0 parser vs `@modelcontextprotocol/sdk`.
* **Findings:**
  * `@modelcontextprotocol/sdk` is the official, MIT-licensed TypeScript SDK maintained by Anthropic/MCP ecosystem.
  * It provides 100% protocol spec compliance, schema validation, tool registration, and STDIO JSON-RPC transport handling out of the box.
  * Eliminates custom protocol maintenance and guarantees cross-client compatibility (Cursor, Claude Desktop, Antigravity IDE).
* **Decision:** Add `@modelcontextprotocol/sdk` and `zod` as minimal production dependencies, delegating MCP tool calls (`openmemory_status`, `openmemory_get_handoff`, `openmemory_save_adr`, `openmemory_create_backup`, `openmemory_run_diagnostics`) directly to `StorageEngine`.

### Component 3: Non-Destructive Installer & Integrator (F4.3)
* **Classification:** **IMPLEMENTAR PROPIO** (Minimal ~30 lines in `src/installer.ts`)
* **Evaluated Options:** `remark`/`mdast` AST parser libraries vs lightweight string delimiter replacement.
* **Findings:**
  * Heavy Markdown AST libraries add 10MB+ dependency bloat for a simple single-file HTML block injection (`<!-- OPENMEMORY:START -->` ... `<!-- OPENMEMORY:END -->`).
  * A minimal (~30 lines) custom regex-delimited replacer in `src/installer.ts` is 100% deterministic, zero-dependency, and handles timestamped backups (`.openmemory/backups/AGENTS.md.<ts>.bak`) atomically.
* **Decision:** Implement minimal non-destructive installer in `src/installer.ts`.

### Component 4: Packaging & Distribution Framework (F4.4)
* **Classification:** **USAR NATIVO**
* **Evaluated Options:** Custom bundlers (webpack/rollup) vs standard `package.json` `bin`/`exports` + `tsc`.
* **Findings:** Node.js and npm provide native support for CLI executables (`"bin": { "openmemory": "./dist/cli.js" }`), module exports (`"exports": ...`), and TypeScript compilation (`tsc`).
* **Decision:** Use native `package.json` fields and standard `tsc` build scripts without external bundler overhead.

### Component 5: Architectural Decision Records Format
* **Classification:** **USAR NATIVO + COMPATIBILIDAD MADR OSS**
* **Evaluated Options:** `adr-tools` (bash dependency) vs native `StorageEngine` MADR Markdown persistence.
* **Findings:** `StorageEngine` already provides cross-platform atomic MADR file management (`saveADR`, `listADRs`, `getADR`).
* **Decision:** Retain `StorageEngine` as SSOT while maintaining 100% string compatibility with MADR v3 standard.

---

## 3. Updated Phase 4 Implementation Roadmap & Test Plan

| Sub-phase | Target Deliverable | Classification | Implementation Detail |
|---|---|---|---|
| **F4.1** | SOP Skills Suite | **USAR NATIVO** | `.opencode/skills/skill-architecture-review/SKILL.md`, `skill-session-handoff/SKILL.md`, `skill-qa-verification/SKILL.md`, `skill-security-audit/SKILL.md` |
| **F4.2** | MCP Server Adapter | **INTEGRAR OSS** | `src/mcp.ts` integrating `@modelcontextprotocol/sdk` over STDIO JSON-RPC |
| **F4.3** | Non-Destructive Installer | **IMPLEMENTAR PROPIO** | `src/installer.ts` with delimited HTML comment block injection and atomic backups |
| **F4.4** | Packaging & Distribution | **USAR NATIVO** | `package.json` (`bin`, `exports`), `tsconfig.json`, `dist/` build output |
| **F4.5** | E2E System Validation Suite | **IMPLEMENTAR PROPIO** | `.work/experiments/run-f4-e2e-tests.ts` (8 empirical test cases) |

---

## 4. Preflight Conclusion & Authorization Gate

The OSS Preflight Discovery for Phase 4 is **`READY_FOR_IMPLEMENTATION`**.

**Next Step:** Detenido a la espera de autorización explícita del usuario para iniciar la implementación de la Sub-fase F4.1.
