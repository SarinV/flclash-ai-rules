import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULES_DIR = path.join(ROOT, "rules");
const METADATA_PATH = path.join(ROOT, "metadata.json");

const SOURCES = {
  metaOpenAi:
    "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/openai.yaml",
  metaInternationalAi:
    "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/category-ai-chat-%21cn.yaml",
  githubCopilot:
    "https://raw.githubusercontent.com/github/docs/main/content/copilot/reference/copilot-allowlist-reference.md",
  openAiHelp:
    "https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps",
  openAiVoice: "https://openai.com/chatgpt-voice.json",
};

// 2026-07-25 根据 OpenAI Help Center 官方清单核对。
// 实时 Help Center 无法自动访问时，这个基线与 MetaCubeX 上游共同保证不倒退。
const OFFICIAL_OPENAI_DOMAIN_BASELINE = [
  "*.auth.openai.com",
  "*.chatgpt.com",
  "*.ct.sendgrid.net",
  "*.intercom.io",
  "*.intercomcdn.com",
  "*.oaistatic.com",
  "*.oaiusercontent.com",
  "*.openai.com",
  "*.oaistatsig.com",
  "android.chat.openai.com",
  "auth0.openai.com",
  "cdn.openaimerge.com",
  "cdn.workos.com",
  "challenges.cloudflare.com",
  "chat.openai.com",
  "desktop.chat.openai.com",
  "forwarder.workos.com",
  "humb.apple.com",
  "images.workoscdn.com",
  "ios.chat.openai.com",
  "js.intercomcdn.com",
  "js.stripe.com",
  "o207216.ingest.sentry.io",
  "o33249.ingest.sentry.io",
  "rum.browser-intake-datadoghq.com",
  "setup.auth.openai.com",
  "setup.workos.com",
  "tcr9i.chat.openai.com",
  "workos.imgix.net",
];

const CURATED_COPILOT_RULES = [
  "DOMAIN,copilot-workspace.githubnext.com",
  "DOMAIN,copilotprodattachments.blob.core.windows.net",
  "DOMAIN,copilot-telemetry-service.githubusercontent.com",
  "DOMAIN-SUFFIX,copilot.com",
  "DOMAIN-SUFFIX,copilot.microsoft.com",
  "DOMAIN-SUFFIX,copilot.cloud.microsoft",
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchText(url, { optional = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "accept": "text/plain,text/markdown,text/yaml,application/json,text/html;q=0.9,*/*;q=0.5",
          "user-agent": "SarinV-flclash-ai-rules/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      if (text.trim().length === 0) {
        throw new Error("empty response");
      }
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(750 * attempt);
    }
  }
  if (optional) {
    console.warn(`Optional source unavailable: ${url}: ${lastError}`);
    return null;
  }
  throw new Error(`Failed to fetch ${url}: ${lastError}`);
}

function parseYamlPayload(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("- "))
    .map(line => line.slice(2).trim().replace(/^['"]|['"]$/g, ""));
}

function dedupeAndSort(values) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function validateClassicalRule(rule) {
  if (/^(?:MATCH|FINAL|SCRIPT|PROCESS|NETWORK|DST-PORT),/i.test(rule)) {
    throw new Error(`Disallowed classical rule: ${rule}`);
  }
  if (/^(?:DOMAIN|DOMAIN-SUFFIX),[a-z0-9*._-]+$/i.test(rule)) return;
  if (/^DOMAIN-KEYWORD,[^,\s]+$/i.test(rule)) return;
  if (/^DOMAIN-REGEX,[\x21-\x7e]+$/i.test(rule)) return;
  if (/^IP-CIDR6?,[0-9a-f:.]+\/\d+(?:,no-resolve)?$/i.test(rule)) return;
  throw new Error(`Invalid classical rule: ${rule}`);
}

function domainPatternToRule(pattern) {
  const normalized = pattern.trim().toLowerCase();
  if (normalized.startsWith("*.")) {
    return `DOMAIN-SUFFIX,${normalized.slice(2)}`;
  }
  return `DOMAIN,${normalized}`;
}

function extractOpenAiHelpDomains(html) {
  const start = html.indexOf("OpenAI/ChatGPT domains to allowlist");
  const end = html.indexOf("WebSocket requirements for ChatGPT and Codex", start);
  if (start < 0 || end <= start) return [];
  const segment = html.slice(start, end);
  const matches = segment.match(
    /(?:\*\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/gi,
  ) ?? [];
  const domains = dedupeAndSort(
    matches.map(value => value.toLowerCase()),
  );
  if (
    domains.length < 20 ||
    domains.length > 80 ||
    !domains.some(value => value.endsWith("openai.com")) ||
    !domains.some(value => value.endsWith("chatgpt.com"))
  ) {
    return [];
  }
  return domains;
}

function globHostToRule(host) {
  const normalized = host.toLowerCase();
  if (normalized.startsWith("*.") && !normalized.slice(2).includes("*")) {
    return `DOMAIN-SUFFIX,${normalized.slice(2)}`;
  }
  if (!normalized.includes("*")) return `DOMAIN,${normalized}`;
  const expression = normalized
    .split("*")
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return `DOMAIN-REGEX,^${expression}$`;
}

function extractCopilotSpecificRules(markdown) {
  const start = markdown.indexOf("public URLs");
  const end = markdown.indexOf("voice features", start);
  if (start < 0 || end <= start) {
    throw new Error("GitHub Copilot public URL section not found");
  }
  const section = markdown.slice(start, end);
  const matches = [...section.matchAll(/`https:\/\/([^`/]+)(?:\/[^`]*)?`/gi)];
  const hosts = matches.map(match => match[1]);
  return dedupeAndSort(
    hosts
      .filter(host =>
        /copilot/i.test(host) ||
        /^default\.exp-tas\.com$/i.test(host) ||
        /^origin-tracker\.githubusercontent\.com$/i.test(host) ||
        /^usagereports.*\.blob\.core\.windows\.net$/i.test(host)
      )
      .filter(host => !/SUBDOMAIN/i.test(host))
      .map(globHostToRule),
  );
}

function parseVoicePrefixes(text) {
  const payload = JSON.parse(text);
  if (!Array.isArray(payload.prefixes)) {
    throw new Error("Voice JSON has no prefixes array");
  }
  const prefixes = dedupeAndSort(
    payload.prefixes.flatMap(entry =>
      [entry.ipv4Prefix, entry.ipv6Prefix].filter(Boolean),
    ),
  );
  for (const prefix of prefixes) {
    if (!/^(?:[0-9.]+|[0-9a-f:]+)\/\d+$/i.test(prefix)) {
      throw new Error(`Invalid Voice CIDR: ${prefix}`);
    }
  }
  if (prefixes.length < 5 || prefixes.length > 500) {
    throw new Error(`Unexpected Voice prefix count: ${prefixes.length}`);
  }
  return {
    creationTime: payload.creationTime ?? null,
    prefixes,
  };
}

function renderClassical(sourceComments, rules) {
  return [
    "# Auto-generated by scripts/update-rules.mjs. Do not edit by hand.",
    ...sourceComments.map(comment => `# ${comment}`),
    "payload:",
    ...rules.map(rule => `  - ${rule}`),
    "",
  ].join("\n");
}

function renderIpCidr(sourceComments, prefixes) {
  return [
    "# Auto-generated by scripts/update-rules.mjs. Do not edit by hand.",
    ...sourceComments.map(comment => `# ${comment}`),
    "payload:",
    ...prefixes.map(prefix => `  - ${prefix}`),
    "",
  ].join("\n");
}

function writeIfChanged(filePath, content) {
  const previous = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : null;
  if (previous === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

const [
  metaOpenAiText,
  metaInternationalAiText,
  githubCopilotText,
  voiceText,
  openAiHelpText,
] = await Promise.all([
  fetchText(SOURCES.metaOpenAi),
  fetchText(SOURCES.metaInternationalAi),
  fetchText(SOURCES.githubCopilot),
  fetchText(SOURCES.openAiVoice),
  fetchText(SOURCES.openAiHelp, { optional: true }),
]);

const metaOpenAiRules = parseYamlPayload(metaOpenAiText);
if (metaOpenAiRules.length < 10) {
  throw new Error(`MetaCubeX OpenAI rule count too small: ${metaOpenAiRules.length}`);
}
const helpDomains = openAiHelpText
  ? extractOpenAiHelpDomains(openAiHelpText)
  : [];
const officialDomainRules = [
  ...OFFICIAL_OPENAI_DOMAIN_BASELINE,
  ...helpDomains,
].map(domainPatternToRule);
const openAiRules = dedupeAndSort([
  ...metaOpenAiRules,
  ...officialDomainRules,
]);
openAiRules.forEach(validateClassicalRule);
if (openAiRules.length < 25) {
  throw new Error(`OpenAI output rule count too small: ${openAiRules.length}`);
}

const officialCopilotRules = extractCopilotSpecificRules(githubCopilotText);
const metaCopilotRules = parseYamlPayload(metaInternationalAiText).filter(rule =>
  /copilot|githubnext|copilotprodattachments/i.test(rule),
);
const copilotRules = dedupeAndSort([
  ...officialCopilotRules,
  ...metaCopilotRules,
  ...CURATED_COPILOT_RULES,
]);
copilotRules.forEach(validateClassicalRule);
if (copilotRules.length < 10) {
  throw new Error(`Copilot output rule count too small: ${copilotRules.length}`);
}
if (copilotRules.some(rule => /,github\.com$|,api\.github\.com$/i.test(rule))) {
  throw new Error("Copilot output captured a generic GitHub domain");
}

const voice = parseVoicePrefixes(voiceText);
const openAiYaml = renderClassical(
  [
    `MetaCubeX: ${SOURCES.metaOpenAi}`,
    `OpenAI official baseline: ${SOURCES.openAiHelp}`,
    `Live OpenAI Help extraction: ${helpDomains.length > 0 ? "used" : "unavailable; baseline retained"}`,
  ],
  openAiRules,
);
const copilotYaml = renderClassical(
  [
    `GitHub official source: ${SOURCES.githubCopilot}`,
    `MetaCubeX international AI source: ${SOURCES.metaInternationalAi}`,
    "Generic GitHub and Microsoft 365 shared domains are intentionally excluded.",
  ],
  copilotRules,
);
const voiceYaml = renderIpCidr(
  [
    `OpenAI official source: ${SOURCES.openAiVoice}`,
    `Source creationTime: ${voice.creationTime ?? "unknown"}`,
    "Use only with UDP + destination port 3478 scoping; never as a global STUN allow rule.",
  ],
  voice.prefixes,
);

const month = new Date().toISOString().slice(0, 7);
const metadata = {
  schemaVersion: 1,
  heartbeatMonth: month,
  sources: {
    metaOpenAi: {
      url: SOURCES.metaOpenAi,
      sha256: sha256(metaOpenAiText),
    },
    metaInternationalAi: {
      url: SOURCES.metaInternationalAi,
      sha256: sha256(metaInternationalAiText),
    },
    githubCopilot: {
      url: SOURCES.githubCopilot,
      sha256: sha256(githubCopilotText),
    },
    openAiHelp: {
      url: SOURCES.openAiHelp,
      liveExtractionUsed: helpDomains.length > 0,
      extractedDomainCount: helpDomains.length,
      sha256: openAiHelpText ? sha256(openAiHelpText) : null,
    },
    openAiVoice: {
      url: SOURCES.openAiVoice,
      creationTime: voice.creationTime,
      sha256: sha256(voiceText),
    },
  },
  outputs: {
    openAiRuleCount: openAiRules.length,
    copilotRuleCount: copilotRules.length,
    voicePrefixCount: voice.prefixes.length,
  },
};

const changed = [
  writeIfChanged(path.join(RULES_DIR, "openai.yaml"), openAiYaml),
  writeIfChanged(path.join(RULES_DIR, "copilot.yaml"), copilotYaml),
  writeIfChanged(
    path.join(RULES_DIR, "chatgpt-voice-ipcidr.yaml"),
    voiceYaml,
  ),
  writeIfChanged(
    METADATA_PATH,
    `${JSON.stringify(metadata, null, 2)}\n`,
  ),
].filter(Boolean).length;

process.stdout.write(
  `${JSON.stringify(
    {
      changedFiles: changed,
      helpLiveExtractionUsed: helpDomains.length > 0,
      openAiRules: openAiRules.length,
      copilotRules: copilotRules.length,
      voicePrefixes: voice.prefixes.length,
    },
    null,
    2,
  )}\n`,
);
