# Copilot allowlist parser compatibility design

## Goal

Restore the scheduled rule update after GitHub Docs renamed and restructured the Copilot allowlist section, while preserving the generator's fail-closed validation and its existing rule-selection semantics.

## Scope

- Support both the legacy `public URLs` heading and the current `Specific required domains` heading.
- Bound extraction at the next Markdown heading of the same or a higher level so only the selected section is parsed.
- Keep the existing Copilot host filters, glob conversion, sorting, safety floors, and generic-GitHub exclusions unchanged.
- Continue throwing `GitHub Copilot public URL section not found` when neither supported section exists.
- Add automated regression tests using Node's built-in test runner; no new dependency is required.

## Structure

Move the pure Copilot Markdown parsing code into `scripts/copilot-rules.mjs` and export `extractCopilotSpecificRules`. The networked generator imports this function from `scripts/update-rules.mjs`. This isolates deterministic parsing from network and filesystem side effects, allowing unit tests to import real production code.

The parser will inspect Markdown heading lines, select the first recognized legacy or current heading, and slice through the next heading whose level is less than or equal to the selected heading's level. Existing URL extraction and host filtering then operate on that slice.

## Tests

Add `test/copilot-rules.test.mjs` with fixtures covering:

1. The legacy level-two `public URLs` section.
2. The current level-three `Specific required domains` section followed by a level-two section.
3. A document with neither recognized heading, which must fail closed with the existing error.

The tests will assert returned rules rather than internal implementation details. `package.json` will expose `npm test` as `node --test`.

## Verification

- Observe the new regression test fail before production code changes.
- Run the focused test after the minimal implementation.
- Run the full Node test suite.
- Run the generator against current live upstreams in a disposable checkout or copy.
- Run `node scripts/check-rules.mjs` and `git diff --check`.
- Confirm generated Copilot rules still exclude bare `github.com` and `api.github.com`.

## Non-goals

- Replacing the GitHub Docs source with the GitHub `/meta` API.
- Changing the generated rule policy or adding broad GitHub/Microsoft domains.
- Treating the optional OpenAI Help Center HTTP 403 warning as fatal.
- Committing, pushing, or rerunning GitHub Actions without separate authorization.
