# OpenMemory Phase 1 — Architectural Decision Records (ADRs)

**Project:** OpenMemory (`https://github.com/Blueisazul/OpenMemory`)  
**Phase:** 1 — Exhaustive Investigation & Technical Design  
**Date:** September 2026

---

## DEC-001: Zero-Core-Modification Integration Strategy for OpenCode

### Context
OpenMemory aims to provide persistent context and operational memory for developer agents, prioritizing OpenCode compatibility. We needed to decide whether to fork OpenCode, modify its internal source, build an external proxy wrapper, or utilize native extension mechanisms.

### Evidence
OpenCode provides a robust, native extension surface:
1. TypeScript plugin system (`@opencode-ai/plugin`) with typed lifecycle hooks (`session.created`, `session.compacted`, `session.idle`).
2. Project-level instructions (`AGENTS.md`).
3. Custom commands (`.opencode/commands/*.md`).
4. On-demand skills (`.opencode/skills/`).
5. Context-isolated subagents (`.opencode/agents/`).

### Alternatives
1. **Fork OpenCode**: High maintenance overhead; breaks upstream synchronization; creates user adoption friction.
2. **External Proxy Daemon**: Adds process management complexity, network IPC overhead, and port collision risks.
3. **Native Extension Surface (Plugins + Commands + Skills)**: Uses official APIs, zero core modification, 100% portable.

### Decision
Use OpenCode's native extension surface (Plugins, Commands, Skills, Subagents) exclusively. OpenMemory will **NOT** fork or modify the OpenCode core codebase.

### Consequences
* **Positive**: 100% upstream compatibility; instant installation via repository files or plugins; zero maintenance of a custom OpenCode fork.
* **Negative**: Restricted to capabilities exposed by OpenCode's public plugin & hook APIs.

### Confidence
**HIGH**

---

## DEC-002: Minimal Viable Memory Storage Engine for v0.1 (Markdown + JSON State)

### Context
OpenMemory requires a persistent storage engine to maintain cross-session task state, handoff context, and architectural decisions across agent sessions.

### Evidence
Developer workflows rely heavily on Git, text diffing, human readability, and deterministic task state tracking. Vector databases and embeddings introduce non-deterministic retrieval, extra latency, local native compilation friction (e.g. SQLite vector extensions on Windows/macOS), and token costs.

### Alternatives
1. **Vector DB (Chroma/Qdrant/LanceDB)**: Enables semantic similarity search, but adds native binaries, embedding latency, and distance threshold tuning issues.
2. **Relational Database (SQLite only)**: Fast local queries, but binary format makes Git diffing and direct human auditing difficult.
3. **Markdown Documents + Structured JSON State Engine**: Plaintext files in `.openmemory/` (`handoff.md`, `project-state.json`, `adrs/*.md`).

### Decision
Adopt a **Markdown + Structured JSON State Engine** for OpenMemory v0.1, combined with fast local lexical search (FTS / string matching).

### Consequences
* **Positive**: 100% Git-friendly; fully human-readable; 0 token cost for embedding generation; zero native binary dependencies; deterministic state tracking.
* **Negative**: Semantic similarity search based on high-dimensional vectors is not supported in v0.1 (deferred to optional future plugins if proven necessary).

### Confidence
**HIGH**

---

## DEC-003: Exclusion of Embeddings, Vector Databases, RAG, and Knowledge Graphs in v0.1

### Context
Many AI memory projects immediately implement vector embeddings, RAG pipelines, graph databases, or secondary LLM background processes. We evaluated whether these components are required for an operational coding agent memory framework.

### Evidence
In software engineering, agent tasks depend on exact code references, file paths, step-by-step task progress, and explicit architectural decisions. Semantic vector search often retrieves loosely related snippets while missing exact structural state.

### Alternatives
1. **Full RAG & Vector Engine in v0.1**: Complex setup, high resource consumption, non-deterministic.
2. **Zero-Vector Deterministic State Engine in v0.1**: Focused strictly on active task handoffs, ADR tracking, and structured project state.

### Decision
Explicitly exclude embeddings, vector databases, RAG pipelines, Knowledge Graphs, and secondary LLM background services from OpenMemory v0.1.

### Consequences
* **Positive**: Eliminates scope creep; ultra-fast startup (<10ms); guaranteed cross-platform compatibility without heavy Python or WASM dependencies.
* **Negative**: Cannot perform fuzzy semantic concept discovery across millions of lines of unindexed text without exact keyword matches.

### Confidence
**HIGH**

---

## DEC-004: Non-Destructive Coexistence Strategy for Target Repositories

### Context
When OpenMemory is installed into a project repository, it must coexist with existing `AGENTS.md` files, `opencode.json` configurations, commands, and skills without silently overwriting user customization.

### Evidence
Overwriting user configuration destroys project trust and breaks existing workflow rules defined by developer teams.

### Alternatives
1. **Overwriting Existing `AGENTS.md`**: Destructive; unacceptable risk.
2. **Creating Isolated `.openmemory/` Directory + Non-Destructive Merging**: All OpenMemory files reside in `.openmemory/`; injections into root `AGENTS.md` use explicit HTML comment block delimiters (`<!-- OPENMEMORY:START -->` ... `<!-- OPENMEMORY:END -->`) with timestamped backups.

### Decision
Implement a non-destructive integration strategy:
1. Detect existing configs.
2. Store core state inside isolated `.openmemory/` directory.
3. Inject pointers into `AGENTS.md` using explicit section delimiters.
4. Always create backups before modifying any existing repository file.

### Consequences
* **Positive**: Safe installation; zero risk of losing developer instructions; easy uninstallation.
* **Negative**: Requires clean merger logic in installer scripts.

### Confidence
**HIGH**

---

## DEC-005: Prompt Master Decomposition into Modular Skills, Commands, and Plugins

### Context
The user-provided Prompt Master contains comprehensive guidelines, operational roles, and memory policies. We evaluated how to deliver this specification to the agent efficiently.

### Evidence
Injecting the entire Prompt Master into `AGENTS.md` on every turn consumes thousands of context tokens repeatedly, accelerating context window exhaustion and triggering premature context compaction.

### Alternatives
1. **Monolithic Prompt Injection**: Paste all rules into `AGENTS.md`. High token consumption.
2. **Decomposed Framework Architecture**:
   * **Permanent Core Rules**: Placed in `AGENTS.md` (~15-20 lines).
   * **Procedural SOPs**: Placed in on-demand Skills (`.opencode/skills/`).
   * **Interactive Shortcuts**: Exposed via Commands (`.opencode/commands/`).
   * **Lifecycle Hooks**: Handled by Plugin (`.opencode/plugins/openmemory.ts`).

### Decision
Adopt the Decomposed Framework Architecture for the Prompt Master.

### Consequences
* **Positive**: Minimal system prompt token overhead; maximum modularity; skills loaded only when relevant.
* **Negative**: Requires organizing instructions across separate files.

### Confidence
**HIGH**

---

## DEC-006: Rejection of AGPL-3.0 Code Reuse from `claude-mem`

### Context
During open-source project research, `thedotmack/claude-mem` was identified as a functional observation-capturing tool for Claude Code/OpenCode. However, its license is **AGPL-3.0** (GNU Affero General Public License v3).

### Evidence
AGPL-3.0 is a strong copyleft license requiring any derivative work or integrated network service to release full source code under AGPL-3.0. Incorporating `claude-mem` code into OpenMemory (`https://github.com/Blueisazul/OpenMemory`) would impose copyleft restrictions on OpenMemory users.

### Alternatives
1. **Fork/Copy `claude-mem` code**: Violates open-source licensing strategy for OpenMemory (MIT target).
2. **Clean-room implementation of concepts under MIT**: Study conceptual paradigms (observation compression, multi-layer indexing) without copying any AGPL-3.0 code lines.

### Decision
Classify `claude-mem` as **REFERENCE ONLY**. Zero lines of code from `claude-mem` will be copied or adapted. All OpenMemory code will be written clean-room under the MIT license.

### Consequences
* **Positive**: Ensures OpenMemory remains 100% permissively licensed (MIT) for commercial and open-source adoption.
* **Negative**: Cannot directly copy existing observation-capturing code snippets from `claude-mem`.

### Confidence
**HIGH**

---

## DEC-007: Deferred Integration of Model Context Protocol (MCP) to Phase 4

### Context
Model Context Protocol (MCP) allows AI models to connect to external tool servers. We evaluated whether OpenMemory v0.1 should be implemented as an MCP server.

### Evidence
OpenCode supports local plugins, commands, and skills directly without running a separate background MCP process over STDIO or HTTP SSE. An MCP server introduces process management overhead for local terminal users in v0.1.

### Alternatives
1. **MCP Server First**: Requires background process management, extra user configuration in `opencode.json`.
2. **Native Plugin & File-based Engine First (v0.1) + MCP Adapter Later (Phase 4)**.

### Decision
Build OpenMemory v0.1 as a zero-dependency native OpenCode plugin + file-based state engine. Defer the MCP Server adapter interface to Phase 4 for cross-client compatibility (e.g. Cursor, Claude Desktop).

### Consequences
* **Positive**: Zero background process management for OpenCode users in v0.1; fast execution.
* **Negative**: Non-OpenCode agents cannot access OpenMemory until Phase 4 MCP adapter is built.

### Confidence
**HIGH**
