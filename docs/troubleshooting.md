# Troubleshooting

Common issues and their solutions.

---

## Installation Issues

### "agent-browser not found"

**Cause:** The `agent-browser` npm package isn't installed globally.

**Fix:** The extension will prompt to install automatically on first use. If that doesn't work:

```bash
npm install -g agent-browser
agent-browser install
```

### Installation prompt doesn't appear

**Cause:** Running in headless/non-interactive mode (`ctx.hasUI` is false).

**Fix:** Install manually before running:

```bash
npm install -g agent-browser
agent-browser install
```

### "Chromium install failed"

**Cause:** Network issues or missing system dependencies.

**Fix:**

1. Try installing manually:
   ```bash
   agent-browser install
   ```

2. On Debian/Ubuntu, install Chromium dependencies:
   ```bash
   sudo apt-get install -y \
     libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
     libnss3 libcups2 libxrandr2 libasound2 libpangocairo-1.0-0 \
     libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0
   ```

3. On Alpine/Docker, you may need:
   ```bash
   apk add chromium nss freetype harfbuzz ca-certificates ttf-freefont
   ```

---

## Runtime Issues

### Command times out

**Cause:** The 60-second default timeout is exceeded. Usually happens on slow networks or very heavy pages.

**Fix:** This is a limitation of the current implementation. Try:
- Using simpler/faster pages
- Breaking complex interactions into smaller steps
- Waiting for specific elements instead of full page loads

### "Command failed with exit code 1"

**Cause:** The agent-browser CLI returned an error.

**Fix:** Common causes:
- Browser not open yet — run `open <url>` first
- Invalid `@ref` — refs change between pages, re-snapshot after navigation
- Element not interactable — try waiting with `wait @ref` first

### Snapshot output is truncated

**Cause:** By design. Complex pages can produce output that exceeds context window limits.

**Fix:** This is expected behavior. The truncation notice includes a path to the full output:

```
[Output truncated: 2000 of 5432 lines (50KB of 128KB).
 Full output saved to: /tmp/pi-browser-snapshot-xxxxx/output.txt]
```

You can read the full output from that temp file if needed.

### Screenshots return text instead of images

**Cause:** The screenshot file path couldn't be parsed from agent-browser output, or the file couldn't be read.

**Fix:**
- Check that the screenshot path in the output exists
- Ensure the temp directory is writable
- Try running `agent-browser screenshot` directly to verify it works

### Model can't describe screenshots

**Cause:** The model doesn't support vision/image inputs.

**Fix:** Use a vision-capable model:
- **Claude:** 3.5 Sonnet, 3 Opus, 4 Sonnet, 4 Opus
- **OpenAI:** GPT-4o, GPT-4 Turbo
- **Google:** Gemini 1.5 Pro, Gemini 2.0 Pro

---

## Cleanup Issues

### Orphaned Chromium processes after crash

**Cause:** pi exited unexpectedly without triggering `session_shutdown`.

**Fix:**

```bash
# Try graceful close first
agent-browser close

# Force kill if needed
pkill -f chromium
```

### Browser from a previous session is still running

**Cause:** agent-browser reuses its browser session. If a previous session didn't close properly, the new session may connect to it.

**Fix:**

```bash
agent-browser close
```

Then start a new pi session.

---

## Performance Tips

1. **Minimize snapshots** — Only snapshot when you need `@ref` handles. Use `get text` for reading content.

2. **Close early** — Close the browser as soon as you're done. Chromium uses significant memory.

3. **Use targeted gets** — `get text @e5` is faster and smaller than `get text` for the whole page.

4. **Avoid full-page screenshots** — `screenshot` (viewport only) is faster than `screenshot --full`.

5. **Batch interactions** — Plan your clicks/fills before snapshotting again to reduce round-trips.
