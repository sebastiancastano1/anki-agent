// Classify source URLs into credibility tiers and curate the best ones.
// Shared by the research view (live) and the deck page (persisted).

export type SourceTier = "academic" | "trusted" | "other";

export interface ClassifiedSource {
  url: string;
  title: string;
  host: string;
  tier: SourceTier;
}

export const TIER_META: Record<SourceTier, { label: string; rank: number }> = {
  academic: { label: "Académicas y oficiales", rank: 0 },
  trusted: { label: "Confiables", rank: 1 },
  other: { label: "Otras", rank: 2 },
};

// Domains / patterns that signal high-authority academic or official sources.
const ACADEMIC_HOST_KEYWORDS = [
  "wikipedia.org",
  "doi.org",
  "nature.com",
  "science.org",
  "sciencedirect.com",
  "springer.com",
  "ncbi.nlm.nih.gov",
  "pubmed",
  "jstor.org",
  "arxiv.org",
  "scholar.google",
  "britannica.com",
  "who.int",
  "un.org",
  "europa.eu",
  "oecd.org",
];

// Well-known reputable media / organizations.
const TRUSTED_HOST_KEYWORDS = [
  "bbc.",
  "nytimes.com",
  "theguardian.com",
  "reuters.com",
  "apnews.com",
  "nationalgeographic.com",
  "smithsonianmag.com",
  "history.com",
  "elpais.com",
  "lemonde.fr",
  "dw.com",
];

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function classifyTier(url: string): SourceTier {
  const host = hostOf(url);
  if (!host) return "other";

  // Academic/official: TLD-based or known scholarly hosts.
  if (
    /(^|\.)edu(\.|$)/.test(host) ||
    /(^|\.)gov(\.|$)/.test(host) ||
    /(^|\.)ac\.[a-z]{2,}$/.test(host) ||
    /(^|\.)edu\.[a-z]{2,}$/.test(host) ||
    /(^|\.)gob\.[a-z]{2,}$/.test(host) ||
    ACADEMIC_HOST_KEYWORDS.some((k) => host.includes(k))
  ) {
    return "academic";
  }

  if (TRUSTED_HOST_KEYWORDS.some((k) => host.includes(k)) || host.endsWith(".org")) {
    return "trusted";
  }

  return "other";
}

export function classify(source: { url: string; title: string }): ClassifiedSource {
  return {
    url: source.url,
    title: source.title || hostOf(source.url) || source.url,
    host: hostOf(source.url) ?? source.url,
    tier: classifyTier(source.url),
  };
}

export interface SourceGroup {
  tier: SourceTier;
  label: string;
  sources: ClassifiedSource[];
}

/** Group sources by tier, ordered academic → trusted → other. */
export function groupByTier(
  sources: { url: string; title: string }[]
): SourceGroup[] {
  const seen = new Set<string>();
  const classified: ClassifiedSource[] = [];
  for (const s of sources) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    classified.push(classify(s));
  }

  return (Object.keys(TIER_META) as SourceTier[])
    .sort((a, b) => TIER_META[a].rank - TIER_META[b].rank)
    .map((tier) => ({
      tier,
      label: TIER_META[tier].label,
      sources: classified.filter((c) => c.tier === tier),
    }))
    .filter((g) => g.sources.length > 0);
}
