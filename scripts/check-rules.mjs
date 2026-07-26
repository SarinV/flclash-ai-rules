import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readPayload(relativePath) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const entries = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("- "))
    .map(line => line.slice(2));
  if (new Set(entries).size !== entries.length) {
    throw new Error(`${relativePath} contains duplicate entries`);
  }
  return entries;
}

const openAi = readPayload("rules/openai.yaml");
const copilot = readPayload("rules/copilot.yaml");
const voice = readPayload("rules/chatgpt-voice-ipcidr.yaml");

if (openAi.length < 25) throw new Error("OpenAI rule count is below safety floor");
if (copilot.length < 10) throw new Error("Copilot rule count is below safety floor");
if (voice.length < 5) throw new Error("Voice prefix count is below safety floor");

for (const rule of [...openAi, ...copilot]) {
  if (/^(?:MATCH|FINAL|SCRIPT|PROCESS|NETWORK|DST-PORT),/i.test(rule)) {
    throw new Error(`Dangerous rule found: ${rule}`);
  }
}
for (const prefix of voice) {
  if (!/^(?:[0-9.]+|[0-9a-f:]+)\/\d+$/i.test(prefix)) {
    throw new Error(`Invalid Voice prefix: ${prefix}`);
  }
}
if (copilot.some(rule => /,github\.com$|,api\.github\.com$/i.test(rule))) {
  throw new Error("Copilot list captures a generic GitHub domain");
}

const metadata = JSON.parse(
  fs.readFileSync(path.join(ROOT, "metadata.json"), "utf8"),
);
if (
  metadata.outputs.openAiRuleCount !== openAi.length ||
  metadata.outputs.copilotRuleCount !== copilot.length ||
  metadata.outputs.voicePrefixCount !== voice.length
) {
  throw new Error("metadata output counts do not match generated files");
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "ok",
      openAiRules: openAi.length,
      copilotRules: copilot.length,
      voicePrefixes: voice.length,
    },
    null,
    2,
  )}\n`,
);
