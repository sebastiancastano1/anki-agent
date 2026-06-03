"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders the agent's Markdown study guide with cozy prose styling. */
export function StudyGuide({ markdown }: { markdown: string }) {
  return (
    <article
      className="prose prose-stone max-w-none rounded-cozy bg-white/80 p-8 shadow-soft ring-1 ring-clay
        prose-headings:tracking-tight prose-headings:text-espresso
        prose-p:text-cocoa prose-li:text-cocoa prose-strong:text-espresso
        prose-a:text-terracotta hover:prose-a:text-terracotta/80"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  );
}
