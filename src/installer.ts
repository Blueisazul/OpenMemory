import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "./storage";
import { MASTER_PHASE_ORDER } from "./master-prompt";

export interface InstallationOptions {
  targetDir?: string;
  createAgentsMdIfMissing?: boolean;
}

export interface InstallationResult {
  success: boolean;
  storageInitialized: boolean;
  agentsMdUpdated: boolean;
  backupCreated: string | null;
  targetAgentsMdPath: string;
}

export const OPENMEMORY_DELIMITED_BLOCK = `<!-- OPENMEMORY:START -->
## OpenMemory Context Pointer & Knowledge SOP
* Active Session Handoff: \`.openmemory/handoff.md\`
* Active Project State Index: \`.openmemory/project-state.json\`
* Core Storage Engine: \`src/storage.ts\`
* Governance Boundary Note: StageEngine \`canModifyProductionCode()\` provides protocol/prompt Soft Governance. Hard I/O write sandboxing remains a host IDE policy.
* Research & Knowledge Capture: When research (via Scout, Explore, WebSearch, WebFetch, etc.) yields findings, repository architecture, dependencies, or decisions of future value, synthesize findings and record them via MCP tool \`openmemory_record_knowledge\`. Query past knowledge via \`openmemory_query_knowledge\`.
<!-- OPENMEMORY:END -->`;

export function installOpenMemory(options?: InstallationOptions): InstallationResult {
  const targetDir = options?.targetDir || process.cwd();
  const createIfMissing = options?.createAgentsMdIfMissing ?? true;
  const targetAgentsMdPath = path.join(targetDir, "AGENTS.md");

  const storage = new StorageEngine(targetDir);
  storage.ensureStorageStructure();
  storage.getOrInitManifest();
  storage.getOrInitProjectState();
  storage.getOrInitHandoff();

  let backupCreated: string | null = null;
  let agentsMdUpdated = false;

  const agentsMdExists = fs.existsSync(targetAgentsMdPath);

  if (agentsMdExists) {
    const existingContent = fs.readFileSync(targetAgentsMdPath, "utf-8");

    // 1. Create pre-modification atomic backup snapshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupsDir = path.join(targetDir, ".openmemory", "backups");
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const backupPath = path.join(backupsDir, `AGENTS.md.${timestamp}.bak`);
    backupCreated = backupPath;
    storage.atomicWriteFileSync(backupPath, existingContent);

    // 2. Idempotent block insertion / update
    const blockRegex = /<!-- OPENMEMORY:START -->[\s\S]*?<!-- OPENMEMORY:END -->/;
    let newContent: string;

    if (blockRegex.test(existingContent)) {
      newContent = existingContent.replace(blockRegex, OPENMEMORY_DELIMITED_BLOCK);
    } else {
      const cleanExisting = existingContent.trimEnd();
      newContent = cleanExisting ? `${cleanExisting}\n\n${OPENMEMORY_DELIMITED_BLOCK}\n` : `${OPENMEMORY_DELIMITED_BLOCK}\n`;
    }

    storage.atomicWriteFileSync(targetAgentsMdPath, newContent);
    agentsMdUpdated = true;
  } else if (createIfMissing) {
    const defaultContent = `# Project Agent Guidelines\n\n${OPENMEMORY_DELIMITED_BLOCK}\n`;
    storage.atomicWriteFileSync(targetAgentsMdPath, defaultContent);
    agentsMdUpdated = true;
  }

  return {
    success: true,
    storageInitialized: true,
    agentsMdUpdated,
    backupCreated,
    targetAgentsMdPath,
  };
}

export interface InteractiveInitResult extends InstallationResult {
  discoveredProjectName: string;
  inferredGoal: string;
  inferredPhase: string;
  unknownsIdentified: string[];
  userConfirmed: boolean;
  userAnswers?: {
    projectName: string;
    activeGoal: string;
    activePhase: string;
  };
}

/**
 * F11.1 Interactive /init Wizard
 * Flow: DISCOVER -> INFER -> IDENTIFY UNKNOWN -> ASK -> CONFIRM -> PERSIST
 */
export async function runInteractiveInitWizard(options?: InstallationOptions & {
  answersProvider?: (promptText: string, defaultValue: string) => Promise<string>;
  confirmProvider?: (summaryText: string) => Promise<boolean>;
}): Promise<InteractiveInitResult> {
  const targetDir = options?.targetDir || process.cwd();
  const storage = new StorageEngine(targetDir);

  // 1. DISCOVER & INFER
  let discoveredProjectName = path.basename(targetDir);
  const pkgPath = path.join(targetDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.name) discoveredProjectName = pkg.name;
    } catch (_) {}
  }

  const isInternalOpenMemory = discoveredProjectName.toLowerCase().includes("openmemory");
  const inferredGoal = isInternalOpenMemory
    ? "Implement OpenMemory v0.3 Core Engine & Orchestration"
    : `Inicialización del proyecto ${discoveredProjectName}`;
  const inferredPhase = isInternalOpenMemory ? "PHASE_3_IMPLEMENTATION" : "DESCUBRIR";

  // 2. IDENTIFY UNKNOWN
  const unknownsIdentified: string[] = [];
  const agentsMdPath = path.join(targetDir, "AGENTS.md");
  if (!fs.existsSync(agentsMdPath)) {
    unknownsIdentified.push("AGENTS.md no existe en la raíz del repositorio.");
  }
  if (!fs.existsSync(path.join(targetDir, ".openmemory"))) {
    unknownsIdentified.push("Directorio de memoria de OpenMemory (.openmemory) no inicializado.");
  }
  if (!fs.existsSync(pkgPath)) {
    unknownsIdentified.push("package.json no detectado; nombre de proyecto derivado de la carpeta.");
  }

  // 3. ASK (Interactive Prompting)
  const defaultAsk = async (promptText: string, defaultValue: string): Promise<string> => {
    return new Promise((resolve) => {
      const readline = require("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(`${promptText} [Default: "${defaultValue}"]: `, (answer: string) => {
        rl.close();
        resolve(answer.trim() || defaultValue);
      });
    });
  };

  const ask = options?.answersProvider || defaultAsk;

  const finalProjectName = await ask("DISCOVER: Nombre del proyecto", discoveredProjectName);
  const finalActiveGoal = await ask("INFER: Meta activa del proyecto", inferredGoal);
  const finalActivePhase = await ask("INFER: Fase inicial", inferredPhase);

  // 4. CONFIRM
  const summaryText = [
    `=== OpenMemory /init Wizard Summary ===`,
    `Proyecto: ${finalProjectName}`,
    `Meta Activa: ${finalActiveGoal}`,
    `Fase Inicial: ${finalActivePhase}`,
    `Incertidumbres Identificadas (${unknownsIdentified.length}):`,
    ...unknownsIdentified.map((u) => `  - ${u}`),
    `¿Confirmar y persistir inicialización?`,
  ].join("\n");

  const defaultConfirm = async (text: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const readline = require("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(`${text} (y/N): `, (answer: string) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
      });
    });
  };

  const confirm = options?.confirmProvider || defaultConfirm;
  const userConfirmed = await confirm(summaryText);

  // Cancellation Safeguard: If not confirmed, return without persisting state or modifying disk!
  if (!userConfirmed) {
    return {
      success: false,
      storageInitialized: false,
      agentsMdUpdated: false,
      backupCreated: null,
      targetAgentsMdPath: agentsMdPath,
      discoveredProjectName,
      inferredGoal,
      inferredPhase,
      unknownsIdentified,
      userConfirmed: false,
      userAnswers: {
        projectName: finalProjectName,
        activeGoal: finalActiveGoal,
        activePhase: finalActivePhase,
      },
    };
  }

  // 5. PERSIST (Via StorageEngine Single Writer Facade)
  const installRes = installOpenMemory({ targetDir, createAgentsMdIfMissing: options?.createAgentsMdIfMissing });

  // Update storage state with user-confirmed answers
  const state = storage.getOrInitProjectState();
  if (finalActivePhase) {
    if ((MASTER_PHASE_ORDER as string[]).includes(finalActivePhase)) {
      state.currentStage = finalActivePhase as any;
    }
    if (!state.roadmap) {
      state.roadmap = { activePhaseId: finalActivePhase, phases: [], updatedAt: new Date().toISOString() };
    } else {
      state.roadmap.activePhaseId = finalActivePhase;
    }
  }
  storage.saveProjectState(state);

  // Update manifest if project name changed
  const manifest = storage.getOrInitManifest();
  if (finalProjectName && manifest.projectName !== finalProjectName) {
    manifest.projectName = finalProjectName;
    manifest.updatedAt = new Date().toISOString();
    storage.atomicWriteFileSync(path.join(targetDir, ".openmemory", "openmemory.json"), JSON.stringify(manifest, null, 2));
  }

  storage.logEvent(
    "init.interactive_completed",
    {
      projectName: finalProjectName,
      activeGoal: finalActiveGoal,
      currentStage: state.currentStage,
      unknownsCount: unknownsIdentified.length,
    },
    "agent-init"
  );

  return {
    ...installRes,
    discoveredProjectName,
    inferredGoal,
    inferredPhase,
    unknownsIdentified,
    userConfirmed: true,
    userAnswers: {
      projectName: finalProjectName,
      activeGoal: finalActiveGoal,
      activePhase: finalActivePhase,
    },
  };
}

