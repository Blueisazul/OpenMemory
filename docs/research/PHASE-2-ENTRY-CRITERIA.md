# Phase 2 Entry Criteria & Controlled Spike Specification

**Project Target:** `https://github.com/Blueisazul/OpenMemory`  
**Phase:** Transition from Phase 1.5 to Phase 2  
**Date:** September 2026

---

## 1. Phase 2 Entry Checklist

Before writing production feature code in Phase 2, all criteria below must be explicitly satisfied:

- [x] **Phase 1 Research Audited**: Complete technical audit of OpenCode extension points performed.
- [x] **Base Project Decision Finalized**: `BUILD_FROM_SCRATCH` strategy selected (`docs/research/BASE-PROJECT-DECISION.md`).
- [x] **License Verification**: 100% MIT clean-room implementation policy established; AGPL-3.0 copyleft code rejected.
- [x] **Memory Space Separation Approved**: Strict operational separation between `.work/`, `.openmemory/`, `docs/`, and `.opencode/` defined.
- [x] **Operational Tracking Active**: `.work/CURRENT.md` initialized and tracking active status.
- [x] **Minimal Architecture (v0.1) Defined**: Zero-dependency Markdown + Structured JSON State Engine approved.
- [ ] **Controlled OpenCode Plugin Spike Scope Defined**: Controlled spike planned to verify `session.created` and `session.compacted` event payload behavior.

---

## 2. Controlled Phase 2 Spike Specification

Phase 2 will NOT start by building a complete memory system, vector DBs, RAG, or multiple agents.

Phase 2 MUST start with a **Controlled Plugin Spike** proving the fundamental flow:

```
  OpenCode Server
        │
  (Trigger Event: session.created / session.compacted)
        │
        ▼
  OpenMemory Plugin (.opencode/plugins/openmemory.ts)
        │
        ▼
  State Persister (.openmemory/handoff.md & project-state.json)
        │
        ▼
  Session Recovery Verification
```

### Spike Objectives
1. **SPIKE-001**: Verify exact typed payload of `session.created` event in `@opencode-ai/plugin` and test writing an initial session notice context message.
2. **SPIKE-002**: Trigger context compaction and log the exact payload of `session.compacted` event to `.work/evidence/opencode-compaction-payload.json`.
3. **SPIKE-003**: Verify execution of native custom command `/handoff` from `.opencode/commands/handoff.md`.
4. **SPIKE-004**: Test session recovery by clearing chat history and verifying that `.openmemory/handoff.md` reconstitutes active task state.

---

## 3. Exit Criteria for Phase 2 Spike

The Phase 2 Controlled Spike is complete when:
1. `.openmemory/handoff.md` is automatically updated upon context compaction.
2. `/memory-status` and `/handoff` slash commands execute without error.
3. Chat session restart reads `.openmemory/project-state.json` and restores context cleanly without token inflation (< 500 words).
