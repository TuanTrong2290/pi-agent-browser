import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  execNpm,
  resolveAgentBrowserCommand,
  ensureInstalled,
} from "../extensions/agent-browser-install-check.js";

function makeExecResult({ code = 0, stdout = "", stderr = "", killed = false } = {}) {
  return { code, stdout, stderr, killed };
}

function makeWindowsPrefixWithAgentBrowserScript() {
  const prefix = mkdtempSync(join(tmpdir(), "pi-agent-browser-prefix-"));
  const scriptDir = join(prefix, "node_modules", "agent-browser", "bin");
  const scriptPath = join(scriptDir, "agent-browser.js");
  mkdirSync(scriptDir, { recursive: true });
  writeFileSync(scriptPath, "#!/usr/bin/env node\nconsole.log('ok')\n");
  return { prefix, scriptPath };
}

test("resolveAgentBrowserCommand uses npm global node script on Windows when PATH check fails", async () => {
  const { prefix, scriptPath } = makeWindowsPrefixWithAgentBrowserScript();
  const calls = [];

  const pi = {
    async exec(command, args) {
      calls.push({ command, args });

      if (command === "agent-browser") {
        return makeExecResult({ code: 1 });
      }

      if (command === "node" && args[0] === scriptPath && args[1] === "--version") {
        return makeExecResult({ code: 0, stdout: "agent-browser 0.20.1\n" });
      }

      return makeExecResult({ code: 1, stderr: "unexpected command" });
    },
  };

  const resolved = await resolveAgentBrowserCommand(pi, {
    platform: "win32",
    prefixes: [prefix],
  });

  assert.ok(resolved, "expected command resolution to succeed");
  assert.equal(resolved.command, "node");
  assert.deepEqual(resolved.baseArgs, [scriptPath]);

  assert.equal(calls[0].command, "agent-browser", "should still try PATH fast-path first");
});

test("resolveAgentBrowserCommand keeps fast-path behavior when agent-browser is directly executable", async () => {
  const calls = [];
  const pi = {
    async exec(command, args) {
      calls.push({ command, args });
      if (command === "agent-browser" && args[0] === "--version") {
        return makeExecResult({ code: 0, stdout: "agent-browser 0.20.1\n" });
      }
      return makeExecResult({ code: 1, stderr: "unexpected" });
    },
  };

  const resolved = await resolveAgentBrowserCommand(pi, { platform: "linux" });
  assert.ok(resolved);
  assert.equal(resolved.command, "agent-browser");
  assert.equal(calls.length, 1, "should short-circuit after the direct PATH check");
});

test("execNpm falls back to node npm-cli spec when npm spawn-style invocation fails", async () => {
  const calls = [];
  const pi = {
    async exec(command, args) {
      calls.push({ command, args });

      if (command === "npm") {
        // Mimic Windows spawn failure through pi.exec: non-zero + empty output.
        return makeExecResult({ code: 1 });
      }

      if (command === "node" && args[0] === "C:/fake/npm-cli.js") {
        return makeExecResult({ code: 0, stdout: "C:/Users/test/AppData/Roaming/npm\n" });
      }

      return makeExecResult({ code: 1, stderr: "unexpected command" });
    },
  };

  const result = await execNpm(
    pi,
    ["config", "get", "prefix"],
    { timeout: 5000 },
    {
      npmCommandSpecs: [
        { command: "npm", label: "npm" },
        { command: "node", baseArgs: ["C:/fake/npm-cli.js"], label: "node npm-cli" },
      ],
    }
  );

  assert.equal(result.code, 0);
  assert.equal(calls[0].command, "npm");
  assert.equal(calls[1].command, "node");
});

test("ensureInstalled installs via npm and then runs chromium install", async () => {
  const { prefix, scriptPath } = makeWindowsPrefixWithAgentBrowserScript();
  const notifications = [];
  let installed = false;

  const pi = {
    async exec(command, args) {
      if (command === "agent-browser") {
        return makeExecResult({ code: 1 });
      }

      if (command === "node" && args[0] === scriptPath && args[1] === "--version") {
        return installed
          ? makeExecResult({ code: 0, stdout: "agent-browser 0.20.1\n" })
          : makeExecResult({ code: 1 });
      }

      if (command === "node" && args[0] === "C:/fake/npm-cli.js" && args[1] === "install") {
        installed = true;
        return makeExecResult({ code: 0, stdout: "added 1 package\n" });
      }

      if (command === "node" && args[0] === scriptPath && args[1] === "install") {
        return makeExecResult({ code: 0, stdout: "Chromium ready\n" });
      }

      return makeExecResult({ code: 1, stderr: `unexpected command: ${command} ${args.join(" ")}` });
    },
  };

  const ctx = {
    hasUI: true,
    ui: {
      async confirm() {
        return true;
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };

  const resolved = await ensureInstalled(pi, ctx, {
    platform: "win32",
    prefixes: [prefix],
    npmCommandSpecs: [{ command: "node", baseArgs: ["C:/fake/npm-cli.js"], label: "node npm-cli" }],
  });

  assert.ok(resolved, "expected installed command to be returned");
  assert.equal(resolved.command, "node");
  assert.deepEqual(resolved.baseArgs, [scriptPath]);
  assert.ok(notifications.some((n) => n.message.includes("Installing agent-browser")));
  assert.ok(notifications.some((n) => n.message.includes("Downloading Chromium")));
});
