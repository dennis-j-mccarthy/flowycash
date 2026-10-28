import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { deletePagePost, MetaError } from "@/lib/meta/graph";
import { isSocialPlatform, type SocialPlatform } from "@/lib/socialPlatforms";

/*
  SocialDraft as a publishing queue.

  The composer posts through /api/admin/fbpost; this module writes each
  network's result back onto a SocialDraft row (status, metaPostId,
  scheduledAt, error) so /admin/social can show what's queued and what went
  out. With no DB everything here is a silent no-op — publishing itself never
  depends on it.
*/

export type SocialDraftStatus = "draft" | "scheduled" | "published" | "failed";

export interface SocialDraftRecord {
  id: string;
  blogPostId: string | null;
  blogTitle: string | null;
  blogSlug: string | null;
  platform: SocialPlatform;
  caption: string;
  imageUrl: string | null;
  status: SocialDraftStatus;
  /** Content pillar id (src/lib/pillars.ts) or null */
  pillarId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  metaPostId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  blogPostId: string | null;
  platform: string;
  caption: string;
  imageUrl: string | null;
  status: string;
  pillarId: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  metaPostId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  blogPost?: { title: string; slug: string } | null;
};

const STATUSES: SocialDraftStatus[] = ["draft", "scheduled", "published", "failed"];

export function isDraftStatus(v: unknown): v is SocialDraftStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

function toRecord(r: Row): SocialDraftRecord {
  return {
    id: r.id,
    blogPostId: r.blogPostId,
    blogTitle: r.blogPost?.title ?? null,
    blogSlug: r.blogPost?.slug ?? null,
    platform: isSocialPlatform(r.platform) ? r.platform : "facebook",
    caption: r.caption,
    imageUrl: r.imageUrl,
    status: isDraftStatus(r.status) ? r.status : "draft",
    pillarId: r.pillarId,
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    metaPostId: r.metaPostId,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const WITH_POST = { blogPost: { select: { title: true, slug: true } } } as const;

/* ───────── reads ───────── */

export async function listSocialDrafts(filter: {
  status?: SocialDraftStatus;
  platform?: SocialPlatform;
  blogPostId?: string;
}): Promise<SocialDraftRecord[]> {
  const rows = await prisma.socialDraft.findMany({
    where: {
      status: filter.status,
      platform: filter.platform,
      blogPostId: filter.blogPostId,
    },
    include: WITH_POST,
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
  });
  return rows.map(toRecord);
}

/** Scheduled (soonest first) then published (latest first). */
export async function listQueue(): Promise<SocialDraftRecord[]> {
  const scheduled = await prisma.socialDraft.findMany({
    where: { status: "scheduled" },
    include: WITH_POST,
    orderBy: [{ scheduledAt: "asc" }],
    take: 100,
  });
  const published = await prisma.socialDraft.findMany({
    where: { status: "published" },
    include: WITH_POST,
    orderBy: [{ publishedAt: "desc" }],
    take: 100,
  });
  return [...scheduled, ...published].map(toRecord);
}

export async function getSocialDraft(id: string): Promise<SocialDraftRecord | null> {
  const row = await prisma.socialDraft.findUnique({ where: { id }, include: WITH_POST });
  return row ? toRecord(row) : null;
}

/* ───────── writes ───────── */

export async function updateSocialDraft(
  id: string,
  patch: { caption?: string; imageUrl?: string | null; pillarId?: string | null },
): Promise<SocialDraftRecord | null> {
  try {
    const row = await prisma.socialDraft.update({
      where: { id },
      data: {
        ...(typeof patch.caption === "string" ? { caption: patch.caption } : {}),
        ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl?.trim() || null } : {}),
        ...(patch.pillarId !== undefined ? { pillarId: patch.pillarId || null } : {}),
      },
      include: WITH_POST,
    });
    return toRecord(row);
  } catch {
    return null;
  }
}

export async function deleteSocialDraft(id: string): Promise<boolean> {
  try {
    await prisma.socialDraft.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/* ───────── recording publish results ───────── */

export interface NetworkResult {
  target: "facebook" | "instagram";
  ok: boolean;
  id?: string;
  scheduled?: boolean;
  scheduledAt?: string | null;
  error?: string;
}

function outcome(r: NetworkResult) {
  if (!r.ok) {
    return { status: "failed", error: r.error ?? "Post failed.", metaPostId: null };
  }
  return {
    status: r.scheduled ? "scheduled" : "published",
    error: null,
    metaPostId: r.id ?? null,
    scheduledAt: r.scheduled && r.scheduledAt ? new Date(r.scheduledAt) : null,
    publishedAt: r.scheduled ? null : new Date(),
  };
}

/**
 * Write the composer's per-network results back to the queue.
 *
 *  - With a draftId: the draft takes the result for its own platform. A
 *    result for another network goes to the sibling row (same blog post,
 *    that platform) when there is one, else a new standalone row. If the
 *    draft's own platform wasn't posted to at all (e.g. a LinkedIn draft
 *    pushed to Facebook) and there's exactly one result, the draft takes it.
 *  - Without a draftId: one new row per network so the Queue is complete.
 *
 * Best-effort: never throws, never blocks the publish response.
 */
export async function recordPostResults(input: {
  draftId?: string;
  caption: string;
  imageUrl: string | null;
  /** Pillar chosen in the maker; omitted = leave whatever the row has */
  pillarId?: string;
  results: NetworkResult[];
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    const draft = input.draftId
      ? await prisma.socialDraft.findUnique({ where: { id: input.draftId } })
      : null;

    for (const r of input.results) {
      const data = {
        ...outcome(r),
        caption: input.caption,
        imageUrl: input.imageUrl,
        ...(input.pillarId ? { pillarId: input.pillarId } : {}),
      };
      const ownsResult =
        draft &&
        (draft.platform === r.target ||
          (input.results.length === 1 &&
            !input.results.some((x) => x.target === draft.platform)));

      if (draft && ownsResult) {
        await prisma.socialDraft.update({ where: { id: draft.id }, data });
        continue;
      }
      if (draft?.blogPostId) {
        await prisma.socialDraft.upsert({
          where: { blogPostId_platform: { blogPostId: draft.blogPostId, platform: r.target } },
          create: { blogPostId: draft.blogPostId, platform: r.target, ...data },
          update: data,
        });
        continue;
      }
      await prisma.socialDraft.create({ data: { platform: r.target, ...data } });
    }
  } catch (err) {
    console.error("[social-queue] failed to record results:", err);
  }
}

/* ───────── cancel a scheduled post ───────── */

/**
 * Delete the scheduled Graph object and return the row to "draft" so it can
 * be re-scheduled. If Meta says the object is already gone, the row is reset
 * anyway. Any other Graph error is returned (row untouched).
 */
export async function cancelScheduled(
  id: string,
  pageToken: string,
): Promise<{ ok: true; draft: SocialDraftRecord } | { ok: false; error: string; status: number }> {
  const row = await prisma.socialDraft.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Draft not found.", status: 404 };
  if (row.status !== "scheduled" || !row.metaPostId) {
    return { ok: false, error: "Only scheduled posts can be cancelled.", status: 409 };
  }
  try {
    await deletePagePost(row.metaPostId, pageToken);
  } catch (e) {
    // Graph code 100 = unknown object (already deleted / published). Reset anyway.
    const gone = e instanceof MetaError && e.code === 100;
    if (!gone) {
      const msg = e instanceof Error ? e.message : "Couldn't cancel on Facebook.";
      return { ok: false, error: msg, status: 502 };
    }
  }
  const updated = await prisma.socialDraft.update({
    where: { id },
    data: { status: "draft", metaPostId: null, scheduledAt: null, publishedAt: null, error: null },
    include: WITH_POST,
  });
  return { ok: true, draft: toRecord(updated) };
}
