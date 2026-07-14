---
name: Imported repo stray artifacts
description: Leftover non-JS markers in imported source files can silently break module loading
---

Saw a `.js` file (`src/utils/commandDiagnostics.js` in TitanBot) start with a
Markdown-style frontmatter block (`---` ... `#comment` lines ... `---`) left
in by mistake. Node's ESM loader throws `SyntaxError: Invalid or unexpected
token` on import, which can cascade into a caller silently skipping a whole
loader step (e.g. "Loaded events" logging success while one event file's
import actually failed upstream).

**Why:** These artifacts are easy to miss because they don't stop the whole
app if the broken module is wrapped in a try/catch upstream — the app looks
"ONLINE" while a feature quietly doesn't load.

**How to apply:** When workflow startup logs contain confusing/unexplained
`SyntaxError: Invalid or unexpected token` entries, run
`for f in $(find src -name '*.js'); do node --check "$f" || echo "$f"; done`
(adjust glob to the project's source dir) to pinpoint the exact broken file
fast, rather than bisecting by reading logs.
