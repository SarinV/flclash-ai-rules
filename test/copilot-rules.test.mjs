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
