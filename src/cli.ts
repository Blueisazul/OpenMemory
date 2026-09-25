#!/usr/bin/env node
import { StorageEngine } from "./storage";
import { installOpenMemory } from "./installer";

export function runCLI(args: string[] = process.argv.slice(2), rootDir?: string): string {
  const storage = new StorageEngine(rootDir);
  const command = args[0] || "status";

  switch (command) {
    case "status": {
      return storage.formatProjectContextSummary();
    }
    case "install": {
      const result = installOpenMemory({ targetDir: rootDir });
      return `[OpenMemory CLI] Installation complete:\n  Target: ${result.targetAgentsMdPath}\n  Storage Initialized: ${result.storageInitialized}\n  AGENTS.md Updated: ${result.agentsMdUpdated}\n  Backup: ${result.backupCreated || "None"}`;
    }
    case "backup": {
      const label = args[1] || "manual-cli";
      const metadata = storage.createBackup(label);
      return `[OpenMemory CLI] Backup created successfully:\n  ID: ${metadata.id}\n  Label: ${metadata.label}\n  Files: ${metadata.filesCount}\n  Path: ${metadata.backupPath}`;
    }
    case "list-backups": {
      const backups = storage.listBackups();
      if (backups.length === 0) {
        return "[OpenMemory CLI] No backups found.";
      }
      return (
        `[OpenMemory CLI] Available Backups (${backups.length}):\n` +
        backups
          .map((b) => `  * ${b.id} [${b.label}] (${b.filesCount} files) - ${b.timestamp}`)
          .join("\n")
      );
    }
    case "restore": {
      const backupId = args[1];
      if (!backupId) {
        throw new Error("[OpenMemory CLI] Missing backup ID argument for restore command");
      }
      storage.restoreBackup(backupId);
      return `[OpenMemory CLI] State restored successfully from backup '${backupId}'.`;
    }
    case "diagnostics": {
      const report = storage.runDiagnostics();
      const checkLines = report.checks
        .map((c) => `  * [${c.passed ? "PASS" : "FAIL"}] ${c.name}: ${c.details}`)
        .join("\n");
      return `[OpenMemory CLI] Storage Diagnostic Report (${report.status}):\n${checkLines}\n  * Orphaned Temp Files Removed: ${report.orphanedTempFilesRemoved}`;
    }
    case "cleanup": {
      const count = storage.cleanupTempFiles();
      return `[OpenMemory CLI] Temp file cleanup complete. Removed ${count} orphaned .tmp file(s).`;
    }
    default: {
      return `[OpenMemory CLI] Usage: openmemory <status|install|backup|list-backups|restore|diagnostics|cleanup>`;
    }
  }
}

// Execute CLI directly if invoked from command line
if (require.main === module) {
  try {
    const output = runCLI();
    console.log(output);
  } catch (err) {
    console.error("[OpenMemory CLI Error]", (err as Error).message);
    process.exit(1);
  }
}
