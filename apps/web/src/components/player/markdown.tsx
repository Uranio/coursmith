"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GlossaryTerm } from "./glossary";

const GLOSSARY_PREFIX = "#glossary:";

/** [[term]] and [[term|shown text]] become links with a private scheme that render as glossary terms. */
function linkTerms(text: string): string {
  return text.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, term: string, shown?: string) => {
    const label = (shown ?? term).trim().replace(/([[\]])/g, "\\$1");
    return `[${label}](${GLOSSARY_PREFIX}${encodeURIComponent(term.trim())})`;
  });
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`prose-course ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Raw HTML is never rendered (react-markdown escapes it); images are blocks, not Markdown.
        disallowedElements={["img"]}
        components={{
          a({ href, children }) {
            if (href?.startsWith(GLOSSARY_PREFIX)) {
              return <GlossaryTerm term={decodeURIComponent(href.slice(GLOSSARY_PREFIX.length))}>{children}</GlossaryTerm>;
            }
            if (!href?.startsWith("https://")) return <>{children}</>;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">
                {children}
              </a>
            );
          },
        }}
      >
        {linkTerms(text)}
      </ReactMarkdown>
    </div>
  );
}
