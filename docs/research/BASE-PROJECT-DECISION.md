# OpenMemory Base Project Decision Record

**Project Target:** `https://github.com/Blueisazul/OpenMemory`  
**Phase:** 1.5 — Research Audit & Base Project Selection  
**Date:** September 2026  
**Status:** FINAL DECISION RECORD

---

## 1. Executive Summary

During Phase 1.5, we evaluated whether `https://github.com/Blueisazul/OpenMemory` should be built from scratch or adapted from an existing open-source project (such as `mem0ai/openmemory`, `CaviraOSS/LongMemory`, `Chimdiiii/OpenMemory`, `tickernelz/opencode-mem`, `thedotmack/claude-mem`, or `chriswritescode-dev/opencode-memory`).

### Decision: `BUILD_FROM_SCRATCH` with `REFERENCE_ONLY` for External Architectural Paradigms

We will build **OpenMemory from scratch** as a zero-dependency, native OpenCode plugin framework utilizing a deterministic Markdown + JSON State Engine. We will **not** clone, fork, or depend on existing third-party codebase bases.

---

## 2. Evaluated Candidate Repositories

### Candidate 1: `mem0ai/openmemory` / `mem0ai/mem0`
* **Owner**: Mem0 AI (`mem0ai`)
* **URL**: `https://github.com/mem0ai/mem0`
* **License**: Apache 2.0
* **Language**: Python / TypeScript
* **Architecture**: Multi-tenant, multi-layer (User, Session, Agent) memory service utilizing vector databases (Qdrant, Chroma, pgvector), graph structures, and LLM extraction pipelines.
* **Compatibility with OpenCode & OpenMemory Architecture**: **LOW**. Requires external Python runtimes, cloud/vector backends, and introduces network IPC latency.
* **Classification**: `REFERENCE ONLY` (Conceptual 3-tier memory taxonomy).

### Candidate 2: `thedotmack/claude-mem`
* **Owner**: `thedotmack`
* **URL**: `https://github.com/thedotmack/claude-mem`
* **License**: **AGPL-3.0** (Strict Copyleft)
* **Language**: TypeScript / Node.js
* **Architecture**: Observation-capturing plugin with SQLite FTS5 + Chroma vector store. Injects compressed history into prompt.
* **Compatibility with OpenCode & OpenMemory Architecture**: **MEDIUM**. Useful observation compression concepts, but **unacceptable AGPL-3.0 license risk** for an MIT project.
* **Classification**: `REJECT` (Copyleft contamination risk; reference concepts only via clean-room design).

### Candidate 3: `tickernelz/opencode-mem`
* **Owner**: `tickernelz`
* **URL**: `https://github.com/tickernelz/opencode-mem`
* **License**: MIT
* **Language**: TypeScript
* **Architecture**: OpenCode plugin using local SQLite + vector storage to index turn memories.
* **Compatibility with OpenCode & OpenMemory Architecture**: **MEDIUM**. Native OpenCode plugin structure is useful, but relies on heavy vector embedding generation locally.
* **Classification**: `REFERENCE` (Reference for TypeScript plugin event hook syntax).

### Candidate 4: `chriswritescode-dev/opencode-memory`
* **Owner**: `chriswritescode-dev`
* **URL**: `https://github.com/chriswritescode-dev/opencode-memory`
* **License**: MIT
* **Language**: TypeScript
* **Architecture**: OpenCode plugin for semantic knowledge storage and session plan tracking.
* **Compatibility with OpenCode & OpenMemory Architecture**: **MEDIUM-HIGH**. Good concepts for project plan state tracking, but lacks deterministic ADR management and strict non-destructive repository merging.
* **Classification**: `REFERENCE` (Reference for session plan state persistence).

### Candidate 5: `CaviraOSS/LongMemory` / `Chimdiiii/OpenMemory`
* **Owner**: `CaviraOSS` / `Chimdiiii`
* **URL**: `https://github.com/Chimdiiii/OpenMemory`
* **License**: MIT / Apache 2.0
* **Language**: Python
* **Architecture**: Hierarchical Memory Decomposition engine using Python scripts and vector RAG.
* **Compatibility with OpenCode & OpenMemory Architecture**: **LOW**. Not designed for OpenCode plugin lifecycle or native git-driven developer workflows.
* **Classification**: `REJECT` (Incompatible runtime and architecture).

---

## 3. Comparative Evaluation Options

| Strategy | Description | Cost of Adaptation | Risk of Dependency | Architecture Fit | Decision |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **A: Build from Scratch** | Greenfield implementation using native OpenCode APIs & Markdown/JSON state engine | **Low** | **Zero** | **100% Fit** | **SELECTED** |
| **B: Adapt Existing Project**| Fork `opencode-mem` or `claude-mem` | High | High (License/Vector DB) | 40% Fit | Rejected |
| **C: Reuse Components** | Import 3rd-party vector/RAG NPM packages | Medium | Medium (Native binaries) | 50% Fit | Rejected |
| **D: Reference Architecture**| Study paradigms, write 100% clean-room MIT code | Low | Zero | 100% Fit | **SELECTED** |
| **E: Hybrid Service** | Wrap an external Python memory daemon | High | High (Process locks) | 20% Fit | Rejected |

---

## 4. Rationale for `BUILD_FROM_SCRATCH`

1. **Zero External Dependencies**: Building from scratch using native OpenCode plugins and standard TypeScript/Node filesystem APIs ensures 100% cross-platform compatibility on Windows, macOS, and Linux without requiring Python, WASM, or C++ native vector compilation.
2. **License Purity**: Ensures OpenMemory is 100% MIT licensed without risking AGPL-3.0 copyleft contamination from projects like `claude-mem`.
3. **Exact Architectural Alignment**: OpenMemory requires a specialized, non-destructive, git-native project memory engine (ADRs, session handoffs, active task state) rather than a generic vector chatbot memory.
4. **Minimal Maintenance Cost**: Eliminates upstream dependency breaking changes and external daemon process management.
