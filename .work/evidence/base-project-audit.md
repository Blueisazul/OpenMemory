# Evidence: OpenSource Base Project Audit & License Findings

**Date:** September 2026  
**Auditor:** OpenMemory Technical Architecture Agent  

---

## 1. 3rd-Party Repositories Catalog & Classification

| Repository | Owner | License | Runtime / Stack | Reusability | Classification | Justification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `mem0ai/mem0` | `mem0ai` | Apache 2.0 | Python / Vector DB | Architecture | `REFERENCE` | 3-tier memory model reference. Too heavy as base code. |
| `thedotmack/claude-mem` | `thedotmack` | **AGPL-3.0** | TS / SQLite / Chroma | Concepts | `REJECT` / `REFERENCE ONLY` | Strict copyleft license prevents copying code into MIT project. |
| `tickernelz/opencode-mem` | `tickernelz` | MIT | TS / SQLite Vector | Plugin Hook | `ADAPTABLE` | Reference for native OpenCode plugin hook structure. |
| `ZeR020/opencode-mem0` | `ZeR020` | MIT | TS / Vector | Scoring | `REFERENCE` | 7-factor memory scoring model reference for Phase 3. |
| `chriswritescode-dev/opencode-memory` | `chriswritescode-dev` | MIT | TS / JSON State | Session Plan | `REUSABLE` | Session plan state persistence concepts. |

---

## 2. Recommendation

Adopt `BUILD_FROM_SCRATCH` with `REFERENCE_ONLY` strategy. Implement 100% clean-room MIT TypeScript code specifically tailored to OpenCode's native extension points.
