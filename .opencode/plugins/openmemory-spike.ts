import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

/**
 * OpenMemory Phase 2 Controlled Plugin Spike
 * Objective: Empirically validate OpenCode plugin lifecycle, session events,
 * state persistence, and context recovery without modifying core OpenCode code.
 */
export const OpenMemorySpikePlugin: Plugin = async ({ client, project, $, directory, worktree }) => {
  const rootDir = directory || process.cwd();
  const spikeStorageDir = path.join(rootDir, ".openmemory", "spike");
  const eventsLogFile = path.join(spikeStorageDir, "events.jsonl");
  const stateFile = path.join(spikeStorageDir, "state.json");
  const evidenceCompactionFile = path.join(rootDir, ".work", "evidence", "opencode-compaction-payload.json");

  // Helper: Ensure directory exists safely (SPIKE-006 & SPIKE-007)
  const ensureDir = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  };

  // Helper: Log event to JSONL file
  const logEvent = (eventType: string, payload: Record<string, unknown>) => {
    try {
      ensureDir(spikeStorageDir);
      const entry = {
        timestamp: new Date().toISOString(),
        eventType,
        opencodeVersion: "1.18.32",
        directory: rootDir,
        payload,
      };
      fs.appendFileSync(eventsLogFile, JSON.stringify(entry) + "\n", "utf-8");
    } catch (err) {
      console.error("[OpenMemory Spike] Failed to log event:", err);
    }
  };

  // Helper: Load or Initialize State (SPIKE-005 & SPIKE-007)
  const loadState = () => {
    try {
      if (fs.existsSync(stateFile)) {
        const raw = fs.readFileSync(stateFile, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error("[OpenMemory Spike] Error reading state file:", err);
    }
    return {
      initializedAt: new Date().toISOString(),
      sessionRunCount: 0,
      lastSessionId: null,
      activeTaskState: "INITIALIZED",
      recoveredState: false,
    };
  };

  // Helper: Save State (SPIKE-005)
  const saveState = (state: Record<string, unknown>) => {
    try {
      ensureDir(spikeStorageDir);
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8");
    } catch (err) {
      console.error("[OpenMemory Spike] Error writing state file:", err);
    }
  };

  // SPIKE-001: Plugin Discovery & Load Confirmation
  logEvent("plugin.initialized", {
    message: "OpenMemory Spike Plugin loaded successfully by OpenCode",
    worktree: worktree || rootDir,
    project: project || null,
  });

  return {
    event: async ({ event }: { event: { type: string; [key: string]: unknown } }) => {
      const eventType = event.type;

      // SPIKE-002: session.created
      if (eventType === "session.created") {
        const previousState = loadState();
        const currentState = {
          ...previousState,
          sessionRunCount: (previousState.sessionRunCount || 0) + 1,
          lastSessionId: event.session?.id || event.sessionId || `session-${Date.now()}`,
          lastActiveTimestamp: new Date().toISOString(),
          recoveredState: previousState.sessionRunCount > 0,
          activeTaskState: "SPIKE_IN_PROGRESS",
        };

        saveState(currentState);

        logEvent("session.created", {
          eventPayload: event,
          recoveredState: currentState.recoveredState,
          runCount: currentState.sessionRunCount,
        });
      }

      // SPIKE-003: session.idle
      if (eventType === "session.idle") {
        const currentState = loadState();
        currentState.lastIdleTimestamp = new Date().toISOString();
        currentState.status = "IDLE_CHECKPOINT_SAVED";
        saveState(currentState);

        logEvent("session.idle", {
          eventPayload: event,
          checkpointSaved: true,
        });
      }

      // SPIKE-004: session.compacted
      if (eventType === "session.compacted") {
        logEvent("session.compacted", {
          eventPayload: event,
        });

        try {
          ensureDir(path.dirname(evidenceCompactionFile));
          fs.writeFileSync(
            evidenceCompactionFile,
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
          console.error("[OpenMemory Spike] Error writing compaction evidence:", err);
        }
      }
    },
  };
};

export default OpenMemorySpikePlugin;
