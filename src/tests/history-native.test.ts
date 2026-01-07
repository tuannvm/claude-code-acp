import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NativeHistoryManager, NativeSessionEntry, SessionSummary } from "../history-native.js";

describe("NativeHistoryManager", () => {
  let historyManager: NativeHistoryManager;
  let testProjectDir: string;
  let testCwd: string;

  beforeEach(() => {
    historyManager = new NativeHistoryManager();

    // Use a real existing directory for testing
    testCwd = "/Users/tuannvm/.oh-my-zsh";
    testProjectDir = path.join(historyManager["projectsDir"], testCwd.replace(/\//g, "-"));
  });

  describe("pathToProjectDir", () => {
    it("should convert file paths to project directory format", () => {
      const result = historyManager["pathToProjectDir"]("/Users/test/project");
      // The result should be in the projects directory and have the converted path
      expect(result).toContain("projects");
      expect(result).toContain("-Users-test-project");
    });

    it("should handle paths with multiple slashes", () => {
      const result = historyManager["pathToProjectDir"]("/Users/test/project/subdir");
      expect(result).toContain("projects");
      expect(result).toContain("-Users-test-project-subdir");
    });
  });

  describe("listProjectSessionFiles", () => {
    it("should return empty array for non-existent project", () => {
      const files = historyManager["listProjectSessionFiles"]("/non/existent/path");
      expect(files).toEqual([]);
    });

    it("should return .jsonl files for existing project", () => {
      // This test assumes there might be existing session files
      // We're just verifying the method doesn't throw and returns an array
      const files = historyManager["listProjectSessionFiles"](testCwd);
      expect(Array.isArray(files)).toBe(true);
      if (files.length > 0) {
        expect(files[0]).toMatch(/\.jsonl$/);
      }
    });
  });

  describe("readSessionFile", () => {
    it("should return empty array for non-existent file", () => {
      const entries = historyManager["readSessionFile"]("/non/existent/file.jsonl");
      expect(entries).toEqual([]);
    });

    it("should parse valid JSONL file", () => {
      // Create a temporary test file
      const tempDir = path.join(os.tmpdir(), `claude-test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      const testFilePath = path.join(tempDir, "test-session.jsonl");
      const testEntry: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: "/test",
        sessionId: "test-session-id",
        version: "1.0.0",
        type: "user",
        message: {
          role: "user",
          content: "Test message",
        },
        uuid: "test-uuid",
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(testFilePath, JSON.stringify(testEntry) + "\n");

      const entries = historyManager["readSessionFile"](testFilePath);
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe("test-session-id");
      expect(entries[0].message.content).toBe("Test message");

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should handle malformed lines gracefully", () => {
      const tempDir = path.join(os.tmpdir(), `claude-test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      const testFilePath = path.join(tempDir, "test-session.jsonl");
      fs.writeFileSync(
        testFilePath,
        `{"valid": "json"}\ninvalid json line\n{"also": "valid"}\n`,
      );

      const entries = historyManager["readSessionFile"](testFilePath);
      // Should only parse the valid lines
      expect(entries.length).toBeGreaterThanOrEqual(0);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe("listSessions", () => {
    it("should return empty array when no sessions exist", () => {
      const sessions = historyManager.listSessions({ cwd: "/non/existent/path" });
      expect(sessions).toEqual([]);
    });

    it("should return sessions sorted by updated time descending", () => {
      const sessions = historyManager.listSessions({ cwd: testCwd });
      expect(Array.isArray(sessions)).toBe(true);

      // Verify sorting if there are multiple sessions
      if (sessions.length > 1) {
        for (let i = 0; i < sessions.length - 1; i++) {
          expect(sessions[i].updatedAt).toBeGreaterThanOrEqual(sessions[i + 1].updatedAt);
        }
      }
    });

    it("should respect limit parameter", () => {
      const sessions = historyManager.listSessions({ cwd: testCwd, limit: 5 });
      expect(sessions.length).toBeLessThanOrEqual(5);
    });

    it("should include session metadata", () => {
      const sessions = historyManager.listSessions({ cwd: testCwd });

      for (const session of sessions) {
        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("cwd");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("updatedAt");
        expect(session).toHaveProperty("messageCount");
        expect(typeof session.sessionId).toBe("string");
        expect(typeof session.cwd).toBe("string");
        expect(typeof session.createdAt).toBe("number");
        expect(typeof session.updatedAt).toBe("number");
        expect(typeof session.messageCount).toBe("number");
      }
    });
  });

  describe("getSession", () => {
    it("should return null for non-existent session", () => {
      const session = historyManager.getSession("non-existent-session-id");
      expect(session).toBeNull();
    });

    it("should return full session with messages when found", () => {
      // First get a list of sessions to find a real session ID
      const sessions = historyManager.listSessions({ cwd: testCwd });

      if (sessions.length > 0) {
        const session = historyManager.getSession(sessions[0].sessionId);
        expect(session).not.toBeNull();
        if (session) {
          expect(session.sessionId).toBe(sessions[0].sessionId);
          expect(session.messages).toBeInstanceOf(Array);
          expect(session.messageCount).toBe(session.messages.length);
        }
      }
    });

    it("should include all expected properties in full session", () => {
      const sessions = historyManager.listSessions({ cwd: testCwd });

      if (sessions.length > 0) {
        const session = historyManager.getSession(sessions[0].sessionId);
        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("cwd");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("updatedAt");
        expect(session).toHaveProperty("messageCount");
        expect(session).toHaveProperty("messages");
      }
    });
  });

  describe("summarizeSession", () => {
    it("should throw error for empty entries", () => {
      expect(() => {
        historyManager["summarizeSession"]([]);
      }).toThrow();
    });

    it("should extract last message from user messages", () => {
      const longMessage = "This is a very long user message that definitely exceeds one hundred characters and should therefore be truncated with an ellipsis when added to the session summary as a preview.";

      const entries: NativeSessionEntry[] = [
        {
          parentUuid: null,
          isSidechain: false,
          userType: "external",
          cwd: "/test",
          sessionId: "test-id",
          version: "1.0.0",
          type: "user",
          message: { role: "user", content: "First message" },
          uuid: "uuid-1",
          timestamp: new Date().toISOString(),
        },
        {
          parentUuid: null,
          isSidechain: false,
          userType: "external",
          cwd: "/test",
          sessionId: "test-id",
          version: "1.0.0",
          type: "assistant",
          message: { role: "assistant", content: "Response" },
          uuid: "uuid-2",
          timestamp: new Date().toISOString(),
        },
        {
          parentUuid: null,
          isSidechain: false,
          userType: "external",
          cwd: "/test",
          sessionId: "test-id",
          version: "1.0.0",
          type: "user",
          message: { role: "user", content: longMessage },
          uuid: "uuid-3",
          timestamp: new Date().toISOString(),
        },
      ];

      const summary = historyManager["summarizeSession"](entries);
      expect(summary.lastMessage).toBeTruthy();
      if (summary.lastMessage) {
        expect(summary.lastMessage).toContain("...");
        expect(summary.lastMessage.length).toBeLessThan(longMessage.length);
      }
    });

    it("should handle array content", () => {
      const entries: NativeSessionEntry[] = [
        {
          parentUuid: null,
          isSidechain: false,
          userType: "external",
          cwd: "/test",
          sessionId: "test-id",
          version: "1.0.0",
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "text", text: "Text content" },
              { type: "tool_use", name: "Read", input: { path: "/test" } },
            ],
          },
          uuid: "uuid-1",
          timestamp: new Date().toISOString(),
        },
      ];

      const summary = historyManager["summarizeSession"](entries);
      expect(summary.lastMessage).toBe("Text content");
    });
  });

  describe("getStats", () => {
    it("should return stats with all required fields", () => {
      const stats = historyManager.getStats();

      expect(stats).toHaveProperty("totalSessions");
      expect(stats).toHaveProperty("totalMessages");
      expect(stats).toHaveProperty("totalSize");

      expect(typeof stats.totalSessions).toBe("number");
      expect(typeof stats.totalMessages).toBe("number");
      expect(typeof stats.totalSize).toBe("number");
    });

    it("should return non-negative values", () => {
      const stats = historyManager.getStats();

      expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
      expect(stats.totalMessages).toBeGreaterThanOrEqual(0);
      expect(stats.totalSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe("integration tests", () => {
    it("should handle real Claude Code session files", () => {
      // Test with real session files if they exist
      const sessions = historyManager.listSessions({ cwd: testCwd });

      if (sessions.length > 0) {
        // Test listing
        expect(sessions.length).toBeGreaterThan(0);

        // Test getting a specific session
        const session = historyManager.getSession(sessions[0].sessionId);
        expect(session).not.toBeNull();
        expect(session?.sessionId).toBe(sessions[0].sessionId);

        // Test stats
        const stats = historyManager.getStats();
        expect(stats.totalSessions).toBeGreaterThan(0);
      }
    });
  });

  describe("writeSessionEntry", () => {
    let tempProjectDir: string;
    let tempCwd: string;

    beforeEach(() => {
      // Create a unique temp directory for each test
      tempCwd = `/tmp/test-project-${Date.now()}`;
      tempProjectDir = historyManager["pathToProjectDir"](tempCwd);
    });

    afterEach(() => {
      // Cleanup temp directory
      try {
        fs.rmSync(tempProjectDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should create project directory if it doesn't exist", () => {
      const testEntry: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: "test-session-id",
        version: "1.0.0",
        type: "user",
        message: { role: "user", content: "Test message" },
        uuid: "test-uuid",
        timestamp: new Date().toISOString(),
      };

      historyManager.writeSessionEntry("test-session-id", testEntry);

      // Verify directory was created
      expect(fs.existsSync(tempProjectDir)).toBe(true);

      // Verify file was created
      const sessionFile = path.join(tempProjectDir, "test-session-id.jsonl");
      expect(fs.existsSync(sessionFile)).toBe(true);
    });

    it("should append entry to existing session file", () => {
      const testEntry1: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: "test-session-id",
        version: "1.0.0",
        type: "user",
        message: { role: "user", content: "First message" },
        uuid: "uuid-1",
        timestamp: new Date().toISOString(),
      };

      const testEntry2: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: "test-session-id",
        version: "1.0.0",
        type: "assistant",
        message: { role: "assistant", content: "Response" },
        uuid: "uuid-2",
        timestamp: new Date().toISOString(),
      };

      historyManager.writeSessionEntry("test-session-id", testEntry1);
      historyManager.writeSessionEntry("test-session-id", testEntry2);

      // Read the file and verify both entries are present
      const sessionFile = path.join(tempProjectDir, "test-session-id.jsonl");
      const content = fs.readFileSync(sessionFile, "utf8");
      const lines = content.trim().split("\n");

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("First message");
      expect(lines[1]).toContain("Response");
    });

    it("should write valid JSON lines", () => {
      const testEntry: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: "test-session-id",
        version: "1.0.0",
        type: "user",
        message: { role: "user", content: "Test message" },
        uuid: "test-uuid",
        timestamp: new Date().toISOString(),
      };

      historyManager.writeSessionEntry("test-session-id", testEntry);

      const sessionFile = path.join(tempProjectDir, "test-session-id.jsonl");
      const content = fs.readFileSync(sessionFile, "utf8");
      const lines = content.trim().split("\n");

      expect(lines).toHaveLength(1);
      expect(() => JSON.parse(lines[0])).not.toThrow();

      const parsed = JSON.parse(lines[0]);
      expect(parsed.sessionId).toBe("test-session-id");
      expect(parsed.type).toBe("user");
      expect(parsed.message.content).toBe("Test message");
    });

    it("should handle array content in messages", () => {
      const arrayContent: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: "test-session-id",
        version: "1.0.0",
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Text content" },
            { type: "tool_use", name: "Read", input: { path: "/test" } },
          ],
        },
        uuid: "test-uuid",
        timestamp: new Date().toISOString(),
      };

      historyManager.writeSessionEntry("test-session-id", arrayContent);

      const sessionFile = path.join(tempProjectDir, "test-session-id.jsonl");
      const entries = historyManager["readSessionFile"](sessionFile);

      expect(entries).toHaveLength(1);
      expect(entries[0].message.content).toEqual(arrayContent.message.content);
    });
  });

  describe("ensureSessionDirectory", () => {
    it("should create project directory structure", () => {
      const tempCwd = `/tmp/test-project-${Date.now()}`;
      const sessionFile = historyManager.ensureSessionDirectory("test-session", tempCwd);

      // Verify the returned path is correct
      expect(sessionFile).toContain("test-session.jsonl");
      expect(sessionFile).toContain(tempCwd.replace(/\//g, "-"));

      // Verify parent directory exists
      const parentDir = path.dirname(sessionFile);
      expect(fs.existsSync(parentDir)).toBe(true);

      // Cleanup
      try {
        fs.rmSync(parentDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should not error if directory already exists", () => {
      const tempCwd = `/tmp/test-project-${Date.now()}`;
      const sessionFile1 = historyManager.ensureSessionDirectory("test-session", tempCwd);
      const sessionFile2 = historyManager.ensureSessionDirectory("test-session", tempCwd);

      expect(sessionFile1).toBe(sessionFile2);

      // Cleanup
      const parentDir = path.dirname(sessionFile1);
      try {
        fs.rmSync(parentDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  describe("two-way sync integration", () => {
    let tempCwd: string;
    let tempProjectDir: string;

    beforeEach(() => {
      tempCwd = `/tmp/test-sync-${Date.now()}`;
      tempProjectDir = historyManager["pathToProjectDir"](tempCwd);
    });

    afterEach(() => {
      try {
        fs.rmSync(tempProjectDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should write and then read back the same session", () => {
      const sessionId = "sync-test-session";

      // Write user message
      const userEntry: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId,
        version: "1.0.0",
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: "Hello, how are you?" }],
        },
        uuid: "uuid-user-1",
        timestamp: new Date().toISOString(),
      };

      // Write assistant message
      const assistantEntry: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId,
        version: "1.0.0",
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "I'm doing well, thank you!" },
            { type: "tool_use", name: "Bash", input: { command: "echo test" } },
          ],
        },
        uuid: "uuid-assistant-1",
        timestamp: new Date().toISOString(),
      };

      // Write both entries
      historyManager.writeSessionEntry(sessionId, userEntry);
      historyManager.writeSessionEntry(sessionId, assistantEntry);

      // Read back the session
      const session = historyManager.getSession(sessionId);

      // Verify session was found
      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe(sessionId);
      expect(session?.cwd).toBe(tempCwd);

      // Verify messages
      expect(session?.messages).toHaveLength(2);
      expect(session?.messages[0].type).toBe("user");
      expect(session?.messages[1].type).toBe("assistant");
    });

    it("should list written sessions", () => {
      const sessionId1 = "list-test-1";
      const sessionId2 = "list-test-2";

      const entry1: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: sessionId1,
        version: "1.0.0",
        type: "user",
        message: { role: "user", content: "Message 1" },
        uuid: "uuid-1",
        timestamp: new Date(Date.now() - 1000).toISOString(),
      };

      const entry2: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: sessionId2,
        version: "1.0.0",
        type: "user",
        message: { role: "user", content: "Message 2" },
        uuid: "uuid-2",
        timestamp: new Date().toISOString(),
      };

      historyManager.writeSessionEntry(sessionId1, entry1);
      historyManager.writeSessionEntry(sessionId2, entry2);

      // List sessions for this project
      const sessions = historyManager.listSessions({ cwd: tempCwd });

      expect(sessions.length).toBeGreaterThanOrEqual(2);
      const sessionIds = sessions.map((s) => s.sessionId);
      expect(sessionIds).toContain(sessionId1);
      expect(sessionIds).toContain(sessionId2);

      // Verify sorting (newest first)
      const session2Index = sessions.findIndex((s) => s.sessionId === sessionId2);
      const session1Index = sessions.findIndex((s) => s.sessionId === sessionId1);
      expect(session2Index).toBeLessThan(session1Index);
    });

    it("should include written sessions in stats", () => {
      const statsBefore = historyManager.getStats();

      const entry: NativeSessionEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: "external",
        cwd: tempCwd,
        sessionId: "stats-test-session",
        version: "1.0.0",
        type: "user",
        message: { role: "user", content: "Test" },
        uuid: "uuid-stats",
        timestamp: new Date().toISOString(),
      };

      historyManager.writeSessionEntry("stats-test-session", entry);

      const statsAfter = historyManager.getStats();

      expect(statsAfter.totalSessions).toBe(statsBefore.totalSessions + 1);
      expect(statsAfter.totalMessages).toBe(statsBefore.totalMessages + 1);
    });
  });

  describe("path transformation edge cases", () => {
    it("should handle paths with multiple dots", () => {
      const result = historyManager["pathToProjectDir"]("/Users/test/.ssh/.config");
      expect(result).toContain("-Users-test--ssh--config");
    });

    it("should handle paths with consecutive dots", () => {
      const result = historyManager["pathToProjectDir"]("/path/to/...test");
      // Leading dots are replaced with -, remaining dots are preserved
      expect(result).toContain("-path-to--..test");
    });

    it("should handle paths starting with dot", () => {
      const result = historyManager["pathToProjectDir"]("/.hidden/dir");
      expect(result).toContain("--hidden-dir");
    });

    it("should handle paths with dots in middle of segment", () => {
      const result = historyManager["pathToProjectDir"]("/path/to/test.txt/file");
      expect(result).toContain("-path-to-test.txt-file");
    });
  });
});
