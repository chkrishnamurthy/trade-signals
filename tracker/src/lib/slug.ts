import GithubSlugger from "github-slugger";

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

/**
 * Extract the h2/h3 headings from raw markdown and slug them exactly the way
 * rehype-slug does (a fresh github-slugger per document), so the TOC anchors
 * line up with the ids react-markdown renders.
 */
export function extractHeadings(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  const out: Heading[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const depth = m[1]?.length ?? 0;
    const text = (m[2] ?? "").replace(/[`*_]/g, "").trim();
    if (!text) continue;
    // Slug every heading in document order so the dedupe counters match
    // rehype-slug exactly; only surface h2/h3 in the table of contents.
    const id = slugger.slug(text);
    if (depth >= 2 && depth <= 3) out.push({ depth, text, id });
  }
  return out;
}
