import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function uniqueNonEmpty(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isLikelySpawnFailure(result) {
  return result.code !== 0 && !result.stdout.trim() && !result.stderr.trim();
}

export function runCommandSpec(pi, spec, args, options) {
  return pi.exec(spec.command, [...(spec.baseArgs ?? []), ...args], options);
}

export function getNpmCommandSpecs(platform = process.platform, env = process.env, execPath = process.execPath) {
  const specs = [];

  const npmExecPath = env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    specs.push({ command: "node", baseArgs: [npmExecPath], label: `node ${npmExecPath}` });
  }

  const execDir = dirname(execPath);
  const npmCliCandidates = platform === "win32"
    ? [join(execDir, "node_modules", "npm", "bin", "npm-cli.js")]
    : [
      join(execDir, "../lib/node_modules/npm/bin/npm-cli.js"),
      join(execDir, "node_modules", "npm", "bin", "npm-cli.js"),
    ];

  for (const npmCli of npmCliCandidates) {
    if (existsSync(npmCli)) {
      specs.push({ command: "node", baseArgs: [npmCli], label: `node ${npmCli}` });
    }
  }

  specs.push({ command: "npm", label: "npm" });
  return specs;
}

export async function execNpm(pi, args, options = {}, runtime = {}) {
  const specs = runtime.npmCommandSpecs ?? getNpmCommandSpecs(runtime.platform, runtime.env, runtime.execPath);
  let lastResult = null;

  for (const spec of specs) {
    try {
      const result = await runCommandSpec(pi, spec, args, options);
      lastResult = result;

      if (result.code === 0) {
        return result;
      }

      if (!isLikelySpawnFailure(result)) {
        return result;
      }
    } catch {
      // Try next candidate
    }
  }

  return lastResult ?? { stdout: "", stderr: "npm execution failed", code: 1, killed: false };
}

export async function getNpmPrefix(pi, runtime = {}) {
  const result = await execNpm(pi, ["config", "get", "prefix"], { timeout: 5000 }, runtime);
  if (result.code !== 0) {
    return null;
  }

  const prefix = result.stdout.trim();
  return prefix || null;
}

export function getDefaultNpmPrefix(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    return env.APPDATA ? join(env.APPDATA, "npm") : null;
  }

  if (env.PREFIX) {
    return env.PREFIX;
  }

  return "/usr/local";
}

export function getAgentBrowserCandidatesFromPrefix(prefix, platform = process.platform) {
  if (!prefix) return [];

  const candidates = [];

  const nodeScriptCandidates = platform === "win32"
    ? [
      join(prefix, "node_modules", "agent-browser", "bin", "agent-browser.js"),
      join(prefix, "lib", "node_modules", "agent-browser", "bin", "agent-browser.js"),
    ]
    : [
      join(prefix, "lib", "node_modules", "agent-browser", "bin", "agent-browser.js"),
      join(prefix, "node_modules", "agent-browser", "bin", "agent-browser.js"),
    ];

  for (const script of nodeScriptCandidates) {
    if (existsSync(script)) {
      candidates.push({ command: "node", baseArgs: [script], label: `node ${script}` });
    }
  }

  if (platform === "win32") {
    const binaryCandidates = [
      join(prefix, "agent-browser.exe"),
      join(prefix, "agent-browser"),
      join(prefix, "agent-browser.cmd"),
    ];

    for (const binary of binaryCandidates) {
      if (existsSync(binary)) {
        candidates.push({ command: binary, label: binary });
      }
    }

    return candidates;
  }

  const binaryCandidates = [join(prefix, "bin", "agent-browser"), join(prefix, "agent-browser")];
  for (const binary of binaryCandidates) {
    if (existsSync(binary)) {
      candidates.push({ command: binary, label: binary });
    }
  }

  return candidates;
}

export async function resolveAgentBrowserCommand(pi, runtime = {}) {
  const platform = runtime.platform ?? process.platform;

  const directSpec = { command: "agent-browser", label: "agent-browser" };
  try {
    const direct = await runCommandSpec(pi, directSpec, ["--version"], { timeout: 5000 });
    if (direct.code === 0) {
      return directSpec;
    }
  } catch {
    // Ignore and continue with prefix lookup
  }

  const prefixes = runtime.prefixes
    ? uniqueNonEmpty(runtime.prefixes)
    : uniqueNonEmpty([
      await getNpmPrefix(pi, runtime),
      getDefaultNpmPrefix(platform, runtime.env ?? process.env),
    ]);

  for (const prefix of prefixes) {
    const candidates = getAgentBrowserCandidatesFromPrefix(prefix, platform);
    for (const candidate of candidates) {
      try {
        const test = await runCommandSpec(pi, candidate, ["--version"], { timeout: 5000 });
        if (test.code === 0) {
          return candidate;
        }
      } catch {
        // Try next candidate
      }
    }
  }

  return null;
}

export async function ensureInstalled(pi, ctx, runtime = {}) {
  const existing = await resolveAgentBrowserCommand(pi, runtime);
  if (existing) {
    return existing;
  }

  if (!ctx.hasUI) {
    return null;
  }

  const ok = await ctx.ui.confirm(
    "agent-browser not found",
    "Install agent-browser globally with npm? (npm install -g agent-browser)"
  );
  if (!ok) {
    return null;
  }

  ctx.ui.notify("Installing agent-browser...", "info");
  const install = await execNpm(pi, ["install", "-g", "agent-browser"], { timeout: 120000 }, runtime);
  if (install.code !== 0) {
    const installError = (install.stderr || install.stdout || "Unknown npm install error").trim();
    ctx.ui.notify(`Installation failed: ${installError}`, "error");
    return null;
  }

  const installedCommand = await resolveAgentBrowserCommand(pi, runtime);
  if (!installedCommand) {
    ctx.ui.notify("agent-browser was installed but is still not discoverable. Check PATH or restart pi.", "error");
    return null;
  }

  ctx.ui.notify("Downloading Chromium...", "info");
  const chromium = await runCommandSpec(pi, installedCommand, ["install"], { timeout: 120000 });
  if (chromium.code !== 0) {
    const chromiumError = (chromium.stderr || chromium.stdout || "Unknown Chromium install error").trim();
    ctx.ui.notify(`Chromium install failed: ${chromiumError}`, "error");
    return null;
  }

  ctx.ui.notify("agent-browser installed successfully!", "info");
  return installedCommand;
}
