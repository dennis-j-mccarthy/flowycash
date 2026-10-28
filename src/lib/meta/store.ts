/*
  The single Meta connection — read from the environment only.

  built-with-ai has no database, so there's no stored OAuth token: activation
  is the DIRECT Page-token path. We read META_PAGE_ID + META_PAGE_TOKEN (and
  optional name / Instagram ids) from env and hand back a connection. As a
  convenience we also accept the FB_PAGE_ID + FB_PAGE_TOKEN pair the existing
  /api/fbpost route already uses, so one token activates both tools.
*/

export interface MetaConnection {
  pageId: string;
  pageName: string;
  pageToken: string;
  igUserId: string | null;
  igUsername: string | null;
}

/**
 * The env-only connection, or null when no Page token is configured.
 * META_* wins; FB_* (used by the legacy /api/fbpost route) is the fallback.
 */
export function getConnection(): MetaConnection | null {
  // Resolve the id+token as a unit so a stray single META_* var can't be
  // paired with the FB_* token (which would confuse the Graph API). META_*
  // wins only when BOTH are set; otherwise fall back to the FB_* pair.
  const hasMeta = !!process.env.META_PAGE_ID && !!process.env.META_PAGE_TOKEN;
  const pageId = hasMeta ? process.env.META_PAGE_ID : process.env.FB_PAGE_ID;
  const pageToken = hasMeta ? process.env.META_PAGE_TOKEN : process.env.FB_PAGE_TOKEN;
  if (!pageId || !pageToken) return null;
  return {
    pageId,
    pageName: process.env.META_PAGE_NAME ?? "Facebook Page",
    pageToken,
    igUserId: process.env.META_IG_USER_ID ?? null,
    igUsername: process.env.META_IG_USERNAME ?? null,
  };
}

/** True when there's a Page token ready to publish with. */
export function isConnected(c: MetaConnection | null): c is MetaConnection {
  return !!c && !!c.pageId && !!c.pageToken;
}

/** True when the Page has a linked Instagram Business account configured. */
export function hasInstagram(c: MetaConnection | null): boolean {
  return !!c && !!c.igUserId;
}
