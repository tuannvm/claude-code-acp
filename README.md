# ACP adapter for Claude Code

[![npm](https://img.shields.io/npm/v/%40zed-industries%2Fclaude-code-acp)](https://www.npmjs.com/package/@zed-industries/claude-code-acp)

Use [Claude Code](https://www.anthropic.com/claude-code) from [ACP-compatible](https://agentclientprotocol.com) clients such as [Zed](https://zed.dev)!

This tool implements an ACP agent by using the official [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview), supporting:

- Context @-mentions
- Images
- Tool calls (with permission requests)
- Following
- Edit review
- TODO lists
- Interactive (and background) terminals
- Custom [Slash commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands)
- Client MCP servers

Learn more about the [Agent Client Protocol](https://agentclientprotocol.com/).

## How to use

### Zed

The latest version of Zed can already use this adapter out of the box.

To use Claude Code, open the Agent Panel and click "New Claude Code Thread" from the `+` button menu in the top-right:

https://github.com/user-attachments/assets/ddce66c7-79ac-47a3-ad59-4a6a3ca74903

Read the docs on [External Agent](https://zed.dev/docs/ai/external-agents) support.

### Other clients

Or try it with any of the other [ACP compatible clients](https://agentclientprotocol.com/overview/clients)!

## Conversation History

This adapter integrates with **Claude Code's native history storage**, ensuring complete compatibility between ACP clients and the native Claude Code CLI.

### Two-Way Synchronization

- **ACP → Native Claude Code**: Sessions created in ACP clients are saved to Claude Code's native `.jsonl` files (manually persisted by this adapter)
- **Native Claude Code → ACP**: Sessions created in native Claude Code appear in ACP history tools
- **No separate database**: Uses Claude Code's existing storage format directly

**How it works**: This adapter manually persists ACP session data (user prompts and assistant responses) to the native `.jsonl` format, making sessions visible to both ACP clients and the native Claude Code CLI. When you create a session via ACP, the adapter writes each message to the appropriate project's `.jsonl` file as the conversation progresses.

### History Storage

History is stored in Claude Code's native format:

- **Location**: `~/.claude/history.jsonl` (global history) and `~/.claude/projects/*/` (per-project sessions)
- **Format**: JSON Lines (`.jsonl`) - one JSON object per line
- **Structure**: Each session file contains the full conversation with messages, timestamps, and metadata

### MCP Tools

The following MCP tools are available for browsing history:

- **`list_sessions`**: Lists all available conversation sessions from native storage
- **`load_session`**: Displays full conversation history for a specific session

**Note**: These tools provide **read-only** access to history. To resume a session with full context, use the ACP client's resume functionality or the native Claude Code CLI.

### Usage Examples

#### List all sessions

```
Use the list_sessions tool to see all available conversations from both ACP and native Claude Code
```

#### Load a session's history

```
Use the load_session tool with a session_id to view full conversation history
```

#### Resume a session

To resume a session with full context (not just view history), use the session ID with your ACP client's resume functionality or with native Claude Code:

```bash
# In native Claude Code CLI
claude --resume <session-id>
```

## Installation

Install the adapter from `npm`:

```bash
npm install -g @zed-industries/claude-code-acp
```

You can then use `claude-code-acp` as a regular ACP agent:

```
ANTHROPIC_API_KEY=sk-... claude-code-acp
```

## License

Apache-2.0
