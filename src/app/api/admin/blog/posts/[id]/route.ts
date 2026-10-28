import { after } from "next/server";
import { passcodeError, readJson } from "@/lib/adminPasscode";
import {
  deleteBlogPost,
  getBlogPost,
  setBlogPostStatus,
  updateBlogPost,
} from "@/lib/blogStore";
import { ensureSocialDrafts, onBlogPostPublished, revalidateBlog } from "@/lib/publishHooks";
import { listSocialDrafts } from "@/lib/socialQueue";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";
import { resolvePillarId } from "@/lib/pillarStore";

/*
  /api/admin/blog/posts/[id] — one BlogPost.

    GET    (header x-admin-passcode)   → { post, social }   social = its drafts
    PATCH  { passcode, ...fields }     edit title/slug/excerpt/body/heroImage/heroCredit/tags/pillarId
                                       (pillarId: a src/lib/pillars.ts id, or null to clear)
    PATCH  { passcode, action }        "publish" | "unpublish" | "regenerate-social"
    DELETE { passcode }                removes the post (its drafts' blogPostId
                                       is nulled, so queue history survives)

  Publishing revalidates the public blog inline and kicks off social-draft
  generation via after(), so the response doesn't wait on the model.
*/

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function noDb() {
  return Response.json({ error: DB_MISSING_MESSAGE, db: false }, { status: 409 });
}

export async function GET(req: Request, { params }: Ctx) {
  const denied = passcodeError(req);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;
  try {
    const post = await getBlogPost(id);
    if (!post) return Response.json({ error: "Post not found." }, { status: 404 });
    const social = await listSocialDrafts({ blogPostId: id });
    return Response.json({ post, social });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await readJson<{
    passcode?: string;
    action?: string;
    title?: string;
    slug?: string;
    excerpt?: string;
    body?: string;
    heroImage?: string | null;
    heroCredit?: string | null;
    tags?: string[];
    pillarId?: string | null;
  }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;

  try {
    const existing = await getBlogPost(id);
    if (!existing) return Response.json({ error: "Post not found." }, { status: 404 });

    if (body.action === "publish") {
      if (!existing.body.trim()) {
        return Response.json({ error: "The post has no body yet." }, { status: 400 });
      }
      const post = await setBlogPostStatus(id, "published");
      if (!post) return Response.json({ error: "Post not found." }, { status: 404 });
      revalidateBlog(post.slug);
      if (existing.slug !== post.slug) revalidateBlog(existing.slug);
      // Generate the social drafts inline: Vercel does not reliably keep the
      // function alive for after() work, which left publishes with no drafts.
      // Best-effort — a model/DB hiccup must never fail the publish itself.
      let social: Awaited<ReturnType<typeof listSocialDrafts>> = [];
      let socialError: string | null = null;
      try {
        await ensureSocialDrafts(post);
        social = await listSocialDrafts({ blogPostId: id });
      } catch (err) {
        socialError = err instanceof Error ? err.message : "social draft generation failed";
        console.error("[publish] social draft generation failed:", err);
        after(() => onBlogPostPublished(post));
      }
      return Response.json({ post, published: true, social, socialError });
    }

    if (body.action === "unpublish") {
      const post = await setBlogPostStatus(id, "draft");
      if (!post) return Response.json({ error: "Post not found." }, { status: 404 });
      revalidateBlog(post.slug);
      return Response.json({ post, published: false });
    }

    if (body.action === "regenerate-social") {
      const result = await ensureSocialDrafts(existing, { force: true });
      const social = await listSocialDrafts({ blogPostId: id });
      return Response.json({ post: existing, social, result });
    }

    if (body.action) {
      return Response.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }

    const post = await updateBlogPost(id, {
      title: body.title,
      slug: body.slug,
      excerpt: body.excerpt,
      body: body.body,
      heroImage: body.heroImage,
      heroCredit: body.heroCredit,
      tags: body.tags,
      // undefined = untouched; null or "" = clear; unknown ids are dropped
      pillarId: body.pillarId === undefined ? undefined : await resolvePillarId(body.pillarId),
    });
    if (!post) return Response.json({ error: "Post not found." }, { status: 404 });
    if (post.status === "published") {
      revalidateBlog(post.slug);
      if (existing.slug !== post.slug) revalidateBlog(existing.slug);
    }
    return Response.json({ post });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const body = await readJson<{ passcode?: string }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  const denied = passcodeError(req, body);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return noDb();
  const { id } = await params;
  try {
    const existing = await getBlogPost(id);
    if (!existing) return Response.json({ error: "Post not found." }, { status: 404 });
    const ok = await deleteBlogPost(id);
    if (!ok) return Response.json({ error: "Delete failed." }, { status: 500 });
    if (existing.status === "published") revalidateBlog(existing.slug);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
