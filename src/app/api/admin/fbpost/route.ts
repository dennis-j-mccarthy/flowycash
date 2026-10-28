import { getConnection, isConnected, hasInstagram } from "@/lib/meta/store";
import {
  publishPagePost,
  publishInstagramPost,
  MetaError,
} from "@/lib/meta/graph";
import { recordPostResults } from "@/lib/socialQueue";
import { isDatabaseConfigured } from "@/lib/prisma";
import { resolvePillarId } from "@/lib/pillarStore";

/*
  POST /api/admin/fbpost — the Social post maker behind /admin/social.

    { action: "config" }   is publishing available? what's connected?
    { action: "post", caption, imageUrl?, scheduledAt?, targets?, draftId?, pillarId? }
                           publish/schedule to Facebook and/or Instagram

  `draftId` is optional and backward-compatible: when a SocialDraft id is
  given (and DIRECT_DATABASE_URL is set) each network's result is written back onto
  the queue row — status scheduled/published/failed, metaPostId, scheduledAt,
  error. Without a draftId the results are still recorded as new rows so the
  Queue on /admin/social shows everything that went through here. With no
  database, recording is skipped and the response is unchanged.

  `pillarId` (src/lib/pillars.ts) is optional too: the maker's step 3. It is
  stamped on the recorded row(s) so the queue can show which brand message
  each post carried. Unknown ids are ignored, never rejected.

  This is the freeform composer — distinct from /api/fbpost, which publishes
  posts from the fixed monthly SOCIAL_CALENDAR. Both read a Page token from
  env; this one activates with META_PAGE_ID + META_PAGE_TOKEN (falling back to
  FB_PAGE_ID + FB_PAGE_TOKEN). Guarded by ADMIN_PASSCODE. No OAuth needed —
  see robert-castellino/docs/META_SETUP.md for the direct Page-token flow.
*/

export const runtime = "nodejs";
export const maxDuration = 120;

type Target = "facebook" | "instagram";

type PostResult = {
  target: Target;
  ok: boolean;
  id?: string;
  scheduled?: boolean;
  scheduledAt?: string | null;
  error?: string;
};

export async function POST(req: Request) {
  let body: {
    passcode?: string;
    action?: string;
    caption?: string;
    imageUrl?: string;
    scheduledAt?: string;
    targets?: Target[];
    draftId?: string;
    pillarId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    return Response.json(
      { error: "Server missing ADMIN_PASSCODE — publishing is disabled." },
      { status: 500 },
    );
  }
  if ((body.passcode || "") !== expected) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }

  const conn = getConnection();

  // Spec-shaped bodies ({caption, ...}) with no explicit action should post,
  // not fall through to the config probe.
  const action = body.action || (body.caption ? "post" : "config");

  /* ── Config: what's available, for the composer to render ─────── */
  if (action === "config") {
    return Response.json({
      connected: isConnected(conn),
      instagram: hasInstagram(conn),
      page: conn?.pageName ?? null,
      igUsername: conn?.igUsername ?? null,
    });
  }

  if (action !== "post") {
    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  if (!isConnected(conn)) {
    return Response.json(
      {
        error:
          "Facebook isn't connected. Set META_PAGE_ID + META_PAGE_TOKEN (or FB_PAGE_ID + FB_PAGE_TOKEN) in the environment.",
      },
      { status: 409 },
    );
  }

  const caption = (body.caption || "").trim();
  if (!caption) {
    return Response.json({ error: "Write a caption first." }, { status: 400 });
  }
  if (caption.length > 5000) {
    return Response.json({ error: "Caption is too long (max 5000)." }, { status: 400 });
  }

  const imageUrl = body.imageUrl?.trim() || undefined;
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    return Response.json(
      { error: "Image URL must be a public https:// link." },
      { status: 400 },
    );
  }
  const scheduledAt =
    body.scheduledAt && body.scheduledAt.trim() ? body.scheduledAt.trim() : undefined;

  // Default to Facebook; only allow Instagram when it's actually configured.
  const requested = Array.isArray(body.targets) && body.targets.length
    ? body.targets
    : (["facebook"] as Target[]);
  const targets = requested.filter(
    (t) => t === "facebook" || (t === "instagram" && hasInstagram(conn)),
  );
  if (!targets.length) {
    return Response.json(
      { error: "No valid target. Instagram isn't configured on this Page." },
      { status: 400 },
    );
  }

  const results: PostResult[] = [];

  // Each network is published independently so one failure never masks the
  // other's success (e.g. a good FB post isn't turned into a 502 by IG).
  for (const target of targets) {
    try {
      if (target === "facebook") {
        const r = await publishPagePost({
          pageId: conn.pageId,
          pageToken: conn.pageToken,
          message: caption,
          imageUrl,
          scheduledAt,
        });
        results.push({
          target,
          ok: true,
          id: r.id,
          scheduled: r.scheduled,
          scheduledAt: r.scheduledAt ?? null,
        });
      } else {
        // Instagram: image-only, and the Content Publishing API can't schedule.
        if (scheduledAt) {
          throw new MetaError(
            "Instagram can't schedule — publish now, or post to Facebook only.",
          );
        }
        if (!imageUrl) {
          throw new MetaError("Instagram needs a public image (JPEG) URL.");
        }
        const r = await publishInstagramPost({
          igUserId: conn.igUserId!,
          pageToken: conn.pageToken,
          caption,
          imageUrl,
        });
        results.push({ target, ok: true, id: r.id, scheduled: false, scheduledAt: null });
      }
    } catch (e: unknown) {
      const msg = e instanceof MetaError || e instanceof Error ? e.message : "Post failed.";
      results.push({ target, ok: false, error: msg });
    }
  }

  // Record onto the queue (no-op without a database; never throws).
  const draftId = body.draftId && String(body.draftId).trim() ? String(body.draftId).trim() : undefined;
  const pillarId = (await resolvePillarId(body.pillarId)) ?? undefined;
  if (isDatabaseConfigured()) {
    await recordPostResults({ draftId, caption, imageUrl: imageUrl ?? null, pillarId, results });
  }

  const anyOk = results.some((r) => r.ok);
  return Response.json(
    {
      ok: anyOk,
      page: conn.pageName,
      results,
      draftId: draftId ?? null,
      pillarId: pillarId ?? null,
      recorded: isDatabaseConfigured(),
    },
    { status: anyOk ? 200 : 502 },
  );
}
