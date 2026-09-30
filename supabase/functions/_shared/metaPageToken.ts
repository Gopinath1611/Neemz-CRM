const GRAPH = "https://graph.facebook.com/v19.0";

type MetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
  };
};

export type ResolvedMetaPageToken = {
  token: string;
  pageId: string;
  pageName: string | null;
  instagramBusinessAccountId: string | null;
  source: "page_lookup" | "me_accounts" | "business_pages" | "fallback";
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenParam(token: string): string {
  return encodeURIComponent(token);
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    throw new Error(body?.error?.message || `Meta API HTTP ${response.status}`);
  }
  return body;
}

function choosePage(pages: MetaPage[], configuredPageId: string, targetPageName: string): MetaPage | null {
  const validPages = pages.filter((page) => page?.id && page?.access_token);
  if (!validPages.length) return null;

  const normalizedTarget = normalizeName(targetPageName);
  return (
    validPages.find((page) => configuredPageId && page.id === configuredPageId) ||
    validPages.find((page) => page.name && normalizeName(page.name) === normalizedTarget) ||
    validPages.find((page) => page.name && normalizeName(page.name).includes(normalizedTarget)) ||
    null
  );
}

function toResolved(page: MetaPage, source: ResolvedMetaPageToken["source"]): ResolvedMetaPageToken | null {
  if (!page?.id || !page?.access_token) return null;
  return {
    token: page.access_token,
    pageId: page.id,
    pageName: page.name ?? null,
    instagramBusinessAccountId: page.instagram_business_account?.id ?? null,
    source,
  };
}

export async function resolveMetaPageAccessToken(
  rawToken: string,
  configuredPageId = "",
  targetPageName = Deno.env.get("META_PAGE_NAME") || "Dr Neemz Dentistry",
): Promise<ResolvedMetaPageToken> {
  const token = rawToken.trim();
  const pageId = configuredPageId.trim();
  const fields = "id,name,access_token,instagram_business_account{id,username}";
  const encodedFields = encodeURIComponent(fields);

  if (!token) throw new Error("META_PAGE_ACCESS_TOKEN is not configured in the backend.");

  if (pageId) {
    try {
      const page = await getJson(`${GRAPH}/${encodeURIComponent(pageId)}?fields=${encodedFields}&access_token=${tokenParam(token)}`);
      const resolved = toResolved(page, "page_lookup");
      if (resolved) return resolved;
    } catch (error) {
      console.warn("[metaPageToken] page lookup did not return a Page token:", error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const accounts = await getJson(`${GRAPH}/me/accounts?fields=${encodedFields}&limit=100&access_token=${tokenParam(token)}`);
    const matched = choosePage(Array.isArray(accounts?.data) ? accounts.data : [], pageId, targetPageName);
    const resolved = matched ? toResolved(matched, "me_accounts") : null;
    if (resolved) return resolved;
  } catch (error) {
    console.warn("[metaPageToken] /me/accounts did not return a Page token:", error instanceof Error ? error.message : String(error));
  }

  const businessId = Deno.env.get("META_BUSINESS_ID")?.trim();
  const businessIds = new Set<string>();
  if (businessId) businessIds.add(businessId);
  try {
    const businesses = await getJson(`${GRAPH}/me/businesses?fields=id,name&limit=100&access_token=${tokenParam(token)}`);
    for (const business of businesses?.data || []) {
      if (business?.id) businessIds.add(String(business.id));
    }
  } catch (error) {
    console.warn("[metaPageToken] business discovery did not return businesses:", error instanceof Error ? error.message : String(error));
  }

  for (const resolvedBusinessId of businessIds) {
    for (const edge of ["owned_pages", "client_pages"]) {
      try {
        const pages = await getJson(`${GRAPH}/${encodeURIComponent(resolvedBusinessId)}/${edge}?fields=${encodedFields}&limit=100&access_token=${tokenParam(token)}`);
        const matched = choosePage(Array.isArray(pages?.data) ? pages.data : [], pageId, targetPageName);
        const resolved = matched ? toResolved(matched, "business_pages") : null;
        if (resolved) return resolved;
      } catch (error) {
        console.warn(`[metaPageToken] business ${edge} did not return a Page token:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  if (!pageId) {
    throw new Error(`Could not resolve a Page Access Token for ${targetPageName}. Set META_PAGE_ID or assign the System User token to that Page.`);
  }

  return {
    token,
    pageId,
    pageName: null,
    instagramBusinessAccountId: null,
    source: "fallback",
  };
}

export function isPageAccessTokenError(message: string): boolean {
  return /\(#190\)|page access token|not a page access token|user access token|system user/i.test(message);
}

export function enrichPageAccessTokenError(message: string): string {
  if (!isPageAccessTokenError(message)) return message;
  return `${message} — the backend tried to resolve the Dr Neemz Dentistry Page Access Token from the configured Meta token. Make sure the System User is assigned to that Page with messaging permissions.`;
}