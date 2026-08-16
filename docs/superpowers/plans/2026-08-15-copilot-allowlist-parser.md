# Copilot Allowlist Parser Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore scheduled generation for both legacy and current GitHub Copilot allowlist Markdown without broadening generated proxy rules.

**Architecture:** Isolate the deterministic Copilot Markdown parser in `scripts/copilot-rules.mjs` and keep `scripts/update-rules.mjs` responsible for network I/O, aggregation, validation, and writes. The parser recognizes the legacy and current headings, stops at the next heading of the same or a higher level, and retains the existing host filter and rule conversion behavior.

**Tech Stack:** Node.js 20+, ECMAScript modules, built-in `node:test`, built-in `node:assert/strict`.

## Global Constraints

- Support both the legacy `public URLs` heading and the current `Specific required domains` heading.
- Preserve the existing Copilot host filters, glob conversion, sorting, safety floors, and generic-GitHub exclusions.
- Fail closed with `GitHub Copilot public URL section not found` when neither supported section exists.
- Add no runtime or development dependencies.
- Do not commit, push, or rerun GitHub Actions without separate authorization.

---

### Task 1: Add and verify the compatible Copilot section parser

**Files:**
- Create: `scripts/copilot-rules.mjs`
- Create: `test/copilot-rules.test.mjs`
- Modify: `scripts/update-rules.mjs:1-3,160-191`
- Modify: `package.json:5-9`

**Interfaces:**
- Consumes: GitHub Docs Markdown as a JavaScript string.
- Produces: `extractCopilotSpecificRules(markdown: string): string[]`.
- Throws: `Error("GitHub Copilot public URL section not found")` when no supported heading exists.

- [x] **Step 1: Add tests that describe legacy compatibility, current compatibility, section boundaries, and fail-closed behavior**

Create `test/copilot-rules.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import { extractCopilotSpecificRules } from "../scripts/copilot-rules.mjs";

test("extracts Copilot rules from the legacy public URLs section", () => {
  const markdown = `
## GitHub public URLs

| Domain |
| --- |
| \`https://copilot-proxy.githubusercontent.com\` |
| \`https://*.githubcopilot.com/*\` |
| \`https://github.com/login/*\` |

## GitHub Copilot voice features

| \`https://copilot-voice.example.com\` |
`;

  assert.deepEqual(extractCopilotSpecificRules(markdown), [
    "DOMAIN-SUFFIX,githubcopilot.com",
    "DOMAIN,copilot-proxy.githubusercontent.com",
  ]);
});

test("extracts only the current Specific required domains section", () => {
  const markdown = `
## Copilot on GitHub.com

### Specific required domains

| Domain |
| --- |
| \`https://copilot-telemetry.githubusercontent.com/telemetry\` |
| \`https://default.exp-tas.com\` |
| \`https://copilot-reports-*.b01.azurefd.net\` |

## Copilot on GHE.com

| \`https://copilot-outside-section.example.com\` |
`;

  assert.deepEqual(extractCopilotSpecificRules(markdown), [
    "DOMAIN-REGEX,^copilot-reports-.*\\.b01\\.azurefd\\.net$",
    "DOMAIN,copilot-telemetry.githubusercontent.com",
    "DOMAIN,default.exp-tas.com",
  ]);
});

test("fails closed when the supported section is absent", () => {
  assert.throws(
    () => extractCopilotSpecificRules("## Unrelated section\n"),
    /GitHub Copilot public URL section not found/,
  );
});
```

Modify `package.json` scripts to include:

```json
"test": "node --test"
```

- [x] **Step 2: Run the test and verify the initial module-resolution failure**

Run: `npm test`

Expected: FAIL because `scripts/copilot-rules.mjs` does not exist. This is the temporary test-seam error; Step 3 resolves it without changing legacy parser behavior.

- [x] **Step 3: Extract the existing legacy parser into the new module without adding current-heading support**

Create `scripts/copilot-rules.mjs` with the existing `globHostToRule`, host filtering, deduplication, sorting, and the legacy `public URLs`/`voice features` boundaries. Export only:

```javascript
export function extractCopilotSpecificRules(markdown) {
  // Existing legacy implementation, unchanged in behavior.
}
```

In `scripts/update-rules.mjs`, add:

```javascript
import { extractCopilotSpecificRules } from "./copilot-rules.mjs";
```

Remove the local `globHostToRule` and `extractCopilotSpecificRules` declarations. Keep the existing shared `dedupeAndSort` used by non-Copilot generation.

- [x] **Step 4: Run the focused test and verify the behavioral RED state**

Run: `node --test test/copilot-rules.test.mjs`

Expected: the legacy and missing-section tests pass; the current `Specific required domains` test fails with `GitHub Copilot public URL section not found`.

- [x] **Step 5: Implement heading-aware section selection**

Replace the legacy string boundaries in `scripts/copilot-rules.mjs` with heading parsing equivalent to:

```javascript
const SUPPORTED_SECTION_HEADINGS = [
  /public URLs/i,
  /Specific required domains/i,
];

function extractSupportedSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  let contentStart = -1;
  let headingLevel = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (
      heading &&
      SUPPORTED_SECTION_HEADINGS.some(pattern => pattern.test(heading[2]))
    ) {
      contentStart = index + 1;
      headingLevel = heading[1].length;
      break;
    }
  }

  if (contentStart < 0) {
    throw new Error("GitHub Copilot public URL section not found");
  }

  let contentEnd = lines.length;
  for (let index = contentStart; index < lines.length; index += 1) {
    const heading = /^(#{1,6})\s+/.exec(lines[index]);
    if (heading && heading[1].length <= headingLevel) {
      contentEnd = index;
      break;
    }
  }

  return lines.slice(contentStart, contentEnd).join("\n");
}
```

Call `extractSupportedSection(markdown)` before applying the unchanged URL extraction and Copilot-specific host filters.

- [x] **Step 6: Verify GREEN and inspect the exact change**

Run: `node --test test/copilot-rules.test.mjs`

Expected: 3 tests pass, 0 fail.

Run: `git diff -- scripts/copilot-rules.mjs scripts/update-rules.mjs test/copilot-rules.test.mjs package.json`

Expected: only parser isolation, heading compatibility, test registration, and regression tests are present.

- [x] **Step 7: Run full local validation**

Run: `npm test`

Expected: all tests pass with no warnings or errors.

Run: `node scripts/check-rules.mjs`

Expected: JSON with `"status": "ok"` and rule counts matching `metadata.json`.

Run: `git diff --check`

Expected: no output and exit code 0.

- [x] **Step 8: Validate against the current live upstream in a disposable copy**

Copy the working tree to a temporary directory without `.git`, run `node scripts/update-rules.mjs`, then run `node scripts/check-rules.mjs` there.

Expected: generator exits 0; the optional OpenAI Help Center HTTP 403 warning may appear; validation reports `"status": "ok"`; generated Copilot rules contain neither bare `github.com` nor bare `api.github.com`.

- [x] **Step 9: Review final status and stop before publication**

Run: `git status --short`

Expected modified scope:

```text
 M package.json
 M scripts/update-rules.mjs
?? docs/superpowers/plans/2026-08-15-copilot-allowlist-parser.md
?? docs/superpowers/specs/2026-08-15-copilot-allowlist-parser-design.md
?? scripts/copilot-rules.mjs
?? test/copilot-rules.test.mjs
```

If the user separately authorizes a commit, stage only those exact paths and commit with:

```bash
git add -- package.json scripts/update-rules.mjs scripts/copilot-rules.mjs test/copilot-rules.test.mjs docs/superpowers/specs/2026-08-15-copilot-allowlist-parser-design.md docs/superpowers/plans/2026-08-15-copilot-allowlist-parser.md
git commit -m "Fix Copilot allowlist parsing"
```

Do not push or rerun GitHub Actions without separate authorization.
