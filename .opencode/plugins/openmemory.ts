import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "../../src/storage";
import { StageEngine } from "../../src/stage-engine";

/**
 * Official OpenMemory OpenCode Lifecycle Plugin (v0.1.0 + Stage Governance)
 *
 * Integrates OpenCode native session lifecycle events (session.created, session.idle, session.compacted)
 * with OpenMemory's zero-dependency StorageEngine & Master Prompt StageEngine.
 *
 * Principles:
 * 1. Zero Core Modification.
 * 2. Non-Destructive Storage Management.
 * 3. Atomic Disk Persistence.
 * 4. Master Prompt Governance & Human Gate Enforcement.
 */
export const OpenMemoryPlugin: Plugin = async ({ client, project, $, directory, worktree }) => {
  const rootDir = directory || worktree || process.cwd();
  const storage = new StorageEngine(rootDir);
  const stageEngine = new StageEngine(rootDir);

  // Initialize storage structure non-destructively on plugin load
  storage.ensureStorageStructure();
  stageEngine.getStageState();
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

  // Cleanup orphaned temp files on plugin startup
  const cleanedTempFiles = storage.cleanupTempFiles();

  logEvent("plugin.initialized", {
    message: "Official OpenMemory Plugin with Master Prompt Stage Engine loaded",
    project: project || manifest.projectName || "OpenMemory",
    cleanedTempFiles,
  });

  return {
    // -------------------------------------------------------------
    // PROGRESSIVE ENHANCEMENT: experimental.chat.system.transform
    // Injects Master Prompt Governance & Knowledge Index summary into system prompt.
    // -------------------------------------------------------------
    "experimental.chat.system.transform": async (
      input: { sessionID?: string; model?: unknown },
      output?: { system: string[] }
    ) => {
      try {
        const knowledgeIndex = storage.formatKnowledgeIndexSummary();
        const stagePromptContext = stageEngine.formatSystemPromptContext();
        const combinedContext = `${stagePromptContext}\n\n${knowledgeIndex}`;

        if (output && Array.isArray(output.system)) {
          output.system.push(combinedContext);
        }
        logEvent("experimental.chat.system.transform", {
          message: "Injected Stage Engine Governance & Knowledge Index into system prompt",
          sessionID: input?.sessionID,
        });
        return {
          system: output?.system || [combinedContext],
        };
      } catch (err) {
        console.warn("[OpenMemory Plugin] experimental.chat.system.transform fallback triggered:", err);
      }
    },

    // -------------------------------------------------------------
    // PROGRESSIVE ENHANCEMENT: experimental.session.compacting
    // Safely appends handoff context, stage state, and Knowledge Index summary.
    // -------------------------------------------------------------
    "experimental.session.compacting": async (
      input: { sessionID?: string; prompt?: string },
      output?: { context: string[]; prompt?: string }
    ) => {
      try {
        const handoffContent = storage.getOrInitHandoff();
        const knowledgeIndex = storage.formatKnowledgeIndexSummary();
        const stageState = stageEngine.getStageState();
        const injectedContext = `[OpenMemory Context Handoff] - Fase ${stageState.currentPhase}\n${handoffContent}\n\n${knowledgeIndex}`;

        if (output && Array.isArray(output.context)) {
          output.context.push(injectedContext);
        }

        logEvent("experimental.session.compacting", {
          message: "Injected handoff, stage state, and knowledge index into compaction context",
          handoffWords: handoffContent.split(/\s+/).length,
          currentPhase: stageState.currentPhase,
        });

        const basePrompt = output?.prompt || input?.prompt || "";
        const injectedPrompt = basePrompt ? `${basePrompt}\n\n${injectedContext}` : injectedContext;

        return {
          ...input,
          context: output?.context || [injectedContext],
          prompt: injectedPrompt,
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
        const stageState = stageEngine.getStageState();

        const sessionId =
          (event.session as { id?: string })?.id || (event.sessionId as string) || `session-${Date.now()}`;

        const isRecovery = currentState.sessionRunCount > 0;
        currentState.sessionRunCount += 1;
        currentState.lastSessionId = sessionId;
        // Preserves active phase, goal & tasks from stageState / projectState
        currentState.activePhase = stageState.currentPhase;
        currentState.activeGoal = stageState.activeGoal || currentState.activeGoal;
        if (currentState.activeTasks && currentState.activeTasks.length > 0 && (!stageState.activeTasks || stageState.activeTasks.length === 0)) {
          stageState.activeTasks = currentState.activeTasks;
        } else if (stageState.activeTasks && stageState.activeTasks.length > 0) {
          currentState.activeTasks = stageState.activeTasks;
        }

        stageState.lastSessionId = sessionId;
        stageEngine.saveStageState(stageState);

        currentState.currentStatus = "SESSION_ACTIVE";
        storage.saveProjectState(currentState);

        const handoffContent = storage.getOrInitHandoff();
        const contextSummary = storage.formatProjectContextSummary();

        logEvent("session.created", {
          sessionId,
          sessionRunCount: currentState.sessionRunCount,
          activePhase: stageState.currentPhase,
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
      // HOOK 3: session.compacted
      // -------------------------------------------------------------
      if (eventType === "session.compacted") {
        const currentState = storage.getOrInitProjectState();
        const stageState = stageEngine.getStageState();

        currentState.currentStatus = "COMPACTION_CHECKPOINT_SAVED";
        storage.saveProjectState(currentState);

        const completedTasks = (stageState.activeTasks || [])
          .filter((t) => t.status === "COMPLETED")
          .map((t) => `${t.id}: ${t.description}`);

        const inProgressTasks = (stageState.activeTasks || [])
          .filter((t) => t.status !== "COMPLETED")
          .map((t) => `${t.id}: ${t.description}`);

        // Dynamic project-specific progress and next steps
        const explicitProject = project || (stageState.projectName !== "OpenMemory" ? stageState.projectName : undefined);
        const isInternalOpenMemoryProject = Boolean(explicitProject && explicitProject.toLowerCase().includes("openmemory"));

        const baselineProgress = isInternalOpenMemoryProject
          ? ["F3.1 Storage Engine, F3.2 Plugin, and F3.3 Handoff Engine active."]
          : [];

        const progressSummary = [
          ...baselineProgress,
          ...(completedTasks.length > 0
            ? completedTasks
            : [`Fase activa: ${stageState.currentPhase} (${stageState.phaseStatus})`]),
        ];

        storage.updateHandoff({
          activeGoal: stageState.activeGoal || currentState.activeGoal,
          activePhase: stageState.currentPhase,
          progressSummary,
          nextSteps:
            inProgressTasks.length > 0
              ? inProgressTasks
              : [
                  stageState.approvalRequired
                    ? `Solicitar aprobación del usuario para pasar a la siguiente fase (${stageState.nextPhase || "FIN"}).`
                    : `Completar entregables y DoD de la fase ${stageState.currentPhase}.`,
                ],
        });

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
