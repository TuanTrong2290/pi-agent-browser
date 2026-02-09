# pi-agent-browser

Browser automation tool for [pi](https://github.com/mariozechner/pi-coding-agent). Gives the LLM a `browser` tool that drives a real browser via [agent-browser](https://www.npmjs.com/package/agent-browser).

## Install

```bash
pi install npm:pi-agent-browser
```

Or try it without installing:

```bash
pi -e npm:pi-agent-browser
```

## What it does

Registers a `browser` tool that the LLM can call to:

- **Navigate** — `open <url>`
- **Inspect** — `snapshot -i` (returns interactive elements with `@ref` handles)
- **Interact** — `click @e1`, `fill @e2 "search query"`, `press Enter`, `scroll down`
- **Read** — `get text`, `get title`, `get url`, `get text @e3`
- **Screenshot** — returns the image inline so the LLM can see the page
- **Clean up** — `close` (also auto-closes on session shutdown)

## Features

| Feature | Details |
|---|---|
| **Inline screenshots** | Screenshots are returned as base64 images — the LLM can describe what it sees |
| **Output truncation** | Large `snapshot` output is truncated to fit context windows, with full output saved to a temp file |
| **Auto-install** | If `agent-browser` isn't installed, prompts to install it (npm + Chromium download) |
| **Session cleanup** | Browser is automatically closed on pi session shutdown — no orphaned Chromium processes |
| **TUI rendering** | Compact display: shows command inline, element counts for snapshots, screenshot paths |

## Example

```
You: Open hacker news and tell me the top 3 stories

browser open https://news.ycombinator.com
browser snapshot -i
browser close

The top 3 stories on Hacker News right now are:
1. ...
2. ...
3. ...
```

## Requirements

- [agent-browser](https://www.npmjs.com/package/agent-browser) — installed automatically on first use, or manually:
  ```bash
  npm install -g agent-browser
  agent-browser install  # downloads Chromium
  ```
- A vision-capable model (for screenshot descriptions): Claude Sonnet/Opus, GPT-4o, Gemini Pro, etc.

## License

MIT
