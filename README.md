# OpenMemory

> **Zero-Dependency Operational Memory & Stage Governance Framework for OpenCode and AI Developer Agents**

[![Release Status](https://img.shields.io/badge/Release%20Status-Consumer--Ready%20Verified-blue.svg)](#-release-status)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.3.0-informational.svg)](package.json)

---

## 📌 Release Status

* **OpenMemory Version:** `0.3.0`
* **Status:** `Consumer-Ready Verified`
* **Target Environment:** OpenCode 1.18.34, Node.js v22.15.0+, local Git repositories.

OpenMemory v0.3.0 has completed formal empirical end-to-end validation in an isolated real consumer repository (`OpenMemory-Real-Consumer`) using the real packaged tarball (`openmemory-0.3.0.tgz`).

---

## 💡 What OpenMemory Is

OpenMemory is a host-independent, zero-dependency local operational memory, session continuity, research knowledge, ADR tracking, and stage governance framework for AI coding assistants.

It provides:
* **Persistent Memory Layer:** Local repository state persistence across agent session resets and context compactions.
* **Project Continuity Layer:** Structured narrative handoffs (`.openmemory/handoff.md`) preserving active goals, phase progress, and uncommitted work.
* **Knowledge & Evidence Persistence Layer:** Synthesized research knowledge and architectural decisions (ADRs) recorded with provenance metadata.
* **Governance & Context Infrastructure:** 12-phase Master Prompt state machine enforcing Definition of Done (DoD) criteria and human approval gates.
* **Host Independence:** Runs locally in standard Node.js environments without requiring custom IDE daemons, proprietary extensions, or cloud dependencies.

---

## 🎯 Problem OpenMemory Solves

When developing software using AI agents (such as OpenCode or Cursor):
1. **Context Loss on Compaction:** When LLM context windows fill up and compact, crucial architectural decisions, uncommitted task context, and active goals are lost.
2. **Session Discontinuity:** Starting a new chat session wipes out past progress summary and forces developers to re-explain project state manually.
3. **Uncoordinated Multi-Agent Work:** Simultaneous or sequential agent executions risk overwriting files or ignoring past decisions.
4. **Lack of Stage Governance:** Agents frequently attempt premature implementation before completing discovery or architecture design phases.

OpenMemory solves these problems by providing an automated, zero-dependency local storage engine and adapter suite that manages repository memory and stage governance directly on disk.

---

## 🛑 What OpenMemory Is NOT

To maintain clear architectural boundaries, OpenMemory is explicitly **NOT**:
* **NOT Another Agent or Orchestrator:** OpenMemory does not execute code, call LLM models directly, or make autonomous planning decisions.
* **NOT a Replacement for OpenCode or ADA:** OpenMemory is context and state infrastructure *for* OpenCode/ADA, not a competitor.
* **NOT a Vector Database by Default:** OpenMemory uses zero-dependency local JSON/Markdown disk files, avoiding external vector databases or native C++ binaries.
* **NOT a Microservices Architecture:** Runs embedded in process within the Node.js runtime.
* **NOT a Hard OS Sandbox:** Stage governance enforces prompt and protocol soft boundaries (`canModifyProductionCode()`). Hard file write permissions remain host IDE policies.
* **NOT a Transcript Replay Engine:** OpenMemory stores structured project state and synthesized knowledge, not raw raw line-by-line conversation transcripts.

---

## 🏗️ Architecture & Component Overview

```text
Host / Agent (OpenCode 1.18.34, Cursor, CLI)
  ↓
Adapters (CLI | MCP Server | OpenCode Plugin)
  ↓
StageEngine (12-Phase Master Prompt State Machine)
  ↓
StorageEngine Facade (Single Writer Architecture)
  ↓
Domain Authorities (Sessions, TaskDAG, ADRs, Knowledge, Handoff)
  ↓
PersistenceEngine (Atomic writes & Advisory Lock Manager)
  ↓
.openmemory/ Local Disk Storage
```

### Core Components
1. **`StorageEngine` Facade:** Unified Single Writer authority managing atomic disk writes, locks, backups, and state queries.
2. **`StageEngine` & Master Prompt:** Operational state machine defining 12 project phases (`DESCUBRIR`, `DEFINIR`, `INVESTIGAR`, `COMPARAR`, `DISEÑAR`, `PLANIFICAR`, `IMPLEMENTAR`, `VALIDAR`, `EVALUAR`, `CONSOLIDAR`, `ACTUALIZAR_MEMORIA`, `PREPARAR_CONTINUIDAD`).
3. **`SessionRegistry`:** Persistent registry tracking agent sessions, active statuses (`ACTIVE`, `IDLE`, `COMPACTED`, `COMPLETED`), and inactivity reconciliation.
4. **`TaskDAG`:** Multi-agent coordination task manager supporting task dependencies, atomic claims, and status updates.
5. **`ADRGovernance`:** MADR Architecture Decision Record authority with multi-agent voting consensus and explicit supersession.
6. **`KnowledgeTMS`:** Research knowledge repository storing synthesized findings with provenance metadata and query filters.
7. **`HandoffContinuity`:** Generates structured `.openmemory/handoff.md` narrative summaries.

---

## 🔄 Lifecycle & Session Model

OpenMemory synchronizes natively with OpenCode's session lifecycle:

```text
OpenCode Event            OpenMemory Action
─────────────────         ────────────────────────────────────────────
session.created    ───►  Registers active session record in StorageEngine
system.transform   ───►  Injects Stage Engine governance into System Prompt
session.status     ───►  Updates session status (ACTIVE / IDLE)
session.idle       ───►  Saves state checkpoint to project-state.json
session.compacted  ───►  Captures context handoff & writes handoff.md
npx openmemory     ───►  Executes CLI diagnostics, backups, install/uninstall
```

---

## 💾 Storage & Project State Structure

When installed in a consumer repository, OpenMemory initializes the following directory structure:

```text
my-project/
├── .openmemory/
│   ├── openmemory.json        # Manifest configuration
│   ├── project-state.json     # Global state index (stage, goal, sessions, roadmap)
│   ├── handoff.md             # Active cross-session narrative handoff
│   ├── adrs/                  # Architectural Decision Records (MADR format)
│   ├── knowledge/             # Indexed research knowledge JSON files
│   ├── logs/
│   │   └── events.jsonl       # Append-only structured event telemetry stream
│   ├── locks/                 # Temporary process advisory locks
│   └── backups/               # Atomic snapshot backups
├── .opencode/
│   └── plugins/
│       └── openmemory.ts      # OpenCode local plugin shim
├── opencode.json              # Configured MCP server definition
└── AGENTS.md                  # Delimited OpenMemory pointer block
```

---

## ⚖️ Conflict Governance & Context Assembly

When research knowledge or ADR proposals conflict with existing repository records:
1. **Contradiction Detection:** OpenMemory flags conflicting items with a `CONFLICTED` state.
2. **Safety Exclusion (`EXCLUDE_BOTH`):** Both conflicting items are temporarily excluded from system prompt context assembly to prevent LLM hallucinations.
3. **Governance Alert:** OpenMemory issues a governance notification requesting human intervention or formal ADR voting.
4. **Explicit Supersession:** When resolved, the old record is updated to `SUPERSEDED` and linked to the new authoritative record.

---

## 🚀 Installation & Usage

### 1. Installation

Install via npm:

```bash
npm install openmemory
```

Run the non-destructive consumer setup:

```bash
npx openmemory install
```

This command automatically:
* Initializes `.openmemory/` storage.
* Injects pointer blocks into `AGENTS.md`.
* Creates `.opencode/plugins/openmemory.ts` shim.
* Configures `opencode.json` with the OpenMemory MCP server.

### 2. Uninstallation

To remove integration shims while preserving historical project memory:

```bash
npx openmemory uninstall
```

This removes `.opencode/plugins/openmemory.ts`, cleans `opencode.json`, and removes the `AGENTS.md` block while keeping `.openmemory/` completely intact.

---

## 💻 CLI Command Reference

```bash
# View project context summary & status
npx openmemory status

# Complete consumer setup
npx openmemory install

# Revert consumer integration (preserves .openmemory/)
npx openmemory uninstall

# Create atomic snapshot backup
npx openmemory backup [label]

# List snapshot backups
npx openmemory list-backups

# Restore snapshot backup
npx openmemory restore <backup-id>

# Run storage engine health diagnostics & self-healing
npx openmemory diagnostics

# Clean up stale locks and temporary files
npx openmemory cleanup
```

---

## 🔌 Model Context Protocol (MCP) Tools

OpenMemory exposes 20 MCP tools over STDIO when configured in OpenCode, Cursor, or Claude Desktop:

| Tool Category | Tools | Description |
| :--- | :--- | :--- |
| **Status & Handoff** | `openmemory_status`<br>`openmemory_get_handoff` | Query context summary & narrative handoff |
| **Stage Governance** | `openmemory_get_stage`<br>`openmemory_start_stage`<br>`openmemory_complete_stage`<br>`openmemory_request_approval`<br>`openmemory_approve_stage`<br>`openmemory_reject_stage` | Manage 12-phase Master Prompt state machine & human gates |
| **Knowledge TMS** | `openmemory_record_knowledge`<br>`openmemory_query_knowledge` | Record & query synthesized research knowledge |
| **ADR Governance** | `openmemory_save_adr`<br>`openmemory_vote_adr` | Create MADR records & cast consensus votes |
| **Multi-Agent Tasks** | `openmemory_create_coordination_task`<br>`openmemory_list_coordination_tasks`<br>`openmemory_claim_coordination_task`<br>`openmemory_update_coordination_task` | Manage Task DAG coordination & atomic task claims |
| **Sessions & Admin** | `openmemory_register_session`<br>`openmemory_list_sessions`<br>`openmemory_create_backup`<br>`openmemory_run_diagnostics`<br>`openmemory_cleanup_locks` | Admin session registry & storage operations |

---

## ⚠️ Known Limitations

1. **Local Repository Scope:** OpenMemory v0.3.0 stores memory locally within `.openmemory/`. Remote multi-repository cloud sync is deferred to future releases.
2. **Process Concurrency Boundaries:** Advisory file locks protect concurrent local processes on the same machine. High-frequency network-distributed multi-region writes require a centralized database.
3. **Soft Governance Boundaries:** Stage governance enforces rules via prompt engineering and protocol responses. File system write permissions depend on the host IDE.

---

## 📜 Documentation Index

* [Architecture Overview (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)
* [Conceptual & Domain Contracts (`docs/CONTRACTS.md`)](docs/CONTRACTS.md)
* [Validation & Technical Evidence Log (`docs/VALIDATION-0.3.0.md`)](docs/VALIDATION-0.3.0.md)
* [Changelog (`CHANGELOG.md`)](CHANGELOG.md)

---

## 📄 License

[MIT License](LICENSE) © 2026 OpenMemory Contributors
