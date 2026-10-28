/*
  Meta (Facebook / Instagram) Graph API configuration.

  This repo activates publishing the DIRECT way: a long-lived Page access
  token in the environment (META_PAGE_ID + META_PAGE_TOKEN). There is no
  interactive OAuth flow and no App ID / App Secret to set — see store.ts.
  Until the Page token is set, the Social tool reports "not connected" and
  nothing calls Meta; the rest of the site is unaffected.
*/

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
