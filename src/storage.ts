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

export interface HandoffSection {
  title: string; // Header title e.g. "Key Architectural Decisions" or "" for top header
  content: string;
  isAutoOwned: boolean;
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
      activePhase: "PHASE_3_IMPLEMENTATION",
      currentStatus: "INITIALIZED",
      activeGoal: "Implement OpenMemory v0.1 Core Engine",
      activeTasks: [
        {
          id: "TASK-F3.1",
          description: "Storage Engine & Atomic File Persistence",
          status: "COMPLETED",
        },
        {
          id: "TASK-F3.2",
          description: "Production Plugin & OpenCode Session Lifecycle",
          status: "COMPLETED",
        },
        {
          id: "TASK-F3.3",
          description: "Session Handoff & Continuity Engine",
          status: "IN_PROGRESS",
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
**Current Phase:** Phase 3 — Implementation  
**Last Updated:** ${new Date().toISOString()}  

## Progress Summary
* Phase 1, 1.5, 2, and 2.5 research & spike completed cleanly.
* F3.1 Storage Foundation and F3.2 Official Plugin implemented and tested.

## Key Architectural Decisions
* Zero-dependency native OpenCode TypeScript plugin.
* Markdown + Structured JSON State Engine with atomic file writers (\`.tmp\` + \`fs.renameSync\`).

## Uncommitted Work & Next Steps
1. Complete F3.3 Session Handoff & Continuity Engine test suite.
2. Register native slash commands /memory-status and /handoff (F3.4).
`;

    this.saveHandoff(defaultHandoff);
    return defaultHandoff;
  }

  public saveHandoff(content: string): void {
    this.atomicWriteFileSync(this.handoffPath, content);
  }

  // =========================================================================
  // F3.3 SESSION HANDOFF ENGINE EXTENSIONS
  // =========================================================================

  /**
   * Parse Markdown Handoff into sections delimited by '## ' headers (F3.3-001)
   */
  public parseHandoffSections(markdown: string): HandoffSection[] {
    const lines = markdown.split("\n");
    const sections: HandoffSection[] = [];
    let currentTitle = "";
    let currentContent: string[] = [];

    const autoOwnedTitles = [
      "Progress Summary",
      "Uncommitted Work & Next Steps",
      "Uncommitted Work and Next Steps",
    ];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (currentContent.length > 0 || currentTitle !== "") {
          sections.push({
            title: currentTitle,
            content: currentContent.join("\n"),
            isAutoOwned: currentTitle === "" ? true : autoOwnedTitles.includes(currentTitle.trim()),
          });
        }
        currentTitle = line.substring(3).trim();
        currentContent = [line];
      } else {
        currentContent.push(line);
      }
    }

    if (currentContent.length > 0) {
      sections.push({
        title: currentTitle,
        content: currentContent.join("\n"),
        isAutoOwned: currentTitle === "" ? true : autoOwnedTitles.includes(currentTitle.trim()),
      });
    }

    return sections;
  }

  /**
   * Non-destructive Handoff Updater (F3.3-002 & F3.3-006)
   * Updates auto-owned sections while preserving human-owned sections (e.g. ## Key Architectural Decisions, ## Developer Notes) verbatim.
   */
  public updateHandoff(updates: {
    activeGoal?: string;
    activePhase?: string;
    progressSummary?: string[];
    nextSteps?: string[];
  }): string {
    const rawHandoff = this.getOrInitHandoff();
    const parsedSections = this.parseHandoffSections(rawHandoff);
    const manifest = this.getOrInitManifest();
    const maxWords = manifest.config.maxHandoffWords || 500;

    const updatedSections: string[] = [];

    // Header block (before first ## header)
    const activeGoal = updates.activeGoal || "Implement OpenMemory v0.1 Core Engine";
    const activePhase = updates.activePhase || "Phase 3 — Implementation";
    const newHeader = `# OpenMemory Session Handoff\n\n**Active Goal:** ${activeGoal}  \n**Current Phase:** ${activePhase}  \n**Last Updated:** ${new Date().toISOString()}  \n`;

    updatedSections.push(newHeader);

    // Track which auto sections were updated
    let progressSummaryAdded = false;
    let nextStepsAdded = false;

    for (const section of parsedSections) {
      if (section.title === "") {
        // Top header block already replaced by newHeader
        continue;
      }

      if (section.title.trim() === "Progress Summary") {
        const summaryItems = updates.progressSummary || [
          "Phase 1, 1.5, 2, and 2.5 research & spike completed cleanly.",
          "F3.1 Storage Foundation, F3.2 Plugin, and F3.3 Handoff Engine active.",
        ];
        const newProgressSection = `## Progress Summary\n${summaryItems.map((item) => `* ${item}`).join("\n")}\n`;
        updatedSections.push(newProgressSection);
        progressSummaryAdded = true;
      } else if (
        section.title.trim() === "Uncommitted Work & Next Steps" ||
        section.title.trim() === "Uncommitted Work and Next Steps"
      ) {
        const stepItems = updates.nextSteps || [
          "Complete F3.3 Session Handoff & Continuity Engine test suite.",
          "Implement slash commands /memory-status and /handoff (F3.4).",
        ];
        const newNextStepsSection = `## Uncommitted Work & Next Steps\n${stepItems
          .map((item, i) => `${i + 1}. ${item}`)
          .join("\n")}\n`;
        updatedSections.push(newNextStepsSection);
        nextStepsAdded = true;
      } else {
        // Human-owned or custom section: PRESERVE VERBATIM (F3.3-006)
        updatedSections.push(section.content.trim() + "\n");
      }
    }

    // Add auto-sections if they didn't exist in original handoff
    if (!progressSummaryAdded && updates.progressSummary) {
      updatedSections.push(
        `## Progress Summary\n${updates.progressSummary.map((item) => `* ${item}`).join("\n")}\n`
      );
    }
    if (!nextStepsAdded && updates.nextSteps) {
      updatedSections.push(
        `## Uncommitted Work & Next Steps\n${updates.nextSteps.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n`
      );
    }

    let finalMarkdown = updatedSections.join("\n").trim() + "\n";

    // Enforce 500-word ceiling (F3.3-003)
    finalMarkdown = this.truncateHandoffWords(finalMarkdown, maxWords);

    this.saveHandoff(finalMarkdown);
    return finalMarkdown;
  }

  /**
   * Word count ceiling safeguard (F3.3-003)
   */
  public truncateHandoffWords(markdown: string, maxWords: number): string {
    const words = markdown.split(/\s+/);
    if (words.length <= maxWords) {
      return markdown;
    }
    // Truncate narrative while keeping valid file trailing notice
    const truncatedWords = words.slice(0, maxWords);
    return truncatedWords.join(" ") + "\n\n*(Truncated to maxHandoffWords limit)*\n";
  }
}
