# Changelog

All notable changes to OpenMemory are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-10-04

### Release Status
**Consumer-Ready Verified** (`openmemory-0.3.0.tgz`)

### Added
* **Core Engine:**
  * Single Writer architecture facade (`StorageEngine`) orchestrating process concurrency and atomic storage mutations.
  * Modularized domain authorities (`SessionRegistry`, `TaskDAG`, `ADRGovernance`, `KnowledgeTMS`, `HandoffContinuity`).

* **Adapters & Distribution:**
  * **OpenCode Plugin Adapter (`openmemory/plugin`):** Native plugin shim supporting OpenCode lifecycle events (`session.created`, `session.idle`, `session.compacted`, `experimental.chat.system.transform`, `experimental.session.compacting`, `dispose`).
  * **MCP Server Adapter (`openmemory/mcp`):** STDIO Model Context Protocol server exposing 20 operational tools for status inspection, ADR voting, knowledge recording/querying, task DAG coordination, and stage management.
  * **Consumer Installer (`openmemory/installer`):** Non-destructive consumer installer (`npx openmemory install`) and uninstaller (`npx openmemory uninstall`). Deploys local shims, configures `opencode.json`, and manages delimited pointer blocks in `AGENTS.md`.
  * **CLI Engine (`openmemory/cli`):** Terminal command runner supporting status, installation, uninstallation, backup snapshot management, and diagnostics.

* **Persistence:**
  * Atomic write-then-rename persistence engine (`PersistenceEngine`) preventing partial file corruption on process kill.
  * Advisory file lock manager (`.openmemory/locks/`) with TTL auto-expiration for concurrency control.
  * Structural backup creation (`.openmemory/backups/`) and snapshot recovery CLI commands.
  * Append-only event telemetry logger (`.openmemory/logs/events.jsonl`).

* **Sessions & Task DAG:**
  * Canonical session registry tracking active/idle/compacted agent sessions, identity resolution, and inactivity reconciliation.
  * Multi-agent coordination Task DAG with atomic task claiming, dependency graphs, and status updates.

* **Knowledge & ADR Governance:**
  * Research knowledge storage (`KnowledgeTMS`) with category filtering, provenance tracking, keyword querying, and conflict resolution.
  * MADR decision records (`ADRGovernance`) supporting status transitions (`PROPOSED` -> `ACCEPTED` / `REJECTED`), multi-agent voting consensus, and explicit supersession.
  * Conflict governance flow (`CONTRADICTS` -> `CONFLICTED` -> `EXCLUDE_BOTH` -> `GOVERNANCE NOTICE` -> `SUPERSEDES`).

* **Validation & Documentation:**
  * End-to-end integration validation harness for real consumer project testing (`run-consumer-e2e-tests.ts`).
  * Formal technical documentation (`docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, `docs/VALIDATION-0.3.0.md`).

### Fixed
* Fixed fallback resolution for `activePhase` in `StorageEngine.getOrInitHandoff()` to prevent rendering `Current Phase: undefined` in `.openmemory/handoff.md`.
* Fixed package export boundaries in `package.json` to cleanly export public entrypoints (`.`, `./storage`, `./stage-engine`, `./plugin`, `./mcp`, `./installer`, `./cli`) while encapsulating internal private modules.
