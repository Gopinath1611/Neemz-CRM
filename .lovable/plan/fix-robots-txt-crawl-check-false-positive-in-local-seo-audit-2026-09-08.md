# Fix robots.txt crawl-check false positive in Local SEO audit

## Problem
The "robots.txt allows crawling" check on the Local SEO page scores 0% even though https://drneemz.com/robots.txt correctly allows Googlebot.

Root cause: in `supabase/functions/local-seo-sync/index.ts`, the check uses the regex `/^\s*Disallow:\s*\/\s*$/im` against the entire robots.txt file. The live file contains `Disallow: /` only inside specific AI-crawler blocks such as `User-agent: Google-Extended`, `User-agent: GPTBot`, etc. The regex matches those lines and incorrectly treats the site as blocked for search crawlers.

## Fix
Update the robots.txt parser in the `runOnPageChecks` function to evaluate only the `User-agent: *` block(s) when deciding whether crawling is allowed:

1. Split the robots.txt content into user-agent blocks.
2. Collect all rules that apply to `User-agent: *`.
3. Check whether any of those global rules is a blanket `Disallow: /`.
4. If no global blanket disallow exists, mark the check as passed (100%).
5. Keep existing fetch/error handling and the sitemap check unchanged.

This correctly handles the current file, which has:
- `User-agent: *` → `Allow: /` (Cloudflare managed content block)
- `User-agent: *` → specific path disallows, but no blanket `Disallow: /`
- Separate AI-only blocks with `Disallow: /`, which do not affect search crawling

## Files to change
- `supabase/functions/local-seo-sync/index.ts` (lines 239-251)

## Verification
- Deploy the updated `local-seo-sync` edge function.
- Open the Local SEO page and trigger a refresh (or wait for the daily sync).
- Confirm the "robots.txt allows crawling" check shows 100% instead of 0%.
- Confirm the AI suggestions section no longer flags robots.txt as a critical blocker.

## Scope boundary
- No changes to the actual robots.txt on drneemz.com.
- No changes to the AI-crawler blocks (they remain intentional).
- No changes to WhatsApp, Pipeline, Expenses, or other modules.
