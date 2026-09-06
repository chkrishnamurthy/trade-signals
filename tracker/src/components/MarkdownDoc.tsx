import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { extractHeadings } from "../lib/slug";
import { Mermaid } from "./Mermaid";

/** Recursively collapse a rendered node tree back to its raw text. */
function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    return textOf((node as { props?: { children?: unknown } }).props?.children);
  }
  return "";
}

/** Strip a leading YAML frontmatter block so it isn't rendered as body. */
export function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md;
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

export function MarkdownDoc({
  content,
  showToc = true,
}: {
  content: string;
  showToc?: boolean;
}) {
  const body = useMemo(() => stripFrontmatter(content), [content]);
  const headings = useMemo(() => extractHeadings(body), [body]);

  return (
    <div className={`doc-main${showToc && headings.length > 1 ? "" : " no-toc"}`}>
      <article className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={{
            // Route ```mermaid fences to the diagram renderer; everything else
            // keeps its normal <pre><code> (highlighted) rendering.
            pre({ node, children, ...rest }) {
              const child = Array.isArray(children) ? children[0] : children;
              const className =
                (child as { props?: { className?: string } } | undefined)?.props?.className ?? "";
              if (typeof className === "string" && className.includes("language-mermaid")) {
                const source = textOf(
                  (child as { props?: { children?: unknown } }).props?.children,
                ).replace(/\n$/, "");
                return <Mermaid chart={source} />;
              }
              return <pre {...rest}>{children}</pre>;
            },
          }}
        >
          {body}
        </ReactMarkdown>
      </article>
      {showToc && headings.length > 1 && (
        <nav className="doc-toc" aria-label="On this page">
          <div className="toc-label">On this page</div>
          {headings.map((h, i) => (
            <a key={`${h.id}-${i}`} href={`#${h.id}`} className={`lvl-${h.depth}`}>
              {h.text}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
