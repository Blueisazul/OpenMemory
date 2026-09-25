# OpenMemory

> Zero-dependency operational memory framework for OpenCode and AI developer agents.

OpenMemory provides a clean-room, MIT-licensed state management, session continuity, ADR tracking, Model Context Protocol (MCP) server adapter, and repository integration framework for AI-assisted software development.

---

## 🚀 Quick Start

### Installation

Install via npm:

```bash
npm install openmemory
```

Or run directly using `npx`:

```bash
npx openmemory install
```

---

## 📋 Features

- **Session Continuity Handoff Engine (`.openmemory/handoff.md`):** Automatically captures progress summaries, architectural decisions, and uncommitted work across AI session compactions.
- **Structured Project State (`.openmemory/project-state.json`):** Tracks active goals, phases, and task execution lists.
- **Architectural Decision Records (`.openmemory/adrs/`):** Programmatic creation, indexing, and retrieval of ADRs.
- **Model Context Protocol (MCP) Adapter:** Built-in MCP server support for STDIO integration with Cursor, Claude Desktop, and OpenCode tools (`openmemory_status`, `openmemory_get_handoff`, `openmemory_save_adr`, etc.).
- **Non-Destructive Repository Installer:** Injects delimited pointer blocks into `AGENTS.md` with pre-modification atomic backups (`.openmemory/backups/`).
- **OpenCode Plugin Lifecycle Integration:** Hooks natively into `session.created`, `session.idle`, `session.compacted`, and `experimental.session.compacting`.

---

## 💻 CLI Commands

```bash
# Display project context summary
npx openmemory status

# Non-destructive repository installation
npx openmemory install

# Create atomic state backup
npx openmemory backup [label]

# List available backups
npx openmemory list-backups

# Restore state from backup snapshot
npx openmemory restore <backup-id>

# Run storage engine diagnostics and auto-recovery
npx openmemory diagnostics

# Clean up temporary files
npx openmemory cleanup
```

---

## 🔌 Programmatic Usage

```typescript
import { StorageEngine, installOpenMemory, createMCPServer } from "openmemory";

// Initialize storage engine
const storage = new StorageEngine();
const summary = storage.formatProjectContextSummary();
console.log(summary);

// Run non-destructive repository installer
const result = installOpenMemory({ targetDir: process.cwd() });
console.log(`Installed: ${result.success}`);
```

---

## 📜 License

[MIT License](LICENSE) © 2026 OpenMemory Contributors
