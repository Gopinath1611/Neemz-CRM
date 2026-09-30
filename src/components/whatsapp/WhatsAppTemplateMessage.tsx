/**
 * Renders a WhatsApp template message the way the recipient actually saw it:
 * header (text or media), body with the sent variable values, footer and the
 * template's buttons. Falls back to the raw stored text when the template
 * definition cannot be resolved.
 */
import { ExternalLink, MapPin, Phone, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fillTemplateText,
  type SentTemplateInfo,
  type TemplateButton,
  type TemplateDef,
} from "@/lib/whatsappTemplatePreview";

interface Props {
  info: SentTemplateInfo;
  def?: TemplateDef;
  fallbackText?: string;
  className?: string;
  compact?: boolean;
}

const iconFor = (b: TemplateButton) => {
  const type = String(b?.type || "").toUpperCase();
  const text = String(b?.text || "").toLowerCase();
  if (type === "PHONE_NUMBER") return <Phone size={12} />;
  if (type === "URL") return text.includes("location") || text.includes("map") ? <MapPin size={12} /> : <ExternalLink size={12} />;
  return <Reply size={12} />;
};

export const WhatsAppTemplateMessage = ({ info, def, fallbackText, className, compact }: Props) => {
  if (!def || !String(def.body || "").trim()) {
    return <p className={cn("whitespace-pre-wrap break-words", className)}>{fallbackText || `[template] ${info.name}`}</p>;
  }

  const headerFormat = String(def.header_format || "").toUpperCase();
  const headerText = def.header_text ? fillTemplateText(def.header_text, info.headerParams) : "";
  const mediaLink = info.headerMediaLink || def.header_example || "";
  const body = fillTemplateText(def.body, info.bodyParams);
  const footer = def.footer_text ? String(def.footer_text) : "";
  const buttons = Array.isArray(def.buttons) ? def.buttons : [];

  let urlIdx = 0;
  const hrefFor = (b: TemplateButton): string | null => {
    const type = String(b?.type || "").toUpperCase();
    if (type === "PHONE_NUMBER") {
      const p = String(b?.phone_number || "").replace(/\s+/g, "");
      return p ? `tel:${p}` : null;
    }
    if (type === "URL") {
      const raw = String(b?.url || "");
      if (!raw) return null;
      if (raw.includes("{{1}}")) {
        const param = info.buttonUrlParams[urlIdx++] || "";
        return param ? raw.replace("{{1}}", param) : null;
      }
      return raw;
    }
    return null;
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {headerFormat === "IMAGE" && mediaLink ? (
        <img src={mediaLink} alt={`${info.name} header`} loading="lazy" className="rounded max-h-40 w-full object-cover" />
      ) : headerFormat === "VIDEO" && mediaLink ? (
        <video src={mediaLink} controls className="rounded max-h-40 w-full" />
      ) : headerFormat === "DOCUMENT" && mediaLink ? (
        <a href={mediaLink} target="_blank" rel="noopener noreferrer" className="underline block text-[11px]">
          Open attached document
        </a>
      ) : null}

      {headerText && <p className="font-semibold whitespace-pre-wrap break-words">{headerText}</p>}

      <p className="whitespace-pre-wrap break-words">{body}</p>

      {footer && <p className="text-[10px] opacity-60 whitespace-pre-wrap break-words">{footer}</p>}

      {buttons.length > 0 && (
        <div className="space-y-1 border-t border-current/15 pt-1.5">
          {buttons.map((b, i) => {
            const href = hrefFor(b);
            const label = String(b?.text || "Button");
            const cls = "flex items-center justify-center gap-1.5 w-full rounded px-2 py-1 text-[11px] font-medium bg-foreground/5 hover:bg-foreground/10 transition-colors no-underline";
            return href ? (
              <a
                key={i}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className={cls}
              >
                {iconFor(b)}<span className="truncate">{label}</span>
              </a>
            ) : (
              <span key={i} className={cn(cls, "opacity-60 cursor-not-allowed")} title="Action unavailable">
                {iconFor(b)}<span className="truncate">{label}</span>
              </span>
            );
          })}
        </div>
      )}

      {!compact && (
        <p className="text-[9px] uppercase tracking-wide opacity-50">Template · {info.name}</p>
      )}
    </div>
  );
};

export default WhatsAppTemplateMessage;
