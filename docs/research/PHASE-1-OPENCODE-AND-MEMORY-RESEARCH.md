# PHASE 1: OpenCode Architecture & Operational Memory System Research

**Project Target:** `https://github.com/Blueisazul/OpenMemory`  
**Phase:** 1 — Exhaustive Investigation & Technical Design  
**Date:** September 2026  
**Status:** COMPLETE (Research & Design Phase)

---

## 1. Executive Summary

This document presents the technical research, architecture analysis, and minimal viable specification for **OpenMemory v0.1**. 

OpenMemory is designed as a reusable operational memory, session continuity, persistent context, and project knowledge management framework for developer AI agents, targeting deep, non-destructive integration with **OpenCode**.

### Core Findings
1. **OpenCode Extension Model**: OpenCode provides a native extensibility surface consisting of `AGENTS.md` (instructions), custom commands (`.opencode/commands/`), modular skills (`.opencode/skills/`), specialized subagents (`.opencode/agents/`), TypeScript lifecycle plugins (`.opencode/plugins/`), Model Context Protocol (MCP) servers (`opencode.json`), and an event bus (`session.created`, `session.compacted`, `tool.execute.before/after`).
2. **Session Memory vs. Project Memory Gap**: OpenCode manages transient session state in local SQLite databases and uses LLM-driven compaction (summarization) when context limits are reached. However, OpenCode lacks a persistent, structured, cross-session project memory that survives session clears, captures architectural decisions, tracks active task state, or hands off context across sessions without heavy context consumption.
3. **Existing Open Source Landscape**: Projects such as `mem0ai/mem0`, `thedotmack/claude-mem`, `tickernelz/opencode-mem`, `ZeR020/opencode-mem0`, and `chriswritescode-dev/opencode-memory` offer valuable paradigms (observation capturing, 7-factor memory scoring, vector/FTS dual storage). However, many introduce license risks (e.g. AGPL-3.0 in `claude-mem`), heavy external dependencies (embeddings, vector DBs, Python daemons), or aggressive prompt injection that consumes context tokens.
4. **Minimal Viable Architecture (v0.1)**: OpenMemory v0.1 will NOT require embeddings, a vector database, a Knowledge Graph, or a secondary LLM service. Instead, it leverages a deterministic **Markdown + JSON State + Local FTS/Lexical Search + OpenCode Plugin + Native Commands & Skills + Session Handoff** architecture. This minimizes token overhead, guarantees 100% offline local execution, and prevents vendor lock-in.

---

## 2. Research Scope

This phase investigates:
* OpenCode core architecture, configuration hierarchy, lifecycle events, and extension mechanisms.
* Distinction between OpenCode native session context compaction and long-term project memory.
* Existing open-source agent memory frameworks and plugins.
* Decomposition of the Prompt Master into modular skills, commands, subagents, and memory policies.
* Non-destructive installation and coexistence strategies for project repositories.
* OpenMemory v0.1 minimal architecture, stability matrix, negative decisions ("What We Will NOT Build Yet"), and risk mitigation.

---

## 3. Sources & Evidence Hierarchy

Primary sources evaluated during this research:
1. **Official OpenCode Documentation & Repositories**:
   * OpenCode Documentation: `https://opencode.ai/docs`
   * OpenCode Repository: `https://github.com/sst/opencode` / `https://github.com/anomaly24/opencode`
   * OpenCode Plugin API Package: `@opencode-ai/plugin` / `@opencode/plugin`
2. **Open Source Memory Implementations**:
   * `mem0ai/mem0`: `https://github.com/mem0ai/mem0` (Apache 2.0)
   * `thedotmack/claude-mem`: `https://github.com/thedotmack/claude-mem` (AGPL-3.0)
   * `tickernelz/opencode-mem`: `https://github.com/tickernelz/opencode-mem` (MIT)
   * `ZeR020/opencode-mem0`: `https://github.com/ZeR020/opencode-mem0` (MIT)
   * `chriswritescode-dev/opencode-memory`: `https://github.com/chriswritescode-dev/opencode-memory` (MIT)
3. **Standards & Protocols**:
   * Model Context Protocol (MCP) Specification: `https://modelcontextprotocol.io`
   * W3C & POSIX local storage and JSON/Markdown structural conventions.

---

## 4. OpenCode Architecture Overview

OpenCode operates as a terminal-native and desktop AI coding agent built around a **Client-Server architecture**:

```
 ┌─────────────────────────────────────────────────────────┐
 │                      OpenCode Client                    │
 │       (Terminal UI / Tauri Desktop / IDE Extensions)     │
 └────────────────────────────┬────────────────────────────┘
                              │ JSON-RPC / IPC
 ┌────────────────────────────▼────────────────────────────┐
 │                      OpenCode Server                    │
 │  ┌─────────────────┐ ┌────────────────┐ ┌─────────────┐ │
 │  │ Event Bus       │ │ Session Manager│ │ LLM Router  │ │
 │  │ (Typed Events)  │ │ (SQLite DB)    │ │ (75+ Models)│ │
 │  └────────┬────────┘ └───────┬────────┘ └─────────────┘ │
 │           │                  │                          │
 │  ┌────────▼──────────────────▼────────────────────────┐ │
 │  │ Extension Surface: Plugins, Skills, Commands, MCP │ │
 │  └────────────────────────────────────────────────────┘ │
 └─────────────────────────────────────────────────────────┘
```

### Core Characteristics
* **Server Process**: Manages session state, tool executions, file watchers, LSP diagnostics, and LLM API requests.
* **Storage Engine**: Stores interaction history, tool call logs, and context windows in a local SQLite database (`~/.config/opencode/opencode.db` or project-relative state).
* **Git Snapshot Protection**: Automatically creates Git commits/tree snapshots prior to destructive file operations, enabling immediate rollback.
* **Configuration Hierarchy (6 Levels)**:
  1. System/Environment flags
  2. Global config (`~/.config/opencode/opencode.json`)
  3. Global instructions (`~/.config/opencode/AGENTS.md`)
  4. Project config (`.opencode/opencode.json` or `opencode.json`)
  5. Directory instructions (`AGENTS.md`, `.opencode/AGENTS.md`)
  6. Subdirectory instructions (`path/to/sub/AGENTS.md`)

---

## 5. OpenCode Extension Surface Analysis

OpenCode offers seven distinct extension mechanisms. Each mechanism possesses different stability guarantees, capabilities, and trade-offs.

---

## 6. Instructions (`AGENTS.md`)

### Technical Mechanism
* **Format**: Markdown files (`AGENTS.md`).
* **Locations**: Root (`/AGENTS.md` or `.opencode/AGENTS.md`), subdirectory (`src/AGENTS.md`), and global (`~/.config/opencode/AGENTS.md`).
* **Precedence**: Subdirectory instructions override/augment root instructions; root instructions override global instructions.
* **Compaction Behavior**: System prompts and top-level `AGENTS.md` instructions are **re-injected on every interaction**, surviving context compaction.
* **Limits**: Large `AGENTS.md` files consume token budget on every single LLM call.

### Coexistence Strategy for OpenMemory
* **What SHOULD live in `AGENTS.md`**: Core high-priority guardrails, mandatory workflow rules, pointer to OpenMemory commands/skills.
* **What SHOULD NOT live in `AGENTS.md`**: Historical session logs, verbose API docs, domain knowledge graphs, detailed step-by-step SOPs.
* **Coexistence**: OpenMemory will append or reference an isolated OpenMemory block inside `AGENTS.md` using marker comments (`<!-- OPENMEMORY:START -->` ... `<!-- OPENMEMORY:END -->`), preserving all pre-existing user instructions intact.

---

## 7. Custom Commands (`.opencode/commands/*.md`)

### Technical Mechanism
* **Format**: Markdown files with YAML frontmatter in `.opencode/commands/<command-name>.md` or JSON definitions in `opencode.json`.
* **Variables**: `$ARGUMENTS` (full raw input string), `$1`, `$2` (positional arguments).
* **Attributes**: `description`, `agent` (target primary agent or subagent), `model` (override model), `permissions`.
* **Discovery**: Auto-discovered by OpenCode at startup and accessible via `/command-name` in TUI/CLI.

### Recommended OpenMemory Commands
1. `/memory-status`: Displays current OpenMemory operational state, active tasks, decisions, and session continuity index.
2. `/memory-search`: Performs fast local FTS/lexical search across historical decisions, architecture logs, and context items.
3. `/memory-update`: Manual trigger to log a formal architectural decision (ADR) or task state update.
4. `/handoff`: Compiles a structured session handoff artifact summarizing progress, uncommitted work, and next steps for future sessions.
5. `/project-review`: Triggers a comprehensive project health, architecture alignment, and debt audit.

---

## 8. Skills (`.opencode/skills/<skill-id>/SKILL.md`)

### Technical Mechanism
* **Format**: Folder containing `SKILL.md` with YAML frontmatter (`name`, `description`) and optional supporting templates/scripts.
* **Discovery & Loading**: OpenCode loads skill metadata at startup; full skill content is **loaded on-demand** when the agent determines relevance or when invoked via command.
* **Precedence**: Local project skills (`.opencode/skills/`) override global skills (`~/.config/opencode/skills/`).

### Decomposition of Prompt Master into Skills
The monolithic Prompt Master should be broken down into modular skills loaded only when needed:
* `skill-architecture-review`: Guides ADR creation and structural evaluation.
* `skill-session-handoff`: Manages session transitions and context persistence.
* `skill-security-audit`: Standard operating procedures for vulnerability and permission analysis.
* `skill-qa-verification`: Guidelines for test-driven development and verification commands.

---

## 9. Agents & Subagents (`.opencode/agents/*.md`)

### Technical Mechanism
* **Format**: Markdown files in `.opencode/agents/<agent-name>.md` or configured in `opencode.json`.
* **Modes**: `primary` (direct user interaction), `subagent` (invoked as background child process), `all`.
* **Attributes**: `model`, `description`, `permissions`, `tools`, `subagent_depth` (default = 1).
* **Context Isolation**: Subagents run with an isolated context window, returning only their final output to the caller agent.

### Specialized OpenMemory Subagent Strategy
* `arch-agent` (subagent): Evaluates design proposals against established ADRs.
* `qa-agent` (subagent): Runs verification pipelines, linting, and unit tests autonomously without cluttering the main session context.
* `sec-agent` (subagent): Audits dependency safety and permission boundary violations.

---

## 10. Plugins (`.opencode/plugins/*.ts`)

### Technical Mechanism
* **Format**: TypeScript module exporting a `Plugin` function matching `@opencode-ai/plugin`.
* **Locations**: Local project (`.opencode/plugins/`), global (`~/.config/opencode/plugins/`), or installed via npm package defined in `opencode.json`.
* **Capabilities**: Access to shell (`$`), OpenCode client SDK, workspace path, and lifecycle event hooks.

### Lifecycle Hooks Catalog & Stability

| Hook Event | Trigger Point | Use Case in OpenMemory | Stability |
| :--- | :--- | :--- | :--- |
| `session.created` | New session initialized | Load active project state & active handoff summary | **Stable** |
| `session.compacted` | History summarized due to token limit | Capture transient memories before context trim | **Supported** |
| `session.idle` | Agent finishes turn / user input needed | Flush pending operational logs to disk | **Stable** |
| `session.error` | Runtime error encountered | Record failure context for debugging | **Supported** |
| `tool.execute.before` | Prior to tool execution | Intercept unsafe edits or log tool activity | **Experimental** |
| `tool.execute.after` | Post tool execution | Track modified files & build incremental diffs | **Experimental** |

---

## 11. Custom Tools

### Technical Mechanism
* **Format**: JavaScript/TypeScript functions exposed via plugins or native tool definitions.
* **Function**: Accepts JSON schema inputs, executes logic, returns string/JSON output directly to LLM context.
* **Token Overhead**: Tools consume schema definitions in every system prompt.
* **Decision**: OpenMemory v0.1 will rely primarily on standard filesystem tools (file read/write) executed via Skills/Commands and Plugin hooks, avoiding heavy custom tool schema injection into system prompts.

---

## 12. Model Context Protocol (MCP) Integration

### Technical Mechanism
* **Format**: Client-server protocol allowing external processes to provide Tools, Resources, and Prompts to OpenCode via `opencode.json`.
* **Evaluation for OpenMemory**:
  * **Pros**: Standardized inter-process communication; usable by non-OpenCode agents (e.g. Claude Desktop, Cursor).
  * **Cons**: Requires running background daemon process (STDIO or SSE HTTP), higher setup complexity for end users, extra failure point.
* **Decision**: **Phase 1 & v0.1 will NOT require MCP.** OpenMemory v0.1 will run as a zero-dependency native OpenCode plugin + file-based architecture. MCP adapter support will be added in **Phase 4** as an optional remote interface.

---

## 13. OpenCode SDK

### Technical Mechanism
* **Package**: `@opencode-ai/sdk` (TypeScript / Node.js / Bun).
* **Capabilities**: Programmatically spawn OpenCode server instances, create sessions, send prompts, listen to stream events, inspect session history.
* **Use Case**: Ideal for external automated integration testing, CI/CD validation suites, and CLI tooling for OpenMemory management outside an active session.

---

## 14. Sessions & Context Management: Deep Dive

### Native Session Compaction in OpenCode
When a conversation history approaches the context window limit of the selected model, OpenCode automatically triggers a **Context Compaction** process:
1. OpenCode halts normal execution.
2. It sends the conversation history to the LLM with a summarization prompt.
3. The LLM generates a concise narrative summary of past progress, decisions, and current state.
4. OpenCode replaces the old message trajectory with the summary block in memory while persisting raw history in the local SQLite database.
5. The `session.compacted` plugin event is emitted.

### Session Memory vs. Project Operational Memory

```
┌─────────────────────────────────────────────────────────┐
│              Session Memory (OpenCode Native)           │
│  • Lifetime: Bound to single conversation session.       │
│  • Storage: SQLite database + in-memory summary.        │
│  • Purpose: Conversation context within model window.   │
│  • Limitation: Lost or diluted when session is cleared  │
│    or after multiple compaction cycles.                 │
└────────────────────────────┬────────────────────────────┘
                             │
                             │ GAP: Cross-session continuity & structured ADRs
                             │
┌────────────────────────────▼────────────────────────────┐
│            Project Memory (OpenMemory v0.1)             │
│  • Lifetime: Permanent across repository lifetime.      │
│  • Storage: Version-controlled Markdown & JSON state.   │
│  • Purpose: Active task state, Architectural Decisions  │
│    (ADRs), Handoff summaries, Knowledge Graph index.    │
│  • Superiority: Zero token waste, 100% auditable,       │
│    Git-friendly, human-readable, deterministic.         │
└─────────────────────────────────────────────────────────┘
```

---

## 15. Stability Matrix

| Mechanism | Available | Integrable w/o Core Mod | State | Source | Change Risk | Recommendation |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| `AGENTS.md` | Yes | Yes | Documented / Supported | OpenCode Official Docs | Low | **Core Layer**: High-level instructions & entry points |
| Custom Commands | Yes | Yes | Documented / Supported | OpenCode Official Docs | Low | **Core Layer**: `/memory-status`, `/handoff`, etc. |
| Skills (`SKILL.md`) | Yes | Yes | Documented / Supported | OpenCode Official Docs | Low | **Core Layer**: On-demand procedural workflows |
| Subagents | Yes | Yes | Documented / Supported | OpenCode Official Docs | Medium | **Optional Layer**: Specialized review subagents |
| Plugins (`.ts`) | Yes | Yes | Supported / Evolving | `@opencode-ai/plugin` | Medium | **Core Layer**: Lifecycle hooks (`session.created`, `session.compacted`) |
| Session Hooks | Yes | Yes | Documented | OpenCode Plugin API | Low-Medium | Use `session.created` & `session.compacted` |
| Tool Execution Hooks| Yes | Yes | Experimental | OpenCode Plugin API | Medium-High | Use sparingly for logging only |
| MCP | Yes | Yes | Supported Standard | Anthropic / MCP Spec | Low | **Future Layer**: Defer to Phase 4 |
| SDK (`@opencode-ai/sdk`)| Yes | Yes | Supported | NPM Package | Low | Use for Automated Integration Testing |

---

## 16. Existing Open Source Memory Projects Analysis

### 1. `mem0ai/mem0`
* **Repository**: `https://github.com/mem0ai/mem0`
* **License**: Apache 2.0
* **Architecture**: Universal memory layer with multi-level scope (User, Session, Agent). Uses vector database (Qdrant/Chroma/pgvector) + graph structures + LLM extractors.
* **Retrieval**: Hybrid (Vector similarity + BM25 keyword + temporal decay).
* **Pros**: Highly active, modular backend support, multi-tenant.
* **Cons**: Requires Python runtime or cloud API, high latency, complex dependencies, overkill for local code repositories.
* **Classification**: `REFERENCE` (Borrow conceptual 3-tier memory model: Short-term, Long-term, Operational).

### 2. `thedotmack/claude-mem`
* **Repository**: `https://github.com/thedotmack/claude-mem`
* **License**: **AGPL-3.0** (Strict Copyleft)
* **Architecture**: Captures agent tool observations, compresses them using secondary LLM calls into SQLite FTS5 + Chroma vector store. Injects observations into prompt.
* **Retrieval**: 3-layer retrieval (Index -> Timeline -> Deep detail).
* **Pros**: Excellent observation summarization and session injection for Claude Code/OpenCode.
* **Cons**: **AGPL-3.0 license poses severe license contamination risk** for commercial project reuse. High token cost due to aggressive prompt injection.
* **Classification**: `REFERENCE ONLY` (**DO NOT COPY CODE** due to AGPL-3.0; learn from observation compression concepts).

### 3. `tickernelz/opencode-mem`
* **Repository**: `https://github.com/tickernelz/opencode-mem`
* **License**: MIT
* **Architecture**: Native OpenCode plugin using local SQLite + vector storage to save chat turn memories.
* **Retrieval**: Semantic vector search.
* **Pros**: Simple local integration, MIT license.
* **Cons**: Relies on heavy vector embedding generation locally, lacking structured task handoff or architectural decision management.
* **Classification**: `ADAPTABLE` (Useful reference for native OpenCode TypeScript plugin hook integration).

### 4. `ZeR020/opencode-mem0`
* **Repository**: `https://github.com/ZeR020/opencode-mem0`
* **License**: MIT
* **Architecture**: Fork of `opencode-mem` introducing a 7-factor memory scoring algorithm (recency, frequency, relevance, entity density, confidence, validation, impact) and dual STM/LTM lifecycle.
* **Retrieval**: Hybrid scoring + vector retrieval.
* **Pros**: Sophisticated memory decay and scoring model.
* **Cons**: Complex scoring heuristics for v0.1; requires embeddings.
* **Classification**: `REFERENCE` (Scoring criteria model can inform future memory pruning in Phase 3).

### 5. `chriswritescode-dev/opencode-memory`
* **Repository**: `https://github.com/chriswritescode-dev/opencode-memory`
* **License**: MIT
* **Architecture**: OpenCode plugin with semantic knowledge storage, iterative execution loops, and session plan tracking.
* **Pros**: Project plan injection and session plan saving.
* **Cons**: Lacks clear separation between temporary session plans and permanent architectural records.
* **Classification**: `REUSABLE` (Concepts of session plan state persistence align with OpenMemory Handoff).

---

## 17. Project Comparison Matrix

| Project | OpenCode Native | Plugin | MCP | Commands | Skills | Hooks | Persistence | Retrieval | Architecture | License | Maturity | OpenMemory Classification |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **mem0** | No | No | Optional | No | No | No | Vector DB / SQLite / Cloud | Hybrid (Vector+BM25) | Client-Server / Service | Apache 2.0 | High | `REFERENCE` |
| **claude-mem** | Indirect | Yes | No | CLI | No | Yes | SQLite FTS5 + Chroma | 3-Layer Index | Plugin + Daemon | AGPL-3.0 | Medium-High | `REFERENCE ONLY` |
| **opencode-mem**| Yes | Yes | No | No | No | Yes | SQLite + Vector | Semantic Vector | Local Plugin | MIT | Medium | `ADAPTABLE` |
| **opencode-mem0**| Yes | Yes | No | No | No | Yes | SQLite + Vector | 7-Factor Hybrid | Local Plugin | MIT | Medium | `REFERENCE` |
| **opencode-memory**| Yes | Yes | No | Yes | No | Yes | Markdown / JSON | Lexical / Semantic | Local Plugin | MIT | Medium | `REUSABLE` |
| **OpenMemory v0.1**| Yes | Yes | Defer | Yes | Yes | Yes | Markdown + JSON State | FTS / Lexical / Exact | Zero-Dependency Local Plugin | MIT | Design Phase | **TARGET PRODUCT** |

---

## 18. OpenMemory Target Repository Audit

* **Repository**: `https://github.com/Blueisazul/OpenMemory`
* **Current Workspace Path**: `C:\Users\sant1\.gemini\antigravity-ide\scratch`
* **Current State**: Initialized greenfield directory. Zero legacy codebase or conflicting configuration files.
* **Audit Baseline**: Baseline repository structure and research documentation established in Phase 1 (`docs/research/`).

---

## 19. Prompt Master Decomposition Strategy

The monolithic Prompt Master is decomposed into clean, modular framework components:

```
┌──────────────────────────────────────────────────────────────────┐
│                         PROMPT MASTER                            │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
   ┌─────────────────────────────┼──────────────────────────────┐
   │                             │                              │
┌──▼────────────────┐  ┌─────────▼───────────┐  ┌───────────────▼──────────────┐
│  Permanent Rules  │  │ Contextual Procedures│  │   Operational Workflows      │
│  (in AGENTS.md)   │  │   (in SKILL.md)    │  │   (in Commands & Subagents)  │
│                   │  │                    │  │                              │
│ • Never destroy   │  │ • ADR creation     │  │ • /memory-status             │
│   user config.    │  │ • QA verification  │  │ • /handoff                   │
│ • Mandatory test  │  │ • Session handoff  │  │ • /project-review            │
│   verification.   │  │ • Security audit   │  │ • arch-agent, qa-agent       │
└───────────────────┘  └────────────────────┘  └──────────────────────────────┘
```

### Classification Breakdown
1. **Permanent Rules (AGENTS.md)**: Core guidelines that must be enforced during every agent turn (e.g. non-destructive edits, empirical testing requirements, tool safety).
2. **Procedural Workflows (Skills)**: SOPs loaded on-demand when performing specific tasks (e.g. creating ADRs, executing QA checks).
3. **Operational Shortcuts (Commands)**: Instant triggers for memory state inspect, session handoffs, and project reviews (`/memory-status`, `/handoff`).
4. **Specialized Roles (Subagents)**: Context-isolated execution agents for heavy validation tasks (e.g. deep code review, security boundary check).
5. **Memory Policy (OpenMemory Plugin)**: Automated hooks capturing session lifecycle events without prompt overhead.

---

## 20. Role & Agent Strategy

Rather than spawning seven permanent, heavy agents, OpenMemory v0.1 uses a **Role Matrix**:

| Role | Representation in OpenMemory v0.1 | Purpose |
| :--- | :--- | :--- |
| **Product** | Specification in `.openmemory/project-state.json` | Maintains scope, user goals, and feature status |
| **Architecture** | `skill-architecture-review` + `arch-agent` subagent | Enforces ADR compliance and design integrity |
| **Security** | `skill-security-audit` | Audits dependency safety & permission boundaries |
| **Development** | Primary OpenCode Agent + `AGENTS.md` rules | Standard implementation pair-programming |
| **QA** | `skill-qa-verification` + `qa-agent` subagent | Executes build & verification test suites |
| **DevOps** | Automation scripts in `.openmemory/scripts/` | Local build, verification, and CI helpers |
| **Project Management**| `.openmemory/handoff.md` + `/handoff` command | Context preservation & cross-session continuity |

---

## 21. OpenMemory v0.1 Technical Architecture

```
.openmemory/
├── openmemory.json            # Configuration & versioning manifest
├── project-state.json         # Active tasks, milestones, state index
├── handoff.md                 # Cross-session continuity handoff artifact
├── adrs/                      # Architectural Decision Records
│   ├── 0001-init-architecture.md
│   └── 0002-storage-engine.md
└── logs/                      # Compact operational event logs
    └── session-history.jsonl
```

### Core Mechanisms
1. **Zero-Dependency Plugin (`.opencode/plugins/openmemory.ts`)**:
   * Listens to `session.created`: Loads `.openmemory/handoff.md` and `.openmemory/project-state.json` into active session context via a lightweight notification.
   * Listens to `session.compacted`: Intercepts context compaction and automatically updates `.openmemory/handoff.md` with latest state before context is trimmed.
   * Listens to `session.idle`: Flushes pending state mutations to disk.
2. **Storage Engine**: Pure local filesystem storage using Markdown (for human-readable logs & ADRs) and structured JSON (for fast deterministic state reading).
3. **Retrieval Engine**: Fast, local lexical search (FTS / string matching / regex) across `.openmemory/` contents without embedding APIs or vector databases.

---

## 22. Minimal Viable Architecture (v0.1 Hypothesis Evaluation)

### Evaluation of Hypothesis:
$$\text{Markdown} + \text{JSON State} + \text{Local Lexical Search} + \text{OpenCode Plugin} + \text{Commands} + \text{Skills} + \text{Session Handoff}$$

**Conclusion: SUFFICIENT FOR v0.1.**

### Why Vector DBs, Embeddings, Knowledge Graphs, & 2nd LLMs are UNNECESSARY for v0.1:
1. **Token Cost & Latency**: Embedding generation adds network calls or heavy local WASM runtime overhead on every edit.
2. **Failure Modes & Complexity**: Vector databases suffer from distance threshold tuning issues, chunking errors, and non-deterministic retrieval failures.
3. **Auditability**: Plain Markdown ADRs and JSON state files can be viewed, diffed, edited, and git-committed directly by humans.
4. **Deterministic Behavior**: Code search and task status management in developer projects rely on exact identifiers, file paths, and explicit decisions, which standard lexical/FTS search solves with 100% precision.

---

## 23. What We Will NOT Build Yet (Explicit Negative Decisions)

To avoid scope creep, OpenMemory v0.1 explicitly excludes:
1. **NO Vector Database**: No ChromaDB, Qdrant, Pinecone, or LanceDB integration.
2. **NO Embeddings Pipeline**: No OpenAI, Ollama, or HuggingFace embedding calls.
3. **NO Knowledge Graph DB**: No Neo4j or graph database dependencies.
4. **NO Secondary LLM Summarizer Process**: All summarization relies natively on OpenCode's primary agent or native compaction hooks.
5. **NO External Cloud Service**: 100% offline local execution.
6. **NO Core OpenCode Modifications or Forks**: Zero patches to OpenCode binary.
7. **NO Unsolicited Global Config Overwrites**: Zero silent mutations of user `AGENTS.md` or `opencode.json`.

---

## 24. Coexistence & Non-Destructive Integration Strategy

To ensure OpenMemory never overwrites user configurations in pre-existing projects:

1. **Detection**: Scan for pre-existing `AGENTS.md`, `opencode.json`, `.opencode/plugins/`, `.opencode/skills/`, and `.opencode/commands/`.
2. **Diff & Block Formatting**: Use explicit delimiters:
   ```markdown
   <!-- OPENMEMORY:START -->
   ... OpenMemory instructions ...
   <!-- OPENMEMORY:END -->
   ```
3. **Backup Strategy**: Prior to modifying any existing project configuration file, create a timestamped backup in `.openmemory/backups/`.
4. **User Consent & Audit**: Provide a dry-run mode and log all changes explicitly.

---

## 25. Critical Architectural Synthesis (Answering the 10 Fundamental Questions)

1. **Are we building something that already exists?**
   * *No.* Existing tools are either generic vector memory engines (`mem0`), single-agent observation loggers with restrictive licenses (`claude-mem` AGPL-3.0), or heavy vector plugins (`opencode-mem`). None provide a lightweight, deterministic, non-destructive, git-native project memory & session handoff framework specifically designed around OpenCode native extension points.
2. **What part does OpenCode already solve?**
   * OpenCode solves LLM routing, tool execution, LSP diagnostics, Git snapshotting, session SQLite storage, TUI/CLI interface, and session context compaction.
3. **What part do open-source projects already solve?**
   * Observation capturing (`claude-mem`), memory decay scoring (`opencode-mem0`), multi-level memory scope (`mem0`).
4. **What part remains unsolved?**
   * Seamless, deterministic, cross-session project continuity, non-destructive coexistence with user repository configs, human-auditable ADR tracking, and zero-dependency local operational handoffs for OpenCode.
5. **What is the minimum OpenMemory that provides real value?**
   * An OpenCode plugin + `/handoff` command + `.openmemory/` Markdown/JSON state engine that automatically persists task state and architectural decisions across session restarts with 0 token waste.
6. **What is the most probable architectural error?**
   * Introducing a heavy vector database / embedding pipeline in v0.1, leading to latency, non-deterministic retrieval, dependency breakage, and user setup friction.
7. **What is the most dangerous dependency?**
   * Depending on third-party cloud embedding APIs or native C++ node modules (e.g. SQLite vector extensions) that break cross-platform installation on Windows/macOS/Linux.
8. **What is the riskiest OpenCode API to depend on?**
   * Experimental plugin tool hooks (`tool.execute.before` / `tool.execute.after`), which are subject to API changes. (We mitigate this by relying on stable session hooks `session.created` and `session.compacted`).
9. **What should we validate with a small spike before implementation?**
   * Test the exact behavior of `@opencode-ai/plugin` `session.compacted` event payload and timing in a clean OpenCode installation.
10. **What should we NOT build?**
    * Vector DBs, graph engines, cloud backends, secondary LLM background daemons, or custom forks of OpenCode.

---

## 26. Recommended Technical Roadmap

```
  Phase 1: Research & Technical Design (Current - COMPLETE)
    ├── Complete OpenCode extension audit
    ├── Document existing memory open-source projects
    ├── Define Minimal Viable Architecture v0.1
    └── Deliver research specifications & decision records
        │
  Phase 2: Core State Engine & Handoff Spike (Next Phase)
    ├── Create `.openmemory/` storage specification schema
    ├── Implement `.opencode/plugins/openmemory.ts` plugin spike
    ├── Validate `session.created` and `session.compacted` hooks
    └── Implement `/handoff` and `/memory-status` native commands
        │
  Phase 3: Modular Skills & Subagents
    ├── Package `skill-architecture-review` & `skill-session-handoff`
    ├── Configure specialized `arch-agent` and `qa-agent` subagents
    └── Build non-destructive installer & config merger
        │
  Phase 4: Optional Remote MCP Adapter
    ├── Build local MCP server interface for OpenMemory state
    └── Enable external client connectivity (Claude Desktop, Cursor)
        │
  Phase 5: Production Release & Benchmark Suite
    ├── Create automated verification test suite via `@opencode-ai/sdk`
    └── Publish OpenMemory v1.0 framework documentation & package
```

---

## 27. Final Recommendation

**Proceed immediately to request user authorization for PHASE 2.**

Phase 2 will focus exclusively on implementing the core `.openmemory/` local state engine, the OpenCode plugin spike, and native `/handoff` / `/memory-status` commands as defined in the minimal v0.1 architecture.
