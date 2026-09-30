import { Phone, ExternalLink, Reply, ImageIcon } from "lucide-react";

type TemplateButton = {
  type: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

type TemplateLike = {
  name?: string;
  category?: string;
  language?: string;
  body?: string;
  header_format?: string;
  header_text?: string;
  header_example?: string;
  footer_text?: string;
  buttons?: TemplateButton[];
} | null | undefined;

interface Props {
  template: TemplateLike;
  paramValues: string[];
}

/**
 * Read-only Meta-style WhatsApp template preview.
 * Renders header (image/text), body with resolved {{n}} variables,
 * footer and buttons in a chat bubble.
 */
export const WhatsAppTemplatePreview = ({ template, paramValues }: Props) => {
  const t = template || undefined;
  const headerFormat = String(t?.header_format || "").toUpperCase();
  const buttons = Array.isArray(t?.buttons) ? t!.buttons! : [];

  const resolve = (text: string) =>
    (text || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const idx = Number(n) - 1;
      const v = paramValues[idx];
      return v && v.trim() ? v : `{{${n}}}`;
    });

  const bodyResolved = resolve(t?.body || "");
  const headerTextResolved = resolve(t?.header_text || "");
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-xl border bg-[#e5ddd5] p-4 shadow-card lg:sticky lg:top-4 h-fit">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview</span>
        {t?.category && <span className="text-[10px] rounded-full bg-white/70 px-2 py-0.5 text-muted-foreground">{t.category}</span>}
      </div>

      {!t ? (
        <div className="rounded-lg bg-white/70 p-6 text-center text-xs text-muted-foreground">
          Select a template to preview it as your customer will see it on WhatsApp.
        </div>
      ) : (
        <div className="relative max-w-full">
          <div className="relative rounded-lg rounded-tl-none bg-white p-2 shadow-sm">
            {/* Header */}
            {headerFormat === "IMAGE" && (
              <div className="mb-2 aspect-[16/9] w-full overflow-hidden rounded-md bg-muted flex items-center justify-center">
                {t?.header_example ? (
                  <img
                    src={t.header_example}
                    alt="Template header"
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <ImageIcon size={28} />
                    <span className="mt-1 text-[10px]">Header image</span>
                  </div>
                )}
              </div>
            )}
            {headerFormat === "VIDEO" && (
              <div className="mb-2 aspect-video w-full rounded-md bg-black/80 text-white flex items-center justify-center text-xs">
                Video header
              </div>
            )}
            {headerFormat === "DOCUMENT" && (
              <div className="mb-2 rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                📄 Document header
              </div>
            )}
            {headerFormat === "TEXT" && headerTextResolved && (
              <div className="mb-1 px-1 text-sm font-semibold text-foreground">{headerTextResolved}</div>
            )}

            {/* Body */}
            <div className="whitespace-pre-wrap break-words px-1 text-sm text-foreground">
              {bodyResolved || <span className="text-muted-foreground">No body content.</span>}
            </div>

            {/* Footer */}
            {t?.footer_text && (
              <div className="mt-1 px-1 text-[11px] text-muted-foreground">{t.footer_text}</div>
            )}

            <div className="mt-1 flex justify-end px-1 text-[10px] text-muted-foreground">{now}</div>

            {/* Tail */}
            <span className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 bg-white" aria-hidden />
          </div>

          {/* Buttons */}
          {buttons.length > 0 && (
            <div className="mt-1 space-y-1">
              {buttons.map((b, i) => {
                const type = String(b.type || "").toUpperCase();
                const Icon = type === "PHONE_NUMBER" ? Phone : type === "URL" ? ExternalLink : Reply;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-medium text-[#00a5f4] shadow-sm"
                  >
                    <Icon size={14} />
                    <span>{b.text || (type === "PHONE_NUMBER" ? b.phone_number : type === "URL" ? "Open link" : "Reply")}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground">
        This is a read-only preview based on your approved Meta template.
      </p>
    </div>
  );
};

export default WhatsAppTemplatePreview;
