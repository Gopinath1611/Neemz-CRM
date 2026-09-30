import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileText, RefreshCw, Search, Copy, Printer, History, BookOpen } from "lucide-react";
import { toast } from "sonner";

const DOC_VERSION = "v2.0";
const DOC_DATE = "2026-06-30";

const DOCS = [
  { id: "01_Project_Overview", title: "01 · Project Overview" },
  { id: "02_System_Architecture", title: "02 · System Architecture" },
  { id: "03_Database_Architecture", title: "03 · Database Architecture" },
  { id: "04_Clinic_Workflow", title: "04 · Clinic Workflow" },
  { id: "05_Finance_Architecture", title: "05 · Finance Architecture" },
  { id: "06_Inventory_Architecture", title: "06 · Inventory Architecture" },
  { id: "07_Purchase_Management", title: "07 · Purchase Management" },
  { id: "08_Pharmacy_Architecture", title: "08 · Pharmacy Architecture" },
  { id: "09_API_Documentation", title: "09 · API Documentation" },
  { id: "10_QA_Test_Cases", title: "10 · QA Test Cases" },
  { id: "11_Release_Notes", title: "11 · Release Notes" },
];

const PDF_URL = "/docs/Finance_Architecture.pdf";
const DOCX_URL = "/docs/Finance_Architecture.docx";

mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });

const MermaidBlock = ({ code }: { code: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const id = useMemo(() => `m${Math.random().toString(36).slice(2)}`, []);
  useEffect(() => {
    let cancelled = false;
    mermaid.render(id, code)
      .then(({ svg }) => { if (!cancelled && ref.current) ref.current.innerHTML = svg; })
      .catch(() => { if (ref.current) ref.current.innerHTML = `<pre class="text-xs">${code}</pre>`; });
    return () => { cancelled = true; };
  }, [id, code]);
  return <div ref={ref} className="my-4 overflow-x-auto" />;
};

const SystemDocumentation = () => {
  const [activeId, setActiveId] = useState("01_Project_Overview");
  const [md, setMd] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/docs/${id}.md?t=${Date.now()}`);
      setMd(await res.text());
    } catch {
      setMd("# Not available");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(activeId); }, [activeId]);
  useEffect(() => {
    fetch("/docs/VERSIONS.json").then(r => r.json()).then(setVersions).catch(() => {});
  }, []);

  // TOC headings
  const toc = useMemo(() => {
    const out: { level: number; text: string; id: string }[] = [];
    md.split("\n").forEach(line => {
      const m = /^(#{2,3})\s+(.+)$/.exec(line);
      if (m) {
        const text = m[2].trim();
        out.push({ level: m[1].length, text, id: text.toLowerCase().replace(/[^\w]+/g, "-") });
      }
    });
    return out;
  }, [md]);

  // Search filter — highlight by simple wrap
  const displayMd = useMemo(() => {
    if (!search.trim()) return md;
    const q = search.trim();
    try {
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      return md.replace(re, "**$1**");
    } catch { return md; }
  }, [md, search]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(md);
    toast.success("Markdown copied");
  };

  const components = {
    h2: ({ children, ...p }: any) => {
      const text = String(children).trim();
      const id = text.toLowerCase().replace(/[^\w]+/g, "-");
      return <h2 id={id} {...p}>{children}</h2>;
    },
    h3: ({ children, ...p }: any) => {
      const text = String(children).trim();
      const id = text.toLowerCase().replace(/[^\w]+/g, "-");
      return <h3 id={id} {...p}>{children}</h3>;
    },
    code: ({ inline, className, children, ...props }: any) => {
      const lang = /language-(\w+)/.exec(className || "")?.[1];
      const value = String(children).replace(/\n$/, "");
      if (!inline && lang === "mermaid") return <MermaidBlock code={value} />;
      return inline
        ? <code className={className} {...props}>{children}</code>
        : <pre className="bg-secondary p-3 rounded text-xs overflow-x-auto"><code>{value}</code></pre>;
    },
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4 print:hidden">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> System Documentation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Permanent architecture & QA documentation. Read-only.
          </p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="secondary">Version {DOC_VERSION}</Badge>
            <Badge variant="outline">Generated {DOC_DATE}</Badge>
            <Badge variant="outline">{DOCS.length} documents</Badge>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowVersions(v => !v)}>
            <History className="h-4 w-4 mr-2" /> Versions
          </Button>
          <Button variant="outline" size="sm" onClick={() => load(activeId)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Reload
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" /> Copy MD
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={PDF_URL} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-2" /> PDF
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={DOCX_URL} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-2" /> DOCX
            </a>
          </Button>
        </div>
      </div>

      {showVersions && (
        <Card className="shadow-card mb-4 print:hidden">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">Version history</h3>
            <ul className="text-xs space-y-1">
              {versions.map(v => (
                <li key={v.version}>
                  <span className="font-mono font-semibold">{v.version}</span> — {v.date} — {v.summary}
                  {v.supersedes && <span className="text-muted-foreground"> (supersedes {v.supersedes})</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_220px]">
        {/* Document picker */}
        <Card className="shadow-card h-fit print:hidden">
          <CardContent className="p-3">
            <p className="text-xs font-semibold mb-2 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Documents</p>
            <ScrollArea className="max-h-[70vh]">
              <ul className="space-y-1">
                {DOCS.map(d => (
                  <li key={d.id}>
                    <button
                      onClick={() => setActiveId(d.id)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-secondary transition-colors ${activeId === d.id ? "bg-secondary font-semibold" : ""}`}
                    >
                      {d.title}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Main viewer */}
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="mb-3 print:hidden">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9"
                  placeholder="Search in this document…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:font-display
                prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base
                prose-table:text-xs prose-th:bg-secondary prose-th:p-2 prose-td:p-2
                prose-table:border prose-th:border prose-td:border prose-table:border-border
                prose-code:text-xs prose-pre:text-xs prose-pre:bg-secondary
                prose-pre:overflow-x-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {displayMd}
                </ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>

        {/* TOC */}
        <Card className="shadow-card h-fit sticky top-4 print:hidden">
          <CardContent className="p-3">
            <p className="text-xs font-semibold mb-2">On this page</p>
            <ScrollArea className="max-h-[70vh]">
              <ul className="space-y-1">
                {toc.map((h, i) => (
                  <li key={i} style={{ paddingLeft: (h.level - 2) * 10 }}>
                    <a href={`#${h.id}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                      {h.text}
                    </a>
                  </li>
                ))}
                {toc.length === 0 && <li className="text-xs text-muted-foreground">No sections</li>}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SystemDocumentation;
