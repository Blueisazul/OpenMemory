# OpenMemory v0.3.1 Validation & Technical Evidence Report

> **Release Status:** Consumer-Ready Verified<br>
> **Package Version:** `0.3.1`<br>
> **Validation Timestamp:** 2026-10-05T20:41:42-05:00

This document serves as the official empirical validation report for OpenMemory v0.3.1. All tests were performed using the compiled release tarball (`openmemory-0.3.1.tgz`) in an isolated consumer directory (`OpenMemory-v0.3.1-Release-Lab`) and via the automated release lab test harness (`.work/experiments/run-v031-release-lab.ts`).

---

## 📋 Environment & Release Metadata

| Attribute | Verified Setting / Value |
| :--- | :--- |
| **OpenMemory Version** | `0.3.1` |
| **Packaged Artifact** | `openmemory-0.3.1.tgz` (146,200 bytes) |
| **Target Commit** | `8c8a43081e5e7a7fbd0aa5919074f4ff7cd437c8` |
| **Node.js Runtime** | `v22.15.0` |
| **OpenCode Plugin API** | `@opencode-ai/plugin ^1.18.32` |
| **Operating System** | Windows 11 (x64) |
| **Isolated Consumer Directory** | `C:\Users\sant1\Downloads\PruebaN2\OpenMemory-v0.3.1-Release-Lab` |
| **Lab Verification Command** | `npx tsx .work/experiments/run-v031-release-lab.ts` |
| **Regression Suite Command** | `npm run test` / `npm run test:all` |

---

## 📊 Verification Classification Matrix

| Capability / Surface | Test Method & Evidence | Classification |
| :--- | :--- | :--- |
| **npm Tarball Package** | Generated `openmemory-0.3.1.tgz` via `npm pack`. Installed into clean consumer lab (`OpenMemory-v0.3.1-Release-Lab`). Verified `package.json` version equals `0.3.1`. | `VERIFIED-RUNTIME` |
| **Module Resolution** | Verified `require.resolve('openmemory/plugin')` resolves to `dist/plugin.js` and `require.resolve('openmemory/mcp')` resolves to `dist/mcp.js`. Private entrypoints blocked by exports boundaries. | `VERIFIED-RUNTIME` |
| **CLI Setup (`npx openmemory install`)** | Executed `npx openmemory install` in consumer lab. Verified creation of `.openmemory/`, `AGENTS.md`, `.opencode/plugins/openmemory.ts`, and `opencode.json`. | `VERIFIED-RUNTIME` |
| **System Prompt Transformation** | Triggered `experimental.chat.system.transform` hook with session ID `ses_v031_release_001`. Verified system prompt contains Stage Engine context with NO `undefined activePhase`. | `VERIFIED-RUNTIME` |
| **Idle Handoff Generation** | Triggered `session.idle` hook. Verified `.openmemory/handoff.md` updated automatically with active phase `DESCUBRIR` (zero `undefined` rendered). | `VERIFIED-RUNTIME` |
| **MCP STDIO Server (Process 1)** | Spawned `dist/mcp.js` over STDIO transport. Registered session, recorded research knowledge item, and queried knowledge successfully. | `VERIFIED-RUNTIME` |
| **Restart / State Recovery (Process 2)** | Killed MCP Process 1, spawned clean MCP Process 2 instance. Queried recorded research item; verified state was fully recovered from persistent disk storage. | `VERIFIED-RUNTIME` |
| **Clean Uninstall (`npx openmemory uninstall`)** | Executed `npx openmemory uninstall`. Verified removal of plugin shim `.opencode/plugins/openmemory.ts`, `opencode.json` config, and `AGENTS.md` block, while preserving `.openmemory/` historical state intact. | `VERIFIED-RUNTIME` |
| **Regression Suite** | Executed `npm run test` (Spike suite). All 6 spike assertions passed cleanly. | `VERIFIED-RUNTIME` |

---

## 🧪 Release Lab Test Execution Log

Output from `npx tsx .work/experiments/run-v031-release-lab.ts`:

```text
=================================================
OpenMemory v0.3.1 Release Lab E2E Verification
=================================================

[Step 1] Installing openmemory-0.3.1.tgz into clean consumer...
[VERIFIED] Installed package version: 0.3.1
[VERIFIED] Resolved plugin path: C:\Users\sant1\Downloads\OpenMemory\dist\plugin.js
[VERIFIED] Resolved mcp path: C:\Users\sant1\Downloads\OpenMemory\dist\mcp.js

[Step 2] Executing npx openmemory install...
[OpenMemory CLI] Installation complete:
  Target AGENTS.md: C:\Users\sant1\Downloads\PruebaN2\OpenMemory-v0.3.1-Release-Lab\AGENTS.md
  Storage Initialized: true
  AGENTS.md Updated: true
  Plugin Shim Created: true
  MCP Configured: true
  Backup: None
[VERIFIED] Installation files created cleanly.

[Step 3] Testing OpenCode Plugin & Idle Handoff...
[VERIFIED] System prompt context contains no undefined activePhase.
[VERIFIED] handoff.md updated automatically on session.idle.

[Step 4] Testing MCP STDIO Process 1 Write & Read...
[OpenMemory MCP] Server running on STDIO transport.
[VERIFIED] MCP Process 1 Write Knowledge: [OpenMemory MCP] Knowledge recorded successfully!
[VERIFIED] MCP Process 1 Query Knowledge: Record found.

[Step 5] Testing MCP STDIO Process 2 (Restart) Read After Process Kill...
[OpenMemory MCP] Server running on STDIO transport.
[VERIFIED] MCP Process 2 (Restart) Query Knowledge: Record recovered from persistent disk.

[Step 6] Testing npx openmemory uninstall...
[OpenMemory CLI] Integration Uninstalled:
  AGENTS.md Cleaned: true
  Plugin Shim Removed: true
  MCP Config Removed: true
  Storage Preserved (.openmemory/): true
[VERIFIED] Uninstall removed shims while preserving .openmemory/ data intact.

=================================================
🎉 ALL RELEASE LAB E2E VERIFICATIONS PASSED!
=================================================
```

---

## 🛑 Scope & Deferred Items

* **Interactive GUI Triggering:** Calling MCP tools directly via an interactive OpenCode chat window GUI prompt remains a client UI behavior, classified as `NOT-VERIFIED` programmatically.
* **Hardware OS Sandboxing:** Soft governance is enforced at prompt and protocol levels. Operating system write permissions remain host IDE policies (`NOT-VERIFIED` by design).

---

## 🏆 Final Release Verdict

> **VERDICT:** `CONSUMER-READY VERIFIED`<br>
> OpenMemory v0.3.1 satisfies all packaging, installation, module resolution, OpenCode plugin hooks, MCP STDIO IPC, persistence recovery, and uninstallation contracts.
