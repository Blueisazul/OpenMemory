import * as fs from "fs";
import * as path from "path";
import { StorageEngine } from "./storage";

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
## OpenMemory Context Pointer
* Active Session Handoff: \`.openmemory/handoff.md\`
* Active Project State Index: \`.openmemory/project-state.json\`
* Core Storage Engine: \`src/storage.ts\`
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
    backupCreated = path.join(backupsDir, `AGENTS.md.${timestamp}.bak`);
    storage.atomicWriteFileSync(backupCreated, existingContent);

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
