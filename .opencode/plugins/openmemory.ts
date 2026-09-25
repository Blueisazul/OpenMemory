import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";

/**
 * Official OpenMemory OpenCode Lifecycle Plugin (v0.1.0)
 *
 * Integrates OpenCode native session lifecycle events (session.created, session.idle, session.compacted)
 * with OpenMemory's zero-dependency StorageEngine (project-state.json & handoff.md).
 *
 * Principles:
 * 1. Zero Core Modification.
 * 2. Non-Destructive Storage Management.
 * 3. Atomic Disk Persistence.
 * 4. Progressive Enhancement for experimental APIs.
 */
export const OpenMemoryPlugin: Plugin = async ({ client, project, $, directory, worktree }) => {
  const rootDir = directory || worktree || process.cwd();
  const storage = new StorageEngine(rootDir);

  // Initialize storage structure non-destructively on plugin load
  storage.ensureStorageStructure();
  const manifest = storage.getOrInitManifest();

  // Log plugin initialization event
  const logEvent = (eventType: string, payload: Record<string, unknown>) => {
    try {
      const logsDir = path.join(rootDir, ".openmemory", "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const eventLogFile = path.join(logsDir, "events.jsonl");
      const entry = {
        timestamp: new Date().toISOString(),
        eventType,
        frameworkVersion: manifest.version,
        directory: rootDir,
        payload,
      };
      fs.appendFileSync(eventLogFile, JSON.stringify(entry) + "\n", "utf-8");
    } catch (err) {
      console.error("[OpenMemory Plugin] Event logging failed:", err);
    }
  };

  // Cleanup orphaned temp files on plugin startup (F3.5-001)
  const cleanedTempFiles = storage.cleanupTempFiles();

  logEvent("plugin.initialized", {
    message: "Official OpenMemory Plugin loaded",
    project: project || "OpenMemory",
    cleanedTempFiles,
  });

  return {
    // -------------------------------------------------------------
    // PROGRESSIVE ENHANCEMENT: experimental.session.compacting (F3.3-007)
    // Safely appends handoff context to native compaction prompt if available.
    // -------------------------------------------------------------
    "experimental.session.compacting": async (input: { context?: string[]; prompt?: string }) => {
      try {
        const handoffContent = storage.getOrInitHandoff();
        logEvent("experimental.session.compacting", {
          message: "Injected handoff context into compaction prompt",
          handoffWords: handoffContent.split(/\s+/).length,
        });

        return {
          ...input,
          prompt: `${input?.prompt || ""}\n\n[OpenMemory Context Handoff]\n${handoffContent}`,
        };
      } catch (err) {
        console.warn("[OpenMemory Plugin] experimental.session.compacting fallback triggered:", err);
        return input;
      }
    },

    event: async ({ event }: { event: { type: string; [key: string]: unknown } }) => {
      const eventType = event.type;

      // -------------------------------------------------------------
      // HOOK 1: session.created
      // -------------------------------------------------------------
      if (eventType === "session.created") {
        const currentState = storage.getOrInitProjectState();
        const sessionId =
          (event.session as { id?: string })?.id || (event.sessionId as string) || `session-${Date.now()}`;

        const isRecovery = currentState.sessionRunCount > 0;
        currentState.sessionRunCount += 1;
        currentState.lastSessionId = sessionId;
        currentState.activePhase = "PHASE_3_IMPLEMENTATION";
        currentState.currentStatus = "SESSION_ACTIVE";

        storage.saveProjectState(currentState);

        // Load current handoff continuity summary and project context summary (F3.4)
        const handoffContent = storage.getOrInitHandoff();
        const contextSummary = storage.formatProjectContextSummary();

        logEvent("session.created", {
          sessionId,
          sessionRunCount: currentState.sessionRunCount,
          isRecovery,
          handoffWords: handoffContent.split(/\s+/).length,
          contextSummary,
          eventPayload: event,
        });
      }

      // -------------------------------------------------------------
      // HOOK 2: session.idle
      // -------------------------------------------------------------
      if (eventType === "session.idle") {
        const currentState = storage.getOrInitProjectState();

        // Update checkpoint status without redundant writes if already idle
        if (currentState.currentStatus !== "IDLE_CHECKPOINT_SAVED") {
          currentState.currentStatus = "IDLE_CHECKPOINT_SAVED";
          storage.saveProjectState(currentState);
        }

        logEvent("session.idle", {
          checkpointSaved: true,
          eventPayload: event,
        });
      }

      // -------------------------------------------------------------
      // HOOK 3: session.compacted (F3.3 Core Handoff Updater)
      // -------------------------------------------------------------
      if (eventType === "session.compacted") {
        const currentState = storage.getOrInitProjectState();
        currentState.currentStatus = "COMPACTION_CHECKPOINT_SAVED";
        storage.saveProjectState(currentState);

        // Update handoff.md auto-sections non-destructively (F3.3-004)
        storage.updateHandoff({
          activeGoal: currentState.activeGoal,
          activePhase: currentState.activePhase,
          progressSummary: [
            "Phase 1, 1.5, 2, and 2.5 research & spike completed cleanly.",
            "F3.1 Storage Engine, F3.2 Plugin, and F3.3 Handoff Engine active.",
          ],
          nextSteps: [
            "Complete F3.3 Session Handoff & Continuity Engine test suite.",
            "Implement slash commands /memory-status and /handoff (F3.4).",
          ],
        });

        // Record evidence payload dump
        try {
          const evidenceDir = path.join(rootDir, ".work", "evidence");
          if (!fs.existsSync(evidenceDir)) {
            fs.mkdirSync(evidenceDir, { recursive: true });
          }
          const compactionEvidenceFile = path.join(evidenceDir, "opencode-compaction-payload.json");
          fs.writeFileSync(
            compactionEvidenceFile,
            JSON.stringify(
              {
                observedAt: new Date().toISOString(),
                eventType: "session.compacted",
                payload: event,
              },
              null,
              2
            ),
            "utf-8"
          );
        } catch (err) {
          console.error("[OpenMemory Plugin] Failed to write compaction evidence:", err);
        }

        logEvent("session.compacted", {
          eventPayload: event,
          compactionHandled: true,
          handoffUpdated: true,
        });
      }
    },
  };
};

export default OpenMemoryPlugin;
