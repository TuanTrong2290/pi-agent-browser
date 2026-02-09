# Command Reference

Complete reference for all commands available through the `browser` tool.

All commands are passed as the `command` parameter. You don't need to prefix with `agent-browser` — the extension handles that.

---

## Navigation

### `open <url>`

Navigate to a URL. Waits for the page to load.

```
browser open https://example.com
browser open https://news.ycombinator.com
```

### `close`

Close the browser and end the session. Always close when done to free resources.

```
browser close
```

---

## Inspection

### `snapshot -i`

Get a structured list of all interactive elements on the page. Each element gets a `@ref` handle (like `@e1`, `@e2`) that you can use in subsequent commands.

```
browser snapshot -i
```

Example output:
```
@e1  [link] "Home"
@e2  [link] "About"
@e3  [input] Search... (placeholder)
@e4  [button] "Submit"
```

**Tip:** Always re-snapshot after navigation or interactions — refs change between pages.

### `get text [@ref]`

Get the text content of the page or a specific element.

```
browser get text          # Full page text
browser get text @e3      # Text of element @e3
```

### `get url`

Get the current page URL.

```
browser get url
```

### `get title`

Get the current page title.

```
browser get title
```

---

## Interaction

### `click <@ref>`

Click an element by its `@ref` handle.

```
browser click @e4
```

### `fill <@ref> <text>`

Clear a field and type new text. Use for input fields, textareas, etc.

```
browser fill @e3 "search query"
```

### `type <@ref> <text>`

Type text into a field *without* clearing it first. Appends to existing content.

```
browser type @e3 " additional text"
```

### `select <@ref> <value>`

Select an option from a dropdown by its visible text.

```
browser select @e7 "United States"
```

### `press <key>`

Press a keyboard key. Useful for form submission, navigation, etc.

```
browser press Enter
browser press Tab
browser press Escape
browser press ArrowDown
```

### `scroll <direction> [pixels]`

Scroll the page. Direction: `up`, `down`, `left`, `right`. Optional pixel amount.

```
browser scroll down
browser scroll down 500
browser scroll up 200
```

---

## Visual

### `screenshot [--full]`

Take a screenshot of the current viewport. Returns the image inline so vision-capable models can see and describe the page.

```
browser screenshot           # Viewport only
browser screenshot --full    # Full page (scrollable)
```

The image is returned as a base64-encoded content block. The LLM sees it as an image and can describe layout, content, colors, etc.

---

## Waiting

### `wait <@ref|milliseconds>`

Wait for an element to appear, or wait for a fixed duration.

```
browser wait @e5         # Wait for element @e5 to appear
browser wait 2000        # Wait 2 seconds
```

---

## Typical Workflow

```
1. open <url>              Navigate to the target page
2. snapshot -i             See what's on the page
3. fill/click/select       Interact with elements using @refs
4. snapshot -i             Re-inspect after interaction
5. screenshot              (Optional) Get a visual of the result
6. close                   Clean up when done
```

**Important patterns:**
- Always `snapshot -i` before interacting — you need the `@ref` handles
- Re-snapshot after any navigation (clicks that load new pages, form submissions)
- Use `screenshot` when you need to visually verify something
- Always `close` when finished (also happens automatically on session exit)
