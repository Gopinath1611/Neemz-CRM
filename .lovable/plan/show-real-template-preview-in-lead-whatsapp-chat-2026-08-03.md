# Show real template preview in lead WhatsApp chat

Right now the lead's Call Logs → WhatsApp chat shows only `[template] google_review_request`, because that literal string is what gets saved as the message text when a workflow sends a template. The actual template text is never rendered.

## What will change

In the lead chat bubble (and the same bubbles in the WhatsApp Inbox), a template message will render like the real WhatsApp message:

- Header (text header, or the image/document thumbnail/link when the template has a media header)
- Body with `{{1}}`, `{{2}}`… replaced by the values that were actually sent (e.g. the lead's name)
- Footer text
- Buttons shown as chips (Call / URL / Quick reply)
- A small "Template · google_review_request" caption so staff still know which template it was

Nothing about sending, workflow logic, counters, or delivery status changes.

## How it works

1. **Template definition source** — read the template's components (header/body/footer/buttons) from `whatsapp_templates`. Several rows currently have an empty `body`, so on first render the app falls back to the existing `whatsapp-list-templates` edge function (which already returns `components` from Meta) and caches the result in memory for the session. No new tables.

2. **Variable values** — each outbound template message already stores what was sent in `whatsapp_messages.payload.request.template.components` (verified: body parameters with the lead's name are present). The renderer substitutes those parameters positionally into `{{n}}` placeholders.

3. **Rendering component** — add a small shared `WhatsAppTemplateMessage` component used by `LeadWhatsAppChat.tsx` and the WhatsApp Inbox message list. If the template definition can't be resolved (deleted template, no Meta access), it falls back to today's `[template] name` text so nothing breaks.

4. **Going forward (backend, optional but included)** — `workflow-execute` and `whatsapp-send-message` will also persist the rendered body text alongside the existing payload (`text` becomes the filled body instead of `[template] name`), so future messages read correctly even without a template lookup. Old messages still render via step 1–2.

## Technical notes

- Files touched: new `src/components/whatsapp/WhatsAppTemplateMessage.tsx`; `src/components/pipeline/LeadWhatsAppChat.tsx`; `src/pages/WhatsAppAPI.tsx` (inbox bubble rendering); `supabase/functions/workflow-execute/index.ts` and `supabase/functions/whatsapp-send-message/index.ts` for the stored text only.
- No database migration, no RLS change, no workflow/trigger/action change.
- `whatsapp_templates` is already readable by authenticated users, so the lookup needs no new policy.
