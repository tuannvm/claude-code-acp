import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { promisify } from "node:util";
import { pipeline } from "node:stream";
import { CLAUDE_CONFIG_DIR } from "./acp-agent.js";

const pipelineAsync = promisify(pipeline);

/**
 * Native Claude Code session entry from .jsonl files
 */
export interface NativeSessionEntry {
  parentUuid: string | null;
  isSidechain: boolean;
  userType: "external" | "internal";
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch?: string;
  agentId?: string;
  type: "user" | "assistant" | "system";
  message: {
    role: string;
    content: any;
  };
  uuid: string;
  timestamp: string;
}

/**
 * Session summary information
 */
export interface SessionSummary {
  sessionId: string;
  agentId?: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
  gitBranch?: string;
}

/**
 * Full session with messages
 */
export interface FullSession extends SessionSummary {
  messages: NativeSessionEntry[];
}

/**
 * History manager that reads Claude Code's native .jsonl session files
 */
export class NativeHistoryManager {
  private claudeDir: string;
  private projectsDir: string;

  constructor() {
    this.claudeDir = CLAUDE_CONFIG_DIR;
    this.projectsDir = path.join(this.claudeDir, "projects");
  }

  /**
   * Convert a file path to the Claude Code project directory format
   *
   * Transformation rule:
   * 1. Remove leading /
   * 2. Split by /
   * 3. For segments starting with ., remove the dot and add - prefix
   * 4. Join all segments with -
   * 5. Prepend -
   *
   * Examples:
   * - /Users/tuannvm/.oh-my-zsh → -Users-tuannvm--oh-my-zsh
   * - /Users/tuannvm/Projects/liftoff → -Users-tuannvm-Projects-liftoff
   */
  private pathToProjectDir(projectPath: string): string {
    // Remove leading slash
    const withoutLeading = projectPath.replace(/^\//, "");
    // Split by slash
    const segments = withoutLeading.split("/");
    // Transform: for segments starting with ., remove dot and add -
    const transformed = segments.map((s) =>
      s.startsWith(".") ? "-" + s.slice(1) : s,
    );
    // Join with dashes and prepend leading dash
    const dirName = "-" + transformed.join("-");
    return path.join(this.projectsDir, dirName);
  }

  /**
   * List all session files for a project
   */
  private listProjectSessionFiles(projectPath: string): string[] {
    const projectDir = this.pathToProjectDir(projectPath);

    if (!fs.existsSync(projectDir)) {
      return [];
    }

    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => path.join(projectDir, e.name));
  }

  /**
   * Read and parse a .jsonl session file
   */
  private readSessionFile(filePath: string): NativeSessionEntry[] {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.trim().split("\n");
      const entries: NativeSessionEntry[] = [];

      for (const line of lines) {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line) as NativeSessionEntry;
            entries.push(entry);
          } catch {
            // Skip invalid lines
          }
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * List all sessions across all projects
   */
  listSessions(options?: { limit?: number; cwd?: string }): SessionSummary[] {
    const sessions: SessionSummary[] = [];

    // If cwd is specified, only list sessions for that project
    if (options?.cwd) {
      const sessionFiles = this.listProjectSessionFiles(options.cwd);
      for (const filePath of sessionFiles) {
        const entries = this.readSessionFile(filePath);
        if (entries.length > 0) {
          const summary = this.summarizeSession(entries);
          sessions.push(summary);
        }
      }
    } else {
      // List all sessions across all projects
      if (!fs.existsSync(this.projectsDir)) {
        return sessions;
      }

      const projectDirs = fs.readdirSync(this.projectsDir, { withFileTypes: true });
      for (const projectDir of projectDirs) {
        if (!projectDir.isDirectory()) continue;

        const projectPath = path.join(this.projectsDir, projectDir.name);
        const sessionFiles = fs.readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));

        for (const sessionFile of sessionFiles) {
          const filePath = path.join(projectPath, sessionFile);
          const entries = this.readSessionFile(filePath);
          if (entries.length > 0) {
            const summary = this.summarizeSession(entries);
            sessions.push(summary);
          }
        }
      }
    }

    // Sort by updated time descending
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);

    // Apply limit
    if (options?.limit) {
      return sessions.slice(0, options.limit);
    }

    return sessions;
  }

  /**
   * Get session information and messages
   */
  getSession(sessionId: string): FullSession | null {
    // Search for the session file
    if (!fs.existsSync(this.projectsDir)) {
      return null;
    }

    const projectDirs = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectPath = path.join(this.projectsDir, projectDir.name);
      const sessionFiles = fs.readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));

      for (const sessionFile of sessionFiles) {
        const filePath = path.join(projectPath, sessionFile);
        const entries = this.readSessionFile(filePath);

        if (entries.length > 0 && entries[0].sessionId === sessionId) {
          return {
            ...this.summarizeSession(entries),
            messages: entries,
          };
        }
      }
    }

    return null;
  }

  /**
   * Create a summary from session entries
   */
  private summarizeSession(entries: NativeSessionEntry[]): SessionSummary {
    if (entries.length === 0) {
      throw new Error("Cannot summarize empty session");
    }

    // Find first entry with valid metadata (some entries like queue-operation have null cwd)
    const first = entries.find((e) => e.sessionId && e.cwd) ?? entries[0];
    const last = entries[entries.length - 1];

    // Extract display text from last user message for preview
    let lastMessage: string | undefined;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].type === "user") {
        const content = entries[i].message.content;
        if (typeof content === "string") {
          lastMessage = content.slice(0, 100);
          if (content.length > 100) lastMessage += "...";
        } else if (Array.isArray(content)) {
          const textItem = content.find((c: any) => c.type === "text");
          if (textItem?.text) {
            lastMessage = textItem.text.slice(0, 100);
            if (textItem.text.length > 100) lastMessage += "...";
          }
        }
        break;
      }
    }

    return {
      sessionId: first.sessionId,
      agentId: first.agentId,
      cwd: first.cwd,
      createdAt: new Date(first.timestamp).getTime(),
      updatedAt: new Date(last.timestamp).getTime(),
      messageCount: entries.length,
      lastMessage,
      gitBranch: first.gitBranch,
    };
  }

  /**
   * Get statistics about stored history
   */
  getStats(): { totalSessions: number; totalMessages: number; totalSize: number } {
    let totalSessions = 0;
    let totalMessages = 0;
    let totalSize = 0;

    if (!fs.existsSync(this.projectsDir)) {
      return { totalSessions: 0, totalMessages: 0, totalSize: 0 };
    }

    const projectDirs = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectPath = path.join(this.projectsDir, projectDir.name);
      const sessionFiles = fs.readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));

      for (const sessionFile of sessionFiles) {
        const filePath = path.join(projectPath, sessionFile);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        totalSessions++;

        const entries = this.readSessionFile(filePath);
        totalMessages += entries.length;
      }
    }

    return { totalSessions, totalMessages, totalSize };
  }

  /**
   * Write a session entry to the .jsonl file
   *
   * @param sessionId - The session ID
   * @param entry - The session entry to write
   */
  writeSessionEntry(sessionId: string, entry: NativeSessionEntry): void {
    const projectDir = this.pathToProjectDir(entry.cwd);

    // Create project directory if it doesn't exist
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);

    // Append the entry as a JSON line
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(sessionFile, line, "utf8");
  }

  /**
   * Ensure the project directory exists for a session
   *
   * @param sessionId - The session ID
   * @param cwd - The current working directory
   */
  ensureSessionDirectory(sessionId: string, cwd: string): string {
    const projectDir = this.pathToProjectDir(cwd);

    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    return path.join(projectDir, `${sessionId}.jsonl`);
  }
}

/**
 * Create a native history manager instance
 */
export function createNativeHistoryManager(): NativeHistoryManager {
  return new NativeHistoryManager();
}
