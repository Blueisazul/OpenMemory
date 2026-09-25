# OpenMemory Phase 1 — Open Questions & Technical Risk Register

**Project:** OpenMemory (`https://github.com/Blueisazul/OpenMemory`)  
**Phase:** 1 — Exhaustive Investigation & Technical Design  
**Date:** September 2026

---

## 1. Unresolved Technical Questions

### Q-001: OpenCode Plugin `session.compacted` Event Payload & Timing
* **Question**: What exact data fields are passed to the `session.compacted` plugin event handler in `@opencode-ai/plugin`? Does the event include the summarized text, or does it only notify that compaction occurred?
* **Impact**: Critical for automated memory snapshotting during context compaction.
* **Validation Plan**: Create a minimal TypeScript plugin spike in Phase 2 that logs full `event` object payloads to disk during a forced context compaction test.

### Q-002: Plugin Execution Runtime (Bun vs Node.js Compatibility)
* **Question**: OpenCode uses Bun internally for shell execution (`$`) and plugin loading in certain distributions. Does plugin execution behave identically on Windows PowerShell when executing local `.opencode/plugins/openmemory.ts` scripts?
* **Impact**: Medium risk for cross-platform Windows compatibility.
* **Validation Plan**: Test plugin execution under Windows PowerShell with standard Bun and Node.js environments during Phase 2.

### Q-003: Subagent Context Inheritance & Depth Overhead
* **Question**: When a primary agent delegates a task to a specialized subagent (e.g. `@arch-agent`), does the subagent automatically read project root `AGENTS.md` instructions, or must explicit instruction pointers be passed in the prompt payload?
* **Impact**: Affects how subagent markdown files (`.opencode/agents/*.md`) should be structured.
* **Validation Plan**: Test subagent invocation using a custom `.opencode/agents/arch-agent.md` file in Phase 3.

---

## 2. API & Feature Validation Spikes Required (Phase 2)

| Spike ID | Target API / Component | Objective | Success Criteria |
| :--- | :--- | :--- | :--- |
| **SPIKE-001** | `session.created` Hook | Verify if plugin can inject a initial system context message into active session on creation | Plugin successfully logs session start & notifies active state |
| **SPIKE-002** | `session.compacted` Hook | Observe context compaction trigger and test snapshot saving to `.openmemory/handoff.md` | `.openmemory/handoff.md` updated automatically upon compaction |
| **SPIKE-003** | Custom Command `$ARGUMENTS` | Verify positional `$ARGUMENTS` parsing in `.opencode/commands/memory-search.md` | `/memory-search <query>` passes `<query>` cleanly into skill/plugin |
| **SPIKE-004** | Non-Destructive Inserter | Test regex delimiter merging on `AGENTS.md` with pre-existing content | Merges cleanly without duplicating blocks or deleting user rules |

---

## 3. Risk Register & Mitigation Strategies

### R-001: Upstream OpenCode Plugin API Changes
* **Risk**: OpenCode plugin API is evolving and hooks like `tool.execute.before/after` might undergo signature changes in future releases.
* **Likelihood**: Medium
* **Severity**: Medium
* **Mitigation**: Base OpenMemory v0.1 strictly on stable session lifecycle hooks (`session.created`, `session.compacted`) and encapsulate all OpenCode SDK calls inside an isolated adapter layer (`.openmemory/adapter.ts`).

### R-002: Context Token Inflation from Excessive Handoff Size
* **Risk**: If `.openmemory/handoff.md` grows too large, injecting it into every session could consume excessive context window tokens.
* **Likelihood**: Medium
* **Severity**: High
* **Mitigation**: Enforce a strict **500-word cap** on `handoff.md` and archive older context items into compressed historical JSON files in `.openmemory/logs/`.

### R-003: File Lock Collisions on Simultaneous Tool Edits
* **Risk**: High-frequency file modifications during parallel tool calls might cause write contention on `.openmemory/project-state.json`.
* **Likelihood**: Low
* **Severity**: Low-Medium
* **Mitigation**: Use atomic file write operations (write to temporary `.tmp` file and rename) with synchronous file locking helpers.

---

## 4. Pending Decisions Requiring Prototype Verification

1. **ADR Auto-Generation Trigger**: Should ADR files in `.openmemory/adrs/` be created automatically by the plugin upon detecting architectural choices in tool edits, or strictly triggered via explicit user `/memory-update` command?
   * *Status*: Prototype both options in Phase 2 to compare precision vs user friction.
2. **Handoff Auto-Flush Frequency**: Should `.openmemory/handoff.md` flush on every `session.idle` event or only upon explicit session exit / compaction?
   * *Status*: Prototype debounce-based flush on `session.idle` (e.g. 5-second buffer) during Phase 2.
