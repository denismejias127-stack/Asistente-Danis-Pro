import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Eye, X } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

function HtmlPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-2xl">
          <span className="text-sm font-medium text-gray-700">Vista previa HTML</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            data-testid="button-close-preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <iframe
          srcDoc={html}
          className="flex-1 w-full border-0"
          sandbox="allow-scripts"
          title="Vista previa HTML"
        />
      </div>
    </div>
  );
}

const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const value = String(children).replace(/\n$/, "");
  const isHtml = language === "html" || (!language && value.trim().startsWith("<"));

  const onCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <>
      {showPreview && (
        <HtmlPreviewModal html={value} onClose={() => setShowPreview(false)} />
      )}
      <div className="relative group my-4 rounded-xl overflow-x-hidden border border-border/50 bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-border/50 text-zinc-400 text-xs font-mono">
          <span>{language || "code"}</span>
          <div className="flex items-center gap-3">
            {isHtml && (
              <button
                onClick={() => setShowPreview(true)}
                className="hover:text-zinc-100 transition-colors flex items-center gap-1.5"
                data-testid="button-preview-html"
                aria-label="Preview HTML"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
            )}
            <button
              onClick={onCopy}
              className="hover:text-zinc-100 transition-colors flex items-center gap-1.5"
              aria-label="Copy code"
              data-testid="button-copy-code"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus as any}
          language={language || "html"}
          PreTag="div"
          wrapLines={true}
          wrapLongLines={true}
          customStyle={{ margin: 0, background: "transparent", padding: "1rem", overflowX: "hidden", wordBreak: "break-word" }}
          {...props}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </>
  );
};

// Split content into text and data-URL image segments before passing to ReactMarkdown
// (react-markdown v10 can struggle with very long data URLs)
function splitContentImages(content: string): { type: "text" | "image"; value: string }[] {
  const parts: { type: "text" | "image"; value: string }[] = [];
  const regex = /!\[\]\((data:image\/[^)]{10,})\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: content.slice(last, m.index) });
    parts.push({ type: "image", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", value: content.slice(last) });
  return parts;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const parts = splitContentImages(content);
  return (
    <div className="prose-custom max-w-none break-words">
      {parts.map((part, i) =>
        part.type === "image" ? (
          <img
            key={i}
            src={part.value}
            alt="imagen generada"
            className="max-w-full rounded-xl my-2 border border-border shadow-sm block"
            style={{ maxHeight: "420px", objectFit: "contain" }}
          />
        ) : part.value.trim() ? (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            components={{ code: CodeBlock }}
          >
            {part.value}
          </ReactMarkdown>
        ) : null
      )}
    </div>
  );
});
