import * as fs from "fs";
import * as path from "path";
import { LockResult } from "../types";
import { EventLogger } from "./event-logger";

export interface PersistenceEnginePaths {
  openmemoryDir: string;
  adrsDir: string;
  backupsDir: string;
  logsDir: string;
  knowledgeDir: string;
  researchesDir: string;
  ossEvaluationsDir: string;
  locksDir: string;
}

export class PersistenceEngine {
  private paths: PersistenceEnginePaths;
  private currentTransactionToken: string | null = null;
  private eventLogger?: EventLogger;

  constructor(paths: PersistenceEnginePaths, eventLogger?: EventLogger) {
    this.paths = paths;
    this.eventLogger = eventLogger;
  }

  public setEventLogger(eventLogger: EventLogger): void {
    this.eventLogger = eventLogger;
  }

  public ensureStorageStructure(): void {
    const dirs = [
      this.paths.openmemoryDir,
      this.paths.adrsDir,
      this.paths.backupsDir,
      this.paths.logsDir,
      this.paths.knowledgeDir,
      this.paths.researchesDir,
      this.paths.ossEvaluationsDir,
      this.paths.locksDir,
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Atomic File Writer (F3.1 - Prevents corruption on process exit)
   * Single-file atomic replacement mechanism: content -> temp file -> fs.renameSync
   */
  public atomicWriteFileSync(targetPath: string, content: string): void {
    this.ensureStorageStructure();
    const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    try {
      fs.writeFileSync(tempPath, content, "utf-8");
      let attempts = 0;
      while (true) {
        try {
          fs.renameSync(tempPath, targetPath);
          break;
        } catch (err) {
          attempts++;
          if (attempts >= 25 || (err as any).code !== "EPERM") {
            throw err;
          }
          const start = Date.now();
          while (Date.now() - start < 15) {}
        }
      }
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
   * Detailed advisory lock acquisition with atomic stale lock recovery & token generation (F12.3-E)
   */
  public tryAcquireLockDetailed(resourceKey: string, agentId: string, ttlMs: number = 5000): LockResult {
    this.ensureStorageStructure();
    const sanitizedKey = resourceKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const lockFileName = `${sanitizedKey}.lock`;
    const lockPath = path.join(this.paths.locksDir, lockFileName);
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const randUuid = Math.random().toString(36).substring(2, 10);
    const token = `tok_${agentId}_${now}_${randUuid}`;
    const payload = JSON.stringify({ owner: agentId, token, pid: process.pid, acquiredAt: now, expiresAt });

    const acquireEventType = resourceKey === "project-state-transaction" ? "lock.transaction_acquired" : "lock.acquired";
    try {
      fs.writeFileSync(lockPath, payload, { flag: "wx" });
      if (this.eventLogger) {
        this.eventLogger.logEvent(acquireEventType, { resourceKey, agentId, token, ttlMs, expiresAt }, agentId);
      }
      return { acquired: true, token, expiresAt };
    } catch (_) {
      // Direct acquisition failed: lock file already exists
    }

    try {
      if (fs.existsSync(lockPath)) {
        let isStale = false;
        try {
          const content = fs.readFileSync(lockPath, "utf-8");
          const lockData = JSON.parse(content);
          if (lockData.expiresAt <= now) {
            isStale = true;
          }
        } catch (_) {
          isStale = true;
        }

        if (isStale) {
          const tempGarbagePath = path.join(this.paths.locksDir, `${sanitizedKey}.stale.${now}.${randUuid}.tmp`);
          try {
            fs.renameSync(lockPath, tempGarbagePath);
            try { fs.unlinkSync(tempGarbagePath); } catch (__) {}

            try {
              fs.writeFileSync(lockPath, payload, { flag: "wx" });
              const staleAcquireEventType = resourceKey === "project-state-transaction" ? "lock.transaction_acquired_stale_recovered" : "lock.acquired_stale_recovered";
              if (this.eventLogger) {
                this.eventLogger.logEvent(staleAcquireEventType, { resourceKey, agentId, token, ttlMs, expiresAt }, agentId);
              }
              return { acquired: true, token, expiresAt };
            } catch (__) {
              return { acquired: false, reason: "Lock contention during stale re-acquisition" };
            }
          } catch (_) {
            return { acquired: false, reason: "Stale lock cleanup race lost" };
          }
        }
      }
    } catch (_) {}

    return { acquired: false, reason: "Lock actively held" };
  }

  public tryAcquireLock(resourceKey: string, agentId: string, ttlMs: number = 5000): boolean {
    const res = this.tryAcquireLockDetailed(resourceKey, agentId, ttlMs);
    return res.acquired;
  }

  public releaseLockDetailed(resourceKey: string, agentId: string, token?: string): boolean {
    this.ensureStorageStructure();
    const sanitizedKey = resourceKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const lockFileName = `${sanitizedKey}.lock`;
    const lockPath = path.join(this.paths.locksDir, lockFileName);

    if (!fs.existsSync(lockPath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(lockPath, "utf-8");
      const lockData = JSON.parse(content);

      if (token) {
        if (lockData.token !== token) {
          return false;
        }
      } else {
        if (lockData.owner !== agentId) {
          return false;
        }
        if (lockData.expiresAt <= Date.now()) {
          return false;
        }
      }

      fs.unlinkSync(lockPath);
      const releaseEventType = resourceKey === "project-state-transaction" ? "lock.transaction_released" : "lock.released";
      if (this.eventLogger) {
        this.eventLogger.logEvent(releaseEventType, { resourceKey, agentId, token: lockData.token }, agentId);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  public releaseLock(resourceKey: string, agentId: string): boolean {
    return this.releaseLockDetailed(resourceKey, agentId);
  }

  public withStateLock<T>(fn: () => T, agentId: string = "system"): T {
    const lockKey = "project-state-transaction";

    if (this.currentTransactionToken !== null) {
      return fn();
    }

    const maxWaitMs = 1000;
    const pollIntervalMs = 10;
    const start = Date.now();
    let lockRes: LockResult | null = null;

    while (Date.now() - start <= maxWaitMs) {
      lockRes = this.tryAcquireLockDetailed(lockKey, agentId, 5000);
      if (lockRes.acquired) break;

      const jitter = Math.floor(Math.random() * 6);
      const sleepUntil = Date.now() + pollIntervalMs + jitter;
      while (Date.now() < sleepUntil) {}
    }

    if (!lockRes || !lockRes.acquired || !lockRes.token) {
      throw new Error(`State transaction lock contention: Could not acquire '${lockKey}' lock within ${maxWaitMs}ms.`);
    }

    this.currentTransactionToken = lockRes.token;
    try {
      return fn();
    } finally {
      this.currentTransactionToken = null;
      this.releaseLockDetailed(lockKey, agentId, lockRes.token);
    }
  }

  public cleanupStaleLocks(): number {
    this.ensureStorageStructure();
    if (!fs.existsSync(this.paths.locksDir)) return 0;

    let cleaned = 0;
    const now = Date.now();
    const files = fs.readdirSync(this.paths.locksDir);

    for (const file of files) {
      const filePath = path.join(this.paths.locksDir, file);
      try {
        if (file.endsWith(".tmp")) {
          fs.unlinkSync(filePath);
          cleaned++;
          continue;
        }
        if (file.endsWith(".lock")) {
          const content = fs.readFileSync(filePath, "utf-8");
          const lockData = JSON.parse(content);
          if (lockData.expiresAt <= now) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        }
      } catch (_) {
        try {
          fs.unlinkSync(filePath);
          cleaned++;
        } catch (__) {}
      }
    }

    if (cleaned > 0 && this.eventLogger) {
      this.eventLogger.logEvent("locks.cleaned", { cleanedCount: cleaned });
    }

    return cleaned;
  }

  public cleanupTempFiles(): number {
    this.ensureStorageStructure();
    let count = 0;
    const searchDirs = [this.paths.openmemoryDir, this.paths.adrsDir, this.paths.knowledgeDir, this.paths.researchesDir];
    for (const dir of searchDirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (f.endsWith(".tmp")) {
              try {
                fs.unlinkSync(path.join(dir, f));
                count++;
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    }
    return count;
  }
}
