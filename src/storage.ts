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

export interface ADRRecord {
  id: string; // e.g. "ADR-001"
  title: string;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDE" | "DEPRECATED";
  date: string;
  context: string;
  decision: string;
  consequences?: string;
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

  // =========================================================================
  // F3.4 PROJECT CONTEXT & MEMORY INTEGRATION ENGINE EXTENSIONS
  // =========================================================================

  /**
   * Create or update an Architecture Decision Record (ADR) atomically (F3.4-001)
   */
  public saveADR(adr: Omit<ADRRecord, "id"> & { id?: string }): ADRRecord {
    this.ensureStorageStructure();

    let id = adr.id;
    if (!id) {
      const existing = this.listADRs();
      const nextNum = existing.length + 1;
      id = `ADR-${String(nextNum).padStart(3, "0")}`;
    } else if (!id.startsWith("ADR-")) {
      id = `ADR-${id.padStart(3, "0")}`;
    }

    const record: ADRRecord = {
      id,
      title: adr.title,
      status: adr.status || "ACCEPTED",
      date: adr.date || new Date().toISOString().split("T")[0],
      context: adr.context,
      decision: adr.decision,
      consequences: adr.consequences,
    };

    const markdown = `# ${record.id}: ${record.title}\n\n**Status:** ${record.status}  \n**Date:** ${record.date}  \n\n## Context\n${record.context.trim()}\n\n## Decision\n${record.decision.trim()}\n${
      record.consequences ? `\n## Consequences\n${record.consequences.trim()}\n` : ""
    }`;

    const filePath = path.join(this.adrsDir, `${record.id}.md`);
    this.atomicWriteFileSync(filePath, markdown);

    return record;
  }

  /**
   * Parse ADR Markdown file into ADRRecord structure
   */
  private parseADRMarkdown(content: string, filename: string): ADRRecord {
    const fallbackId = path.basename(filename, ".md");
    const lines = content.split("\n");

    let id = fallbackId;
    let title = fallbackId;
    let status: ADRRecord["status"] = "ACCEPTED";
    let date = new Date().toISOString().split("T")[0];

    const headerLine = lines.find((l) => l.startsWith("# "));
    if (headerLine) {
      const headerText = headerLine.substring(2).trim();
      const match = headerText.match(/^(ADR-\d+):\s*(.*)$/);
      if (match) {
        id = match[1];
        title = match[2];
      } else {
        title = headerText;
      }
    }

    const statusLine = lines.find((l) => l.includes("**Status:**"));
    if (statusLine) {
      const match = statusLine.match(/\*\*Status:\*\*\s*(\w+)/);
      if (match) {
        status = match[1] as ADRRecord["status"];
      }
    }

    const dateLine = lines.find((l) => l.includes("**Date:**"));
    if (dateLine) {
      const match = dateLine.match(/\*\*Date:\*\*\s*([\d-]+)/);
      if (match) {
        date = match[1];
      }
    }

    let currentSection = "";
    let contextLines: string[] = [];
    let decisionLines: string[] = [];
    let consequencesLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        currentSection = line.substring(3).trim().toLowerCase();
        continue;
      }
      if (currentSection === "context") {
        contextLines.push(line);
      } else if (currentSection === "decision") {
        decisionLines.push(line);
      } else if (currentSection === "consequences") {
        consequencesLines.push(line);
      }
    }

    return {
      id,
      title,
      status,
      date,
      context: contextLines.join("\n").trim(),
      decision: decisionLines.join("\n").trim(),
      consequences: consequencesLines.length > 0 ? consequencesLines.join("\n").trim() : undefined,
    };
  }

  /**
   * Index and list all ADR records sorted by ID (F3.4-002)
   */
  public listADRs(): ADRRecord[] {
    this.ensureStorageStructure();
    if (!fs.existsSync(this.adrsDir)) {
      return [];
    }
    const files = fs.readdirSync(this.adrsDir).filter((f) => f.endsWith(".md"));
    const records: ADRRecord[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.adrsDir, file), "utf-8");
        records.push(this.parseADRMarkdown(raw, file));
      } catch (err) {
        console.warn(`[OpenMemory Storage] Failed to parse ADR file ${file}:`, err);
      }
    }
    return records.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Get single ADR record by ID (F3.4-003)
   */
  public getADR(id: string): ADRRecord | null {
    this.ensureStorageStructure();
    const normalizedId = id.startsWith("ADR-") ? id : `ADR-${id.padStart(3, "0")}`;
    const filePath = path.join(this.adrsDir, `${normalizedId}.md`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return this.parseADRMarkdown(raw, `${normalizedId}.md`);
    } catch (err) {
      return null;
    }
  }

  /**
   * Add active task to project state (F3.4-004)
   */
  public addTask(
    description: string,
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" = "PENDING"
  ): TaskState {
    const state = this.getOrInitProjectState();
    const nextNum = state.activeTasks.length + 1;
    const id = `TASK-${String(nextNum).padStart(3, "0")}`;
    const newTask: TaskState = { id, description, status };
    state.activeTasks.push(newTask);
    this.saveProjectState(state);
    return newTask;
  }

  /**
   * Update active task status in project state (F3.4-004)
   */
  public updateTaskStatus(
    id: string,
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
  ): TaskState {
    const state = this.getOrInitProjectState();
    const task = state.activeTasks.find((t) => t.id === id);
    if (!task) {
      throw new Error(`Task with id '${id}' not found`);
    }
    task.status = status;
    this.saveProjectState(state);
    return task;
  }

  /**
   * Update active project goal and phase (F3.4-004)
   */
  public setActiveGoal(goal: string, phase?: string): ProjectState {
    const state = this.getOrInitProjectState();
    state.activeGoal = goal;
    if (phase) {
      state.activePhase = phase;
    }
    this.saveProjectState(state);
    return state;
  }

  /**
   * Synthesize project context summary in Markdown (F3.4-005)
   */
  public formatProjectContextSummary(): string {
    const manifest = this.getOrInitManifest();
    const state = this.getOrInitProjectState();
    const adrs = this.listADRs();
    const handoff = this.getOrInitHandoff();
    const handoffWords = handoff.split(/\s+/).length;

    const tasksStr =
      state.activeTasks.length === 0
        ? "* No active tasks registered."
        : state.activeTasks
            .map((t) => `* [${t.status}] ${t.id}: ${t.description}`)
            .join("\n");

    const adrsStr =
      adrs.length === 0
        ? "* No ADRs registered."
        : adrs.map((a) => `* [${a.status}] ${a.id}: ${a.title} (${a.date})`).join("\n");

    return `# OpenMemory Project Context Summary

**Project:** ${manifest.projectName} (v${manifest.version})  
**Active Phase:** ${state.activePhase}  
**Current Goal:** ${state.activeGoal}  
**Status:** ${state.currentStatus}  
**Last Updated:** ${state.lastUpdated}  

## Active Tasks
${tasksStr}

## Architectural Decision Records (ADRs)
${adrsStr}

## Session Continuity Handoff Pointer
* Active Session Handoff: \`.openmemory/handoff.md\` (${handoffWords} words)
`;
  }
}

