# How It Works

A technical deep-dive into pi-agent-browser's internals.

## Overview

pi-agent-browser is a [pi extension](https://github.com/mariozechner/pi-coding-agent) that registers a single tool called `browser`. When the LLM invokes this tool, the extension runs an [agent-browser](https://www.npmjs.com/package/agent-browser) CLI command and returns the result.

The entire implementation is a single TypeScript file: [`extensions/agent-browser.ts`](../extensions/agent-browser.ts).

## Lifecycle

```
1. Extension loads          → registerTool("browser", ...)
2. LLM calls browser()     → execute() runs agent-browser CLI
3. Result returned          → text, images, or error
4. Session ends             → session_shutdown closes browser
```

## Tool Registration

The extension exports a default function that receives pi's `ExtensionAPI`:

```typescript
export default function agentBrowserExtension(pi: ExtensionAPI) {
  pi.registerTool({ name: "browser", ... });
  pi.on("session_shutdown", ...);
}
```

The tool is immediately available to the LLM once loaded.

## Command Execution Flow

When the LLM calls `browser({ command: "open https://example.com" })`:

1. **Install check** — `ensureInstalled()` runs `which agent-browser`. On first use, if not found, prompts the user to install via TUI confirm dialog.

2. **Parse & execute** — The command string is split and passed to `pi.exec("agent-browser", [...parts])` with a 60-second timeout and abort signal support.

3. **Error handling** — Non-zero exit codes return an `isError: true` result with stderr/stdout as the error message.

4. **Screenshot detection** — If the command is `screenshot`, the extension:
   - Parses the output for a file path (`saved to /path/to/file`)
   - Reads the file with `readFileSync`
   - Converts to base64
   - Returns as an `{ type: "image", data, mimeType }` content block
   - The LLM can then "see" the page with vision models

5. **Output truncation** — For all other commands, the output runs through pi's `truncateHead()`:
   - Respects `DEFAULT_MAX_LINES` and `DEFAULT_MAX_BYTES`
   - If truncated, the full output is written to a temp file
   - A notice with the temp file path is appended

6. **Return** — Results include both `content` (for the LLM) and `details` (for TUI rendering).

## Auto-Install

The `ensureInstalled()` function handles first-run setup:

```
which agent-browser
  ├── found → return true
  └── not found
       ├── no UI → return false (headless mode)
       └── has UI → confirm dialog
            ├── declined → return false
            └── accepted
                 ├── npm install -g agent-browser
                 └── agent-browser install (Chromium)
```

The install check runs on every `execute()` call but returns immediately if agent-browser is already on PATH.

## TUI Rendering

Two custom renderers provide a clean terminal experience:

### renderCall

Shows the command being executed:
```
browser  open https://example.com
```

### renderResult

Context-aware display:
- **Screenshots** → `✓ Screenshot saved: /tmp/screenshot.png`
- **Snapshots** → `✓ 30 interactive elements` (counts `@e` refs in output)
- **Errors** → Red error text
- **Other** → First line of output (expandable to full output)
- **Running** → `Running...` during execution

## Session Cleanup

The extension subscribes to `session_shutdown`:

```typescript
pi.on("session_shutdown", async () => {
  await pi.exec("agent-browser", ["close"], { timeout: 5000 });
});
```

This ensures no orphaned Chromium processes remain after pi exits. Errors are silently caught — the browser may already be closed.

## Output Truncation Strategy

Pi's `truncateHead()` is used (not `truncateTail`), meaning the *beginning* of output is kept and the end is trimmed. This is intentional for snapshot output where the most important elements (page title, navigation, primary content) tend to appear first in the DOM tree.

The truncated content footer includes:
- Line count (shown/total)
- Byte count (shown/total)
- Path to temp file with full output

## Dependencies

| Dependency | Role |
|---|---|
| `@mariozechner/pi-coding-agent` | Extension API, truncation utilities |
| `@mariozechner/pi-tui` | `Text` widget for custom rendering |
| `@sinclair/typebox` | JSON schema for tool parameters |
| `node:fs`, `node:os`, `node:path` | File I/O for screenshots and temp files |
| `agent-browser` (runtime) | The actual browser automation CLI |
