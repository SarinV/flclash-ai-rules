function dedupeAndSort(values) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

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

export function extractCopilotSpecificRules(markdown) {
  const section = extractSupportedSection(markdown);
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
