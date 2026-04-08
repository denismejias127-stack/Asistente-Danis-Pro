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
      <div className="relative group my-4 rounded-xl overflow-hidden border border-border/50 bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-border/50 text-zinc-400 text-xs font-mono">
          <span>{language || "code"}</span>
          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
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
          customStyle={{ margin: 0, background: "transparent", padding: "1rem" }}
          {...props}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </>
  );
};

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose-custom max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
