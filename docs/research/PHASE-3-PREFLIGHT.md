# Phase 3 Preflight Technical Specification

**Project Target:** `https://github.com/Blueisazul/OpenMemory`  
**Phase:** Phase 3 Preflight — Architecture Specification & Implementation Plan  
**Date:** September 2026  
**Status:** SPECIFICATION COMPLETE (Awaiting Phase 3 Implementation Authorization)

---

## 1. Executive Summary

This document defines the technical architecture, schema specifications, role mappings, and file locking mechanisms for **OpenMemory v0.1** prior to Phase 3 feature implementation.

Based on empirical evidence validated in Phase 2 (7/7 spike tests passed), OpenMemory v0.1 will run as a zero-dependency, native OpenCode plugin framework operating over a deterministic **Markdown + Structured JSON State Engine**.

---

## 2. Definitive `.openmemory/` Storage Engine Schema

```
.openmemory/
├── openmemory.json            # Framework manifest & configuration
├── project-state.json         # Active project state, active tasks, ADR index
├── handoff.md                 # Cross-session continuity artifact (< 500 words)
├── adrs/                      # Architectural Decision Records
│   ├── 0001-init-architecture.md
│   └── 0002-storage-engine.md
├── backups/                   # Pre-modification config backups
└── logs/                      # Compact JSONL event stream
```

### Schema 1: `.openmemory/openmemory.json` (Framework Manifest)
```json
{
  "$schema": "https://raw.githubusercontent.com/Blueisazul/OpenMemory/main/schemas/openmemory.schema.json",
  "version": "0.1.0",
  "projectName": "OpenMemory",
  "createdAt": "2026-09-25T15:00:00.000Z",
  "updatedAt": "2026-09-25T15:00:00.000Z",
  "config": {
    "autoHandoffOnCompaction": true,
    "autoHandoffOnIdle": true,
    "maxHandoffWords": 500,
    "nonDestructiveAgentsMd": true
  }
}
```

### Schema 2: `.openmemory/project-state.json` (Operational Task & Context Index)
```json
{
  "activePhase": "PHASE_3_PREFLIGHT",
  "currentStatus": "PREFLIGHT_COMPLETE",
  "activeGoal": "Implement core OpenMemory state engine, handoff synchronizer, and native commands",
  "activeTasks": [
    {
      "id": "TASK-001",
      "description": "Initialize .openmemory/ manifest & schema validator",
      "status": "PENDING"
    },
    {
      "id": "TASK-002",
      "description": "Implement production plugin .opencode/plugins/openmemory.ts",
      "status": "PENDING"
    }
  ],
  "sessionRunCount": 1,
  "lastSessionId": null,
  "lastUpdated": "2026-09-25T15:00:00.000Z"
}
```

### Schema 3: `.openmemory/handoff.md` (Session Continuity Template)
```markdown
# OpenMemory Session Handoff

**Active Goal:** Implement OpenMemory v0.1 Core Engine  
**Current Phase:** Phase 3 — Implementation  
**Last Updated:** 2026-09-25 15:00:00  

## Progress Summary
* Phase 1 & 1.5 research and audit completed.
* Phase 2 controlled plugin spike empirically verified (7/7 passed).
* Phase 2.5 repository consolidation completed in `Blueisazul/OpenMemory`.

## Key Architectural Decisions
* Zero-dependency native OpenCode TypeScript plugin.
* Markdown + Structured JSON State Engine (No vector DB in v0.1).

## Uncommitted Work & Next Steps
1. Implement `.opencode/plugins/openmemory.ts` production plugin.
2. Register `/memory-status` and `/handoff` slash commands.
```

---

## 3. Single Ownership Mapping of Prompt Master Rules

To prevent instruction duplication and context token inflation, Prompt Master rules are assigned strict single ownership across OpenCode extension mechanisms:

```
┌─────────────────────────────────────────────────────────────────┐
│                        PROMPT MASTER                            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
  ┌──────────────┬───────────────┼───────────────┬──────────────┐
  │              │               │               │              │
┌─▼───────────┐┌─▼────────────┐┌─▼────────────┐┌─▼───────────┐┌─▼────────────┐
│ AGENTS.md   ││ Skills       ││ Commands     ││ Subagents   ││ Plugin      │
│ (Permanent) ││ (Procedural) ││ (Explicit)   ││ (Isolated)  ││ (Automated) │
└─────────────┘└──────────────┘└──────────────┘└─────────────┘└─────────────┘
```

| Mechanism | Component Location | Target Responsibility | Token Impact |
| :--- | :--- | :--- | :--- |
| **`AGENTS.md`** | `/AGENTS.md` | Permanent safety rules, non-destructive editing policy, empirical verification requirement (~15-20 lines). | Injected per turn (~100 tokens) |
| **Skills** | `.opencode/skills/` | On-demand SOPs: `skill-architecture-review`, `skill-session-handoff`, `skill-qa-verification`. | Loaded only when needed |
| **Commands** | `.opencode/commands/` | User actions: `/memory-status`, `/handoff`, `/memory-update`. | 0 token overhead until typed |
| **Subagents** | `.opencode/agents/` | Context-isolated subagents: `arch-agent` (for ADR validation). | Isolated sub-context |
| **Plugin** | `.opencode/plugins/` | Automated event listeners: `session.created`, `session.idle`, `session.compacted`. | 0 prompt tokens |
| **Storage** | `.openmemory/` | Consolidated persistent state & Git-tracked ADRs. | Read on-demand |

---

## 4. Role Mapping Strategy (Zero Agent Bloat)

Rather than spawning 7 permanent background agents, roles map natively to OpenCode capabilities:

| Role | Technical Implementation | Purpose |
| :--- | :--- | :--- |
| **Product** | `.openmemory/project-state.json` (`activeGoal`, `milestones`) | Manages scope & feature roadmap |
| **Architecture** | `skill-architecture-review` + `arch-agent` subagent | Enforces ADR compliance & design patterns |
| **Security** | `skill-security-audit` | Audits permissions & dependency safety |
| **Development**| Primary OpenCode Agent + `AGENTS.md` rules | Standard pair-programming execution |
| **QA** | `skill-qa-verification` + `npx tsx` test scripts | Autonomous test execution |
| **DevOps** | Automation scripts in `.work/` & `.gitignore` policy | CI/CD & repository stability |
| **Project Management** | `.openmemory/handoff.md` + `/handoff` command | Cross-session context preservation |

---

## 5. Concurrency, Race Condition & Atomic Write Safeguards

To prevent state file corruption during rapid tool execution or unexpected agent exits:
1. **Atomic Write Wrapper**: Writes state data to a temporary file (`.openmemory/project-state.json.tmp`) first, then executes `fs.renameSync` to overwrite `project-state.json` atomically.
2. **Synchronous File Locking**: Standard node file locking flag (`wx` or `w`) prevents concurrent thread collisions during debounced `session.idle` flushes.

---

## 6. Non-Destructive Integration & Coexistence Protocol

1. **Delimited Marker Block for `AGENTS.md`**:
   ```markdown
   <!-- OPENMEMORY:START -->
   ## OpenMemory Integration
   * Operational Memory State: `.openmemory/handoff.md`
   * Available Commands: `/memory-status`, `/handoff`
   <!-- OPENMEMORY:END -->
   ```
2. **Pre-modification Backup**: Automatically creates `.openmemory/backups/AGENTS.md.<timestamp>.bak` before modifying any existing repository file.

---

## 7. Phase 3 Implementation Roadmap

```
  Step 3.1: State Engine Setup (.openmemory/ schema & atomic file writer)
    ├── Create .openmemory/openmemory.json manifest
    └── Implement atomic JSON/Markdown persister helper
        │
  Step 3.2: Production Plugin (.opencode/plugins/openmemory.ts)
    ├── Connect session.created (Loads handoff.md into active context)
    ├── Connect session.idle (Debounced state flush to project-state.json)
    └── Connect session.compacted (Automated handoff snapshot update)
        │
  Step 3.3: Native Slash Commands (.opencode/commands/)
    ├── Implement /memory-status (.opencode/commands/memory-status.md)
    └── Implement /handoff (.opencode/commands/handoff.md)
        │
  Step 3.4: Automated Test & Verification Suite
    └── Run test harness verifying recovery, handoff, and non-destructive merges
```
