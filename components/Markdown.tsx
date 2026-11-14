import ReactMarkdown from "react-markdown";

/** Renders model-written Markdown. Raw HTML is not rendered. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-lesson">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
