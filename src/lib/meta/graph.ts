/*
  Thin Meta Graph API client: Facebook Page publishing + Instagram publishing.

  Every network call goes through graphGet / graphPost, which surface Meta's
  error payloads as thrown MetaErrors so routes can report them cleanly.
*/

import { GRAPH } from "./config";

export class MetaError extends Error {
  type?: string;
  code?: number;
  subcode?: number;
  fbtraceId?: string;
  constructor(message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "MetaError";
    if (extra) Object.assign(this, extra);
  }
}

type Json = Record<string, unknown>;

async function handle(res: Response): Promise<Json> {
  const text = await res.text();
  let body: Json = {};
  try {
    body = text ? (JSON.parse(text) as Json) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok || (body.error as Json | undefined)) {
    const err = (body.error as Json | undefined) || {};
    throw new MetaError(
      (err.message as string) || `Graph request failed (${res.status})`,
      {
        type: err.type as string,
        code: err.code as number,
        subcode: err.error_subcode as number,
        fbtraceId: err.fbtrace_id as string,
      },
    );
  }
  return body;
}

export async function graphGet(
  path: string,
  params: Record<string, string>,
): Promise<Json> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  return handle(res);
}

export async function graphPost(
  path: string,
  params: Record<string, string>,
): Promise<Json> {
  const body = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    body,
    cache: "no-store",
  });
  return handle(res);
}

export async function graphDelete(
  path: string,
  params: Record<string, string>,
): Promise<Json> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`, {
    method: "DELETE",
    cache: "no-store",
  });
  return handle(res);
}

/**
 * Delete a Page post (or a scheduled, not-yet-published one) by its Graph
 * id — the `post_id`/`id` returned from publishPagePost. Used to cancel a
 * scheduled post from the queue.
 */
export async function deletePagePost(postId: string, pageToken: string): Promise<void> {
  const r = await graphDelete(postId, { access_token: pageToken });
  if (r.success === false) throw new MetaError("Facebook refused to delete the post.");
}

// ───────── Scheduling ─────────

// Meta requires scheduled times 10 minutes–6 months out.
const MIN_LEAD_SEC = 10 * 60 + 30;
const MAX_LEAD_SEC = 180 * 24 * 60 * 60;

export function toScheduledUnix(iso: string): number {
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(ts)) throw new MetaError("Invalid schedule time.");
  const lead = ts - Math.floor(Date.now() / 1000);
  if (lead < MIN_LEAD_SEC)
    throw new MetaError("Schedule a time at least ~15 minutes from now.");
  if (lead > MAX_LEAD_SEC)
    throw new MetaError("Schedule a time within the next 6 months.");
  return ts;
}

// ───────── Facebook Page publishing ─────────

export interface PublishInput {
  pageId: string;
  pageToken: string;
  message: string;
  /** Publicly reachable image URL (Graph fetches it). Optional. */
  imageUrl?: string;
  /** ISO timestamp to schedule; omit to publish immediately. */
  scheduledAt?: string;
}

export interface PublishResult {
  id: string;
  scheduled: boolean;
  scheduledAt?: string;
}

/**
 * Publish or schedule a post on the Page. With an image it posts a photo
 * (caption = message); without, a text/feed post. Scheduling sets
 * published=false + scheduled_publish_time.
 */
export async function publishPagePost(
  input: PublishInput,
): Promise<PublishResult> {
  const { pageId, pageToken, message, imageUrl, scheduledAt } = input;
  const scheduling = !!scheduledAt;
  const base: Record<string, string> = { access_token: pageToken };

  if (scheduling) {
    base.published = "false";
    base.scheduled_publish_time = String(toScheduledUnix(scheduledAt!));
  }

  let result: Json;
  if (imageUrl) {
    result = await graphPost(`${pageId}/photos`, {
      ...base,
      url: imageUrl,
      caption: message,
    });
  } else {
    result = await graphPost(`${pageId}/feed`, { ...base, message });
  }

  const id = (result.post_id as string) || (result.id as string);
  return { id, scheduled: scheduling, scheduledAt };
}

// ───────── Instagram publishing ─────────

export interface InstagramInput {
  igUserId: string;
  /** The Page access token also authorizes the linked IG Business account. */
  pageToken: string;
  caption: string;
  /** IG publishing is image-only: a public JPEG URL is required. */
  imageUrl: string;
}

export interface InstagramResult {
  id: string;
}

const CONTAINER_POLL_MS = 1500;
const CONTAINER_MAX_TRIES = 20;

/**
 * Publish a single photo to Instagram via the Content Publishing API.
 *   1. POST /{ig-user-id}/media            → creation id (a container)
 *   2. poll /{creation-id}?fields=status_code until FINISHED
 *   3. POST /{ig-user-id}/media_publish     → the published media id
 *
 * Note: the Content Publishing API has no scheduling — callers must handle
 * that. IG also requires an image (no text-only posts) and a JPEG URL.
 */
export async function publishInstagramPost(
  input: InstagramInput,
): Promise<InstagramResult> {
  const { igUserId, pageToken, caption, imageUrl } = input;

  const created = await graphPost(`${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: pageToken,
  });
  const creationId = created.id as string;
  if (!creationId) throw new MetaError("Instagram didn't return a container id.");

  // The container must finish processing before it can be published.
  for (let i = 0; i < CONTAINER_MAX_TRIES; i++) {
    const status = await graphGet(creationId, {
      fields: "status_code",
      access_token: pageToken,
    });
    const code = status.status_code as string | undefined;
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED")
      throw new MetaError(`Instagram couldn't process the image (${code}).`);
    if (i === CONTAINER_MAX_TRIES - 1)
      throw new MetaError("Instagram image processing timed out — try again.");
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS));
  }

  const published = await graphPost(`${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: pageToken,
  });
  const id = published.id as string;
  if (!id) throw new MetaError("Instagram publish didn't return a media id.");
  return { id };
}
