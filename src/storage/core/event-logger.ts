import * as fs from "fs";
import * as path from "path";

export interface LogEventEntry {
  timestamp: string;
  eventType: string;
  agentId?: string;
  sessionId?: string;
  payload: Record<string, unknown>;
}

export class EventLogger {
  private logsDir: string;

  constructor(logsDir: string) {
    this.logsDir = logsDir;
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  public internalAppendEventEntry(entry: LogEventEntry): void {
    try {
      this.ensureLogsDir();
      const eventLogFile = path.join(this.logsDir, "events.jsonl");
      fs.appendFileSync(eventLogFile, JSON.stringify(entry) + "\n", "utf-8");
    } catch (_) {
      // Fail-safe logging
    }
  }

  public rotateEventLogsInternal(
    maxSizeBytes: number = 1048576,
    maxArchiveFiles: number = 3
  ): { rotated: boolean; archivedFile?: string; reason?: string } {
    try {
      this.ensureLogsDir();
      const eventLogFile = path.join(this.logsDir, "events.jsonl");

      if (!fs.existsSync(eventLogFile)) {
        return { rotated: false, reason: "Log file does not exist" };
      }

      const stat = fs.statSync(eventLogFile);
      if (stat.size < maxSizeBytes) {
        return { rotated: false, reason: "Log size below threshold" };
      }

      for (let i = maxArchiveFiles - 1; i >= 1; i--) {
        const currentName = i === 1 ? "events.1.jsonl" : `events.${i}.jsonl`;
        const nextName = `events.${i + 1}.jsonl`;
        const currentPath = path.join(this.logsDir, currentName);
        const nextPath = path.join(this.logsDir, nextName);

        if (fs.existsSync(currentPath)) {
          if (fs.existsSync(nextPath)) {
            fs.rmSync(nextPath, { force: true });
          }
          fs.renameSync(currentPath, nextPath);
        }
      }

      const archive1Path = path.join(this.logsDir, "events.1.jsonl");
      if (fs.existsSync(archive1Path)) {
        fs.rmSync(archive1Path, { force: true });
      }
      fs.renameSync(eventLogFile, archive1Path);

      fs.writeFileSync(eventLogFile, "", "utf-8");

      this.internalAppendEventEntry({
        timestamp: new Date().toISOString(),
        eventType: "logs.rotated",
        payload: { archivedFile: "events.1.jsonl", timestamp: new Date().toISOString() },
      });

      return { rotated: true, archivedFile: "events.1.jsonl" };
    } catch (err) {
      return { rotated: false, reason: (err as Error).message };
    }
  }

  public logEvent(
    eventType: string,
    payload: Record<string, unknown>,
    agentId?: string,
    sessionId?: string,
    maxSizeBytes: number = 1048576,
    maxArchiveFiles: number = 3
  ): void {
    try {
      this.ensureLogsDir();
      const eventLogFile = path.join(this.logsDir, "events.jsonl");

      if (fs.existsSync(eventLogFile)) {
        const stat = fs.statSync(eventLogFile);
        if (stat.size >= maxSizeBytes && stat.size > 0) {
          this.rotateEventLogsInternal(maxSizeBytes, maxArchiveFiles);
        }
      }

      const entry: LogEventEntry = {
        timestamp: new Date().toISOString(),
        eventType,
        agentId: agentId || undefined,
        sessionId: sessionId || undefined,
        payload,
      };
      this.internalAppendEventEntry(entry);
    } catch (_) {
      // Fail-safe logging: StorageEngine core operations must never fail due to log append issues
    }
  }
}
