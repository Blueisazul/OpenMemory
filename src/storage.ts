import * as fs from "fs";
import * as path from "path";

export interface OpenMemoryManifest {
  version: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  config: {
    autoHandoffOnCompaction: boolean;
    autoHandoffOnIdle: boolean;
    maxHandoffWords: number;
    nonDestructiveAgentsMd: boolean;
  };
}

export interface TaskState {
  id: string;
  description: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
}

export interface ProjectState {
  activePhase: string;
  currentStatus: string;
  activeGoal: string;
  activeTasks: TaskState[];
  sessionRunCount: number;
  lastSessionId: string | null;
  lastUpdated: string;
}

export class StorageEngine {
  private baseDir: string;
  private openmemoryDir: string;
  private manifestPath: string;
  private projectStatePath: string;
  private handoffPath: string;
  private adrsDir: string;
  private backupsDir: string;
  private logsDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.cwd();
    this.openmemoryDir = path.join(this.baseDir, ".openmemory");
    this.manifestPath = path.join(this.openmemoryDir, "openmemory.json");
    this.projectStatePath = path.join(this.openmemoryDir, "project-state.json");
    this.handoffPath = path.join(this.openmemoryDir, "handoff.md");
    this.adrsDir = path.join(this.openmemoryDir, "adrs");
    this.backupsDir = path.join(this.openmemoryDir, "backups");
    this.logsDir = path.join(this.openmemoryDir, "logs");
  }

  /**
   * Safe directory initialization (F3.1 - Missing storage recovery)
   */
  public ensureStorageStructure(): void {
    const dirs = [this.openmemoryDir, this.adrsDir, this.backupsDir, this.logsDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Atomic File Writer (F3.1 - Prevents corruption on process exit)
   */
  public atomicWriteFileSync(targetPath: string, content: string): void {
    this.ensureStorageStructure();
    const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    try {
      fs.writeFileSync(tempPath, content, "utf-8");
      fs.renameSync(tempPath, targetPath);
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }
      throw new Error(`Atomic write failed for target ${targetPath}: ${(err as Error).message}`);
    }
  }

  /**
   * Initialize or Read Framework Manifest (openmemory.json)
   */
  public getOrInitManifest(): OpenMemoryManifest {
    this.ensureStorageStructure();
    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, "utf-8");
        return JSON.parse(raw) as OpenMemoryManifest;
      } catch (err) {
        console.warn("[OpenMemory Storage] Corrupted manifest detected, re-initializing...");
      }
    }

    const defaultManifest: OpenMemoryManifest = {
      version: "0.1.0",
      projectName: "OpenMemory",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: {
        autoHandoffOnCompaction: true,
        autoHandoffOnIdle: true,
        maxHandoffWords: 500,
        nonDestructiveAgentsMd: true,
      },
    };

    this.saveManifest(defaultManifest);
    return defaultManifest;
  }

  public saveManifest(manifest: OpenMemoryManifest): void {
    manifest.updatedAt = new Date().toISOString();
    this.atomicWriteFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Initialize or Read Project State (project-state.json)
   */
  public getOrInitProjectState(): ProjectState {
    this.ensureStorageStructure();
    if (fs.existsSync(this.projectStatePath)) {
      try {
        const raw = fs.readFileSync(this.projectStatePath, "utf-8");
        return JSON.parse(raw) as ProjectState;
      } catch (err) {
        console.warn("[OpenMemory Storage] Corrupted project state detected, re-initializing...");
      }
    }

    const defaultState: ProjectState = {
      activePhase: "PHASE_3_STORAGE_FOUNDATION",
      currentStatus: "INITIALIZED",
      activeGoal: "Implement OpenMemory v0.1 Core Engine",
      activeTasks: [
        {
          id: "TASK-F3.1",
          description: "Storage Engine & Atomic File Persistence",
          status: "IN_PROGRESS",
        },
        {
          id: "TASK-F3.2",
          description: "Production Plugin & OpenCode Session Lifecycle",
          status: "PENDING",
        },
      ],
      sessionRunCount: 0,
      lastSessionId: null,
      lastUpdated: new Date().toISOString(),
    };

    this.saveProjectState(defaultState);
    return defaultState;
  }

  public saveProjectState(state: ProjectState): void {
    state.lastUpdated = new Date().toISOString();
    this.atomicWriteFileSync(this.projectStatePath, JSON.stringify(state, null, 2));
  }

  /**
   * Read or Write Session Handoff (handoff.md)
   */
  public getOrInitHandoff(): string {
    this.ensureStorageStructure();
    if (fs.existsSync(this.handoffPath)) {
      return fs.readFileSync(this.handoffPath, "utf-8");
    }

    const defaultHandoff = `# OpenMemory Session Handoff

**Active Goal:** Implement OpenMemory v0.1 Core Engine  
**Current Phase:** Phase 3 — Storage Foundation  
**Last Updated:** ${new Date().toISOString()}  

## Progress Summary
* Phase 1, 1.5, 2, and 2.5 research & spike completed cleanly.
* Storage engine foundation (F3.1) active.

## Key Architectural Decisions
* Zero-dependency native OpenCode TypeScript plugin.
* Markdown + Structured JSON State Engine.

## Uncommitted Work & Next Steps
1. Complete F3.1 Storage Foundation test suite.
2. Implement production plugin .opencode/plugins/openmemory.ts (F3.2).
`;

    this.saveHandoff(defaultHandoff);
    return defaultHandoff;
  }

  public saveHandoff(content: string): void {
    this.atomicWriteFileSync(this.handoffPath, content);
  }
}
