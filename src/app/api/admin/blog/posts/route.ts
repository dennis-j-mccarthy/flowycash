import { passcodeError, readJson } from "@/lib/adminPasscode";
import { createBlogPost, listBlogPosts } from "@/lib/blogStore";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";
import { resolvePillarId } from "@/lib/pillarStore";

/*
  /api/admin/blog/posts — BlogPost drafts stored in the database.

    GET  ?status=draft|published  (header x-admin-passcode)
         → { items, db }            items: [] + db:false when no database
    POST { passcode, title, body, excerpt?, heroImage?, heroCredit?, tags?, slug?, pillarId? }
         → { post }                 a hand-written ("manual") draft

  Editing / publishing a single post lives at /api/admin/blog/posts/[id].
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ items: [], db: false, message: DB_MISSING_MESSAGE });
  }
  const status = new URL(req.url).searchParams.get("status");
  try {
    const items = await listBlogPosts(
      status === "draft" || status === "published" ? status : undefined,
    );
    return Response.json({ items, db: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await readJson<{
    passcode?: string;
    title?: string;
    body?: string;
    excerpt?: string;
    heroImage?: string;
    heroCredit?: string;
    tags?: string[];
    slug?: string;
    pillarId?: string | null;
  }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
  }
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "");
  if (!title) return Response.json({ error: "Give the post a title." }, { status: 400 });
  try {
    const post = await createBlogPost({
      title,
      body: text,
      excerpt: String(body.excerpt ?? ""),
      heroImage: body.heroImage ?? null,
      heroCredit: body.heroCredit ?? null,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      slug: body.slug ? String(body.slug) : undefined,
      source: "manual",
      pillarId: await resolvePillarId(body.pillarId),
    });
    return Response.json({ post });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
