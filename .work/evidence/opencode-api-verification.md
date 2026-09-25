# Evidence: OpenCode Plugin API Verification & Event Hooks Audit

**Date:** September 2026  
**Auditor:** OpenMemory Technical Architecture Agent  

---

## 1. Classification of OpenCode Extension Points

| OpenCode Mechanism | Documented | Supported | Verified Status | Technical Justification & Notes |
| :--- | :---: | :---: | :--- | :--- |
| `AGENTS.md` | Yes | Yes | `VERIFICADA` | Standard instruction discovery across root, subdirectory, and global configs. Re-injected on every turn. |
| Custom Commands (`.opencode/commands/*.md`) | Yes | Yes | `VERIFICADA` | Markdown frontmatter + template body + `$ARGUMENTS` variable support verified. |
| Modular Skills (`.opencode/skills/<id>/SKILL.md`) | Yes | Yes | `VERIFICADA` | Loaded on-demand via system prompt selection. Verified structure. |
| Subagents (`.opencode/agents/*.md`) | Yes | Yes | `VERIFICADA` | Isolated context execution mode `subagent` with `subagent_depth` control verified. |
| TypeScript Plugins (`.opencode/plugins/*.ts`) | Yes | Yes | `VERIFICADA` | Exported `async ({ client, project, $, directory, worktree }) => Plugin` function verified against `@opencode-ai/plugin`. |
| `session.created` Hook | Yes | Yes | `VERIFICADA` | Emitted when session is initialized. Can execute async startup logic. |
| `session.compacted` Hook | Yes | Yes | `REQUIERE SPIKE` | Emitted post-context compaction. Payload object structure requires empirical logging spike in Phase 2. |
| `session.idle` Hook | Yes | Yes | `PARCIALMENTE VERIFICADA` | Emitted when agent finishes turn. Suitable for debounced disk flush. |
| `tool.execute.before/after` Hooks | Yes | Experimental | `PARCIALMENTE VERIFICADA` | Experimental API. Avoid using for core state in v0.1 to prevent upstream breaking changes. |
| Model Context Protocol (MCP) | Yes | Yes | `VERIFICADA` | Standardized JSON-RPC protocol over STDIO/SSE. Deferred to Phase 4. |

---

## 2. Verified Hook Registration Syntax (`@opencode-ai/plugin`)

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const OpenMemoryPlugin: Plugin = async ({ client, project, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        // Handle session initialization
      }
      if (event.type === "session.compacted") {
        // Handle context compaction snapshot (Requires Spike for exact payload verification)
      }
      if (event.type === "session.idle") {
        // Flush pending state to .openmemory/
      }
    }
  };
};
```
