# agent-browser Pi Extension — Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build a pi extension that registers a `browser` tool giving the LLM interactive browser automation via agent-browser CLI, with inline screenshot support, output truncation, auto-install, and session cleanup.

**Architecture:** Single-file extension at `~/.pi/agent/extensions/agent-browser.ts`. The `browser` tool executes `agent-browser <command>` via `pi.exec()`, parses output, and returns text (or image for screenshots). Subscribes to `session_shutdown` for browser cleanup.

**Tech Stack:** TypeScript, pi extension API (`@mariozechner/pi-coding-agent`), TypeBox schemas (`@sinclair/typebox`), pi TUI (`@mariozechner/pi-tui`), Node built-ins (`node:fs`, `node:path`, `node:os`, `node:child_process`).

**Design Spec:** `docs/plans/2026-02-09-agent-browser-extension-design.md` (in the home `~/docs/plans/` directory)

---

### Task 1: Scaffold Extension with Tool Registration

**Files:**
- Create: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Write the extension skeleton**

Create `~/.pi/agent/extensions/agent-browser.ts` with the following content:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const TOOL_DESCRIPTION = `Browser automation via agent-browser CLI.
Workflow: open URL → snapshot -i (get @refs like @e1) → interact → re-snapshot after page changes.
Commands:
  open <url> - Navigate to URL
  snapshot -i - Interactive elements with @refs (re-snapshot after navigation)
  click <@ref> - Click element
  fill <@ref> <text> - Clear and type
  type <@ref> <text> - Type without clearing
  select <@ref> <value> - Select dropdown
  press <key> - Press key (Enter, Tab, etc.)
  scroll <dir> [px] - Scroll (up/down/left/right)
  get text|url|title [@ref] - Get information
  wait <@ref|ms> - Wait for element or time
  screenshot [--full] - Take screenshot (image returned inline)
  close - Close browser
Any valid agent-browser command works.`;

export default function agentBrowserExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "browser",
    label: "Browser",
    description: TOOL_DESCRIPTION,
    parameters: Type.Object({
      command: Type.String({ description: "agent-browser command (without 'agent-browser' prefix)" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `TODO: execute agent-browser ${params.command}` }],
        details: {},
      };
    },
  });
}
```

**Step 2: Verify the extension loads**

Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "What tools do you have?"`
Expected: The output should mention the `browser` tool.

**Step 3: Commit**

```bash
cd ~/.pi/agent/extensions
git init 2>/dev/null; git add agent-browser.ts
git commit -m "feat: scaffold agent-browser extension with tool registration"
```

---

### Task 2: Auto-Install Check

Add logic to check if `agent-browser` is installed on first invocation, prompt user to install if not.

**Files:**
- Modify: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Write the failing test (manual verification)**

We can't run unit tests for pi extensions directly, so we'll verify behavior manually. First, let's implement.

**Step 2: Add the auto-install helper**

Insert above the `export default` line in `agent-browser.ts`:

```typescript
async function ensureInstalled(pi: ExtensionAPI, ctx: any): Promise<boolean> {
  const check = await pi.exec("which", ["agent-browser"], { timeout: 5000 });
  if (check.code === 0 && check.stdout.trim()) {
    return true;
  }

  // Not found — prompt user
  if (!ctx.hasUI) {
    return false;
  }

  const ok = await ctx.ui.confirm(
    "agent-browser not found",
    "Install agent-browser globally with npm? (npm install -g agent-browser)"
  );
  if (!ok) {
    return false;
  }

  ctx.ui.notify("Installing agent-browser...", "info");
  const install = await pi.exec("npm", ["install", "-g", "agent-browser"], { timeout: 120000 });
  if (install.code !== 0) {
    ctx.ui.notify(`Installation failed: ${install.stderr}`, "error");
    return false;
  }

  // Also run install for Chromium
  ctx.ui.notify("Downloading Chromium...", "info");
  const chromium = await pi.exec("agent-browser", ["install"], { timeout: 120000 });
  if (chromium.code !== 0) {
    ctx.ui.notify(`Chromium install failed: ${chromium.stderr}`, "error");
    return false;
  }

  ctx.ui.notify("agent-browser installed successfully!", "success");
  return true;
}
```

**Step 3: Use the helper in execute**

Replace the `execute` function body with:

```typescript
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const installed = await ensureInstalled(pi, ctx);
      if (!installed) {
        return {
          content: [{ type: "text", text: "agent-browser is not installed. Install manually with: npm install -g agent-browser && agent-browser install" }],
          details: { error: "not-installed" },
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `TODO: execute agent-browser ${params.command}` }],
        details: {},
      };
    },
```

**Step 4: Verify auto-install prompt works**

Temporarily rename agent-browser binary (if installed) or test on a system without it:
Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "Open example.com in the browser"`
Expected: Should see confirm prompt or error about not installed.

**Step 5: Commit**

```bash
cd ~/.pi/agent/extensions
git add agent-browser.ts
git commit -m "feat: add auto-install check for agent-browser"
```

---

### Task 3: Core Command Execution

Implement the main command execution logic. Run `agent-browser <command>` and return stdout as text.

**Files:**
- Modify: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Add command execution logic**

Replace the TODO placeholder in `execute` (after the install check) with:

```typescript
      // Parse command to detect the action type
      const commandStr = params.command.trim();
      const action = commandStr.split(/\s+/)[0].toLowerCase();

      // Execute the command
      const result = await pi.exec("agent-browser", commandStr.split(/\s+/), {
        signal,
        timeout: 60000,
      });

      if (result.code !== 0) {
        const errorOutput = (result.stderr || result.stdout).trim();
        return {
          content: [{ type: "text", text: errorOutput || `Command failed with exit code ${result.code}` }],
          details: { error: errorOutput, exitCode: result.code, command: commandStr },
          isError: true,
        };
      }

      const output = result.stdout.trim();
      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { command: commandStr, action },
      };
```

**Step 2: Verify basic command execution works**

This requires agent-browser to be installed. If available:
Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "Use the browser tool to open example.com, then get the page title, then close the browser."`
Expected: Should see tool calls with output from agent-browser.

**Step 3: Commit**

```bash
cd ~/.pi/agent/extensions
git add agent-browser.ts
git commit -m "feat: implement core command execution for browser tool"
```

---

### Task 4: Screenshot Handling with Inline Images

Detect screenshot commands, read the resulting file, and return it as an image content block so the LLM can see the page.

**Files:**
- Modify: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Add the fs import at the top**

Add to the imports at the top of the file:

```typescript
import { readFileSync } from "node:fs";
import { extname } from "node:path";
```

**Step 2: Add screenshot detection and image return**

After the general command execution, before the final `return`, add a screenshot handler. Replace the entire command execution block (everything after the install check) with:

```typescript
      const commandStr = params.command.trim();
      const parts = commandStr.split(/\s+/);
      const action = parts[0].toLowerCase();

      const result = await pi.exec("agent-browser", parts, {
        signal,
        timeout: 60000,
      });

      if (result.code !== 0) {
        const errorOutput = (result.stderr || result.stdout).trim();
        return {
          content: [{ type: "text", text: errorOutput || `Command failed with exit code ${result.code}` }],
          details: { error: errorOutput, exitCode: result.code, command: commandStr },
          isError: true,
        };
      }

      const output = result.stdout.trim();

      // Screenshot: extract path, read file, return as image
      if (action === "screenshot") {
        const pathMatch = output.match(/saved to (.+)$/i);
        if (pathMatch) {
          const screenshotPath = pathMatch[1].trim();
          try {
            const imageData = readFileSync(screenshotPath);
            const base64 = imageData.toString("base64");
            const ext = extname(screenshotPath).toLowerCase();
            const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
              : ext === ".webp" ? "image/webp"
              : "image/png";
            return {
              content: [
                { type: "text", text: `Screenshot saved: ${screenshotPath}` },
                { type: "image", data: base64, mimeType },
              ],
              details: { command: commandStr, action, screenshotPath },
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Screenshot saved to ${screenshotPath} but could not read file: ${err.message}` }],
              details: { command: commandStr, action, screenshotPath, readError: err.message },
            };
          }
        }
      }

      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { command: commandStr, action },
      };
```

**Step 3: Verify screenshot returns image**

Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "Open example.com and take a screenshot, then describe what you see. Close the browser when done."`
Expected: The LLM should be able to describe the page contents from the inline screenshot.

**Step 4: Commit**

```bash
cd ~/.pi/agent/extensions
git add agent-browser.ts
git commit -m "feat: return screenshots as inline images for LLM vision"
```

---

### Task 5: Output Truncation for Snapshot

Snapshot output on complex pages can be huge. Apply pi's built-in truncation utilities.

**Files:**
- Modify: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Add truncation imports**

Add to the imports from `@mariozechner/pi-coding-agent`:

```typescript
import {
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} from "@mariozechner/pi-coding-agent";
```

**Step 2: Add temp file helper**

Add a helper function (above `ensureInstalled`):

```typescript
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeTempFile(content: string, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pi-browser-${prefix}-`));
  const file = join(dir, "output.txt");
  writeFileSync(file, content);
  return file;
}
```

**Step 3: Apply truncation to the default output path**

In the execute function, replace the final return statement (the `return { content: [{ type: "text", text: output ... }]` block) with:

```typescript
      // Apply truncation to large outputs (especially snapshot)
      const truncation = truncateHead(output, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      let resultText = truncation.content;

      if (truncation.truncated) {
        const tempFile = writeTempFile(output, action);
        resultText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
        resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
        resultText += ` Full output saved to: ${tempFile}]`;
      }

      return {
        content: [{ type: "text", text: resultText || "(no output)" }],
        details: { command: commandStr, action, truncated: truncation.truncated },
      };
```

**Step 4: Verify truncation works**

Run against a complex page:
Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "Open amazon.com and get a snapshot with -i flag, then close."`
Expected: If output is large, should see truncation notice with temp file path.

**Step 5: Commit**

```bash
cd ~/.pi/agent/extensions
git add agent-browser.ts
git commit -m "feat: truncate large outputs (snapshot) with temp file fallback"
```

---

### Task 6: Session Cleanup on Shutdown

Subscribe to `session_shutdown` to close any lingering browser process.

**Files:**
- Modify: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Add shutdown handler**

Inside the `export default function` body (after `pi.registerTool(...)`) add:

```typescript
  // Clean up browser on session exit
  pi.on("session_shutdown", async (_event, _ctx) => {
    try {
      await pi.exec("agent-browser", ["close"], { timeout: 5000 });
    } catch {
      // Ignore errors — browser may already be closed
    }
  });
```

**Step 2: Verify cleanup fires**

Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "Open example.com using the browser tool"`
Then exit with Ctrl+C.
Expected: No orphaned chromium processes. Verify with `ps aux | grep chromium`.

**Step 3: Commit**

```bash
cd ~/.pi/agent/extensions
git add agent-browser.ts
git commit -m "feat: close browser on session shutdown"
```

---

### Task 7: Custom TUI Rendering

Add `renderCall` and `renderResult` for compact, readable TUI display.

**Files:**
- Modify: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Add TUI import**

Add at the top:

```typescript
import { Text } from "@mariozechner/pi-tui";
```

**Step 2: Add renderCall**

Add to the tool definition object (after `description`, before `execute`):

```typescript
    renderCall(args: { command: string }, theme: any) {
      const text = theme.fg("toolTitle", theme.bold("browser ")) + theme.fg("accent", args.command);
      return new Text(text, 0, 0);
    },
```

**Step 3: Add renderResult**

Add after `renderCall`:

```typescript
    renderResult(result: any, { expanded, isPartial }: { expanded: boolean; isPartial: boolean }, theme: any) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Running..."), 0, 0);
      }

      const details = result.details || {};

      // Error
      if (result.isError || details.error) {
        const errorText = details.error || result.content?.[0]?.text || "Error";
        return new Text(theme.fg("error", errorText), 0, 0);
      }

      const action = details.action || "";
      const content = result.content?.[0]?.text || "";

      // Screenshot
      if (action === "screenshot") {
        return new Text(theme.fg("success", `Screenshot saved: ${details.screenshotPath || "unknown"}`), 0, 0);
      }

      // Snapshot — show element count
      if (action === "snapshot") {
        const refCount = (content.match(/@e\d+/g) || []).length;
        let text = theme.fg("success", `${refCount} interactive elements`);
        if (details.truncated) {
          text += theme.fg("warning", " (truncated)");
        }
        if (expanded) {
          text += "\n" + theme.fg("dim", content);
        }
        return new Text(text, 0, 0);
      }

      // Default — compact output
      if (expanded) {
        return new Text(theme.fg("dim", content), 0, 0);
      }

      // Compact: first line only
      const firstLine = content.split("\n")[0] || "(no output)";
      const truncated = content.includes("\n") ? "…" : "";
      return new Text(theme.fg("dim", firstLine + truncated), 0, 0);
    },
```

**Step 4: Verify rendering looks good**

Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "Open example.com, take a snapshot -i, then close."`
Expected: Tool calls display as `browser open example.com`, snapshot shows element count.

**Step 5: Commit**

```bash
cd ~/.pi/agent/extensions
git add agent-browser.ts
git commit -m "feat: add custom TUI rendering for browser tool"
```

---

### Task 8: Final Assembly and Polish

Consolidate imports, ensure proper ordering, and do a full end-to-end test.

**Files:**
- Modify: `~/.pi/agent/extensions/agent-browser.ts`

**Step 1: Clean up imports**

Ensure the top of the file has all imports organized:

```typescript
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
```

**Step 2: Verify the complete file compiles**

Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "List your available tools"`
Expected: No errors, `browser` tool listed.

**Step 3: Full end-to-end test**

Run: `pi -e ~/.pi/agent/extensions/agent-browser.ts -p "Use the browser to: 1) open https://example.com, 2) take a snapshot -i to see interactive elements, 3) take a screenshot, 4) tell me what you see in the screenshot, 5) close the browser."`
Expected:
- `browser open https://example.com` succeeds
- `browser snapshot -i` shows interactive elements with `@e` refs
- `browser screenshot` returns an inline image the LLM can describe
- `browser close` succeeds
- No orphaned processes after exit

**Step 4: Commit final version**

```bash
cd ~/.pi/agent/extensions
git add agent-browser.ts
git commit -m "feat: complete agent-browser extension - browser automation tool for pi"
```

---

## Appendix: Complete Extension File

For reference, the final `~/.pi/agent/extensions/agent-browser.ts` should look like this:

```typescript
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const TOOL_DESCRIPTION = `Browser automation via agent-browser CLI.
Workflow: open URL → snapshot -i (get @refs like @e1) → interact → re-snapshot after page changes.
Commands:
  open <url> - Navigate to URL
  snapshot -i - Interactive elements with @refs (re-snapshot after navigation)
  click <@ref> - Click element
  fill <@ref> <text> - Clear and type
  type <@ref> <text> - Type without clearing
  select <@ref> <value> - Select dropdown
  press <key> - Press key (Enter, Tab, etc.)
  scroll <dir> [px] - Scroll (up/down/left/right)
  get text|url|title [@ref] - Get information
  wait <@ref|ms> - Wait for element or time
  screenshot [--full] - Take screenshot (image returned inline)
  close - Close browser
Any valid agent-browser command works.`;

function writeTempFile(content: string, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pi-browser-${prefix}-`));
  const file = join(dir, "output.txt");
  writeFileSync(file, content);
  return file;
}

async function ensureInstalled(pi: ExtensionAPI, ctx: any): Promise<boolean> {
  const check = await pi.exec("which", ["agent-browser"], { timeout: 5000 });
  if (check.code === 0 && check.stdout.trim()) {
    return true;
  }

  if (!ctx.hasUI) {
    return false;
  }

  const ok = await ctx.ui.confirm(
    "agent-browser not found",
    "Install agent-browser globally with npm? (npm install -g agent-browser)"
  );
  if (!ok) {
    return false;
  }

  ctx.ui.notify("Installing agent-browser...", "info");
  const install = await pi.exec("npm", ["install", "-g", "agent-browser"], { timeout: 120000 });
  if (install.code !== 0) {
    ctx.ui.notify(`Installation failed: ${install.stderr}`, "error");
    return false;
  }

  ctx.ui.notify("Downloading Chromium...", "info");
  const chromium = await pi.exec("agent-browser", ["install"], { timeout: 120000 });
  if (chromium.code !== 0) {
    ctx.ui.notify(`Chromium install failed: ${chromium.stderr}`, "error");
    return false;
  }

  ctx.ui.notify("agent-browser installed successfully!", "success");
  return true;
}

export default function agentBrowserExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "browser",
    label: "Browser",
    description: TOOL_DESCRIPTION,
    parameters: Type.Object({
      command: Type.String({ description: "agent-browser command (without 'agent-browser' prefix)" }),
    }),

    renderCall(args: { command: string }, theme: any) {
      const text = theme.fg("toolTitle", theme.bold("browser ")) + theme.fg("accent", args.command);
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { expanded, isPartial }: { expanded: boolean; isPartial: boolean }, theme: any) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Running..."), 0, 0);
      }

      const details = result.details || {};

      if (result.isError || details.error) {
        const errorText = details.error || result.content?.[0]?.text || "Error";
        return new Text(theme.fg("error", errorText), 0, 0);
      }

      const action = details.action || "";
      const content = result.content?.[0]?.text || "";

      if (action === "screenshot") {
        return new Text(theme.fg("success", `Screenshot saved: ${details.screenshotPath || "unknown"}`), 0, 0);
      }

      if (action === "snapshot") {
        const refCount = (content.match(/@e\d+/g) || []).length;
        let text = theme.fg("success", `${refCount} interactive elements`);
        if (details.truncated) {
          text += theme.fg("warning", " (truncated)");
        }
        if (expanded) {
          text += "\n" + theme.fg("dim", content);
        }
        return new Text(text, 0, 0);
      }

      if (expanded) {
        return new Text(theme.fg("dim", content), 0, 0);
      }

      const firstLine = content.split("\n")[0] || "(no output)";
      const truncated = content.includes("\n") ? "…" : "";
      return new Text(theme.fg("dim", firstLine + truncated), 0, 0);
    },

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const installed = await ensureInstalled(pi, ctx);
      if (!installed) {
        return {
          content: [{ type: "text", text: "agent-browser is not installed. Install manually with: npm install -g agent-browser && agent-browser install" }],
          details: { error: "not-installed" },
          isError: true,
        };
      }

      const commandStr = params.command.trim();
      const parts = commandStr.split(/\s+/);
      const action = parts[0].toLowerCase();

      const result = await pi.exec("agent-browser", parts, {
        signal,
        timeout: 60000,
      });

      if (result.code !== 0) {
        const errorOutput = (result.stderr || result.stdout).trim();
        return {
          content: [{ type: "text", text: errorOutput || `Command failed with exit code ${result.code}` }],
          details: { error: errorOutput, exitCode: result.code, command: commandStr },
          isError: true,
        };
      }

      const output = result.stdout.trim();

      // Screenshot: extract path, read file, return as inline image
      if (action === "screenshot") {
        const pathMatch = output.match(/saved to (.+)$/i);
        if (pathMatch) {
          const screenshotPath = pathMatch[1].trim();
          try {
            const imageData = readFileSync(screenshotPath);
            const base64 = imageData.toString("base64");
            const ext = extname(screenshotPath).toLowerCase();
            const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
              : ext === ".webp" ? "image/webp"
              : "image/png";
            return {
              content: [
                { type: "text", text: `Screenshot saved: ${screenshotPath}` },
                { type: "image", data: base64, mimeType },
              ],
              details: { command: commandStr, action, screenshotPath },
            };
          } catch (err: any) {
            return {
              content: [{ type: "text", text: `Screenshot saved to ${screenshotPath} but could not read file: ${err.message}` }],
              details: { command: commandStr, action, screenshotPath, readError: err.message },
            };
          }
        }
      }

      // Apply truncation to large outputs
      const truncation = truncateHead(output, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      let resultText = truncation.content;

      if (truncation.truncated) {
        const tempFile = writeTempFile(output, action);
        resultText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
        resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
        resultText += ` Full output saved to: ${tempFile}]`;
      }

      return {
        content: [{ type: "text", text: resultText || "(no output)" }],
        details: { command: commandStr, action, truncated: truncation.truncated },
      };
    },
  });

  // Clean up browser on session exit
  pi.on("session_shutdown", async (_event, _ctx) => {
    try {
      await pi.exec("agent-browser", ["close"], { timeout: 5000 });
    } catch {
      // Ignore — browser may already be closed
    }
  });
}
```
