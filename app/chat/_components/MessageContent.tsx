"use client";

import ReactMarkdown from "react-markdown";

// ─── Text renderer ──────────────────────────────────────────────────────────

export function MessageContent({ content, showCursor, isUser }: { content: string; showCursor?: boolean; isUser?: boolean }) {
  // Transcript style: no bubble, no border, no background. The user
  // message reads as the question (the quiet ink tier); the Oracle's
  // reply reads as the answer (full presence, primary color). Same
  // font size on both so the page reads as a continuous conversation
  // the way Claude.ai does, not a chat app.
  const wrapClass = isUser
    ? "font-body text-text-secondary leading-relaxed"
    : "font-body text-text-primary leading-relaxed";

  // While streaming, render plain text. react-markdown re-parses the entire
  // string on every reveal tick, which is a re-parse storm on long replies
  // and the main source of jank in chat. Plain text during the stream is
  // cheap; markdown is parsed exactly once when the message finalizes.
  if (showCursor) {
    return (
      <div className={wrapClass} style={{ fontSize: 17 }}>
        <span className="whitespace-pre-wrap">{content}</span>
        <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
      </div>
    );
  }

  return (
    <div className={wrapClass} style={{ fontSize: 17 }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          h1: ({ children }) => (
            <h1 className="font-heading text-xl text-text-primary mb-2 mt-3 first:mt-0" style={{ fontWeight: 700 }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-heading text-lg text-text-primary mb-2 mt-3 first:mt-0" style={{ fontWeight: 700 }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-heading text-base text-amber-sun mb-1 mt-2 first:mt-0">{children}</h3>
          ),
          em: ({ children }) => (
            <em className="">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li>{children}</li>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {showCursor && (
        <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
}
