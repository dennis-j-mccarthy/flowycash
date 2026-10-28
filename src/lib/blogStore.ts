import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/*
  BlogPost + BlogSettings persistence. Every function assumes the caller has
  already checked isDatabaseConfigured() (the API routes do, and answer with a
  "database not connected" message otherwise). Dates are returned as ISO
  strings so the records can be sent straight to the client.
*/

export type BlogPostStatus = "draft" | "published";
export type BlogPostSource = "generated" | "manual";

export interface BlogPostRecord {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  heroImage: string | null;
  heroCredit: string | null;
  tags: string[];
  status: BlogPostStatus;
  source: BlogPostSource;
  /** Content pillar id (src/lib/pillars.ts) or null */
  pillarId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The list view: everything but the body. */
export type BlogPostSummary = Omit<BlogPostRecord, "body"> & { socialCount: number };

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  heroImage: string | null;
  heroCredit: string | null;
  tags: string[];
  status: string;
  source: string;
  pillarId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(r: Row): BlogPostRecord {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    body: r.body,
    heroImage: r.heroImage,
    heroCredit: r.heroCredit,
    tags: r.tags,
    status: r.status === "published" ? "published" : "draft",
    source: r.source === "manual" ? "manual" : "generated",
    pillarId: r.pillarId,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Make `base` unique among DB posts (ignoring `exceptId`): base, base-2, base-3… */
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) || "post";
  let candidate = root;
  for (let n = 2; n < 100; n++) {
    const clash = await prisma.blogPost.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/* ───────── reads ───────── */

export async function listBlogPosts(status?: BlogPostStatus): Promise<BlogPostSummary[]> {
  const rows = await prisma.blogPost.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ updatedAt: "desc" }],
    include: { _count: { select: { social: true } } },
    take: 500,
  });
  return rows.map((r) => {
    const rec = toRecord(r);
    const { body: _body, ...rest } = rec;
    void _body;
    return { ...rest, socialCount: r._count.social };
  });
}

export async function getBlogPost(id: string): Promise<BlogPostRecord | null> {
  const row = await prisma.blogPost.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

/** Published posts only — what the public site reads. */
export async function listPublishedBlogPosts(): Promise<BlogPostRecord[]> {
  const rows = await prisma.blogPost.findMany({
    where: { status: "published" },
    orderBy: [{ publishedAt: "desc" }],
    take: 500,
  });
  return rows.map(toRecord);
}

export async function getPublishedBlogPostBySlug(slug: string): Promise<BlogPostRecord | null> {
  const row = await prisma.blogPost.findFirst({ where: { slug, status: "published" } });
  return row ? toRecord(row) : null;
}

/* ───────── writes ───────── */

export interface NewBlogPost {
  title: string;
  excerpt?: string;
  body: string;
  heroImage?: string | null;
  heroCredit?: string | null;
  tags?: string[];
  slug?: string;
  source: BlogPostSource;
  /** Content pillar id; stored as given (validate with isPillarId first). */
  pillarId?: string | null;
}

export async function createBlogPost(input: NewBlogPost): Promise<BlogPostRecord> {
  const slug = await uniqueSlug(input.slug || input.title);
  const row = await prisma.blogPost.create({
    data: {
      slug,
      title: input.title.trim(),
      excerpt: (input.excerpt ?? "").trim(),
      body: input.body,
      heroImage: input.heroImage?.trim() || null,
      heroCredit: input.heroCredit?.trim() || null,
      tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
      source: input.source,
      status: "draft",
      pillarId: input.pillarId || null,
    },
  });
  return toRecord(row);
}

export interface BlogPostPatch {
  title?: string;
  excerpt?: string;
  body?: string;
  heroImage?: string | null;
  heroCredit?: string | null;
  tags?: string[];
  slug?: string;
  /** null clears the pillar; undefined leaves it alone */
  pillarId?: string | null;
}

export async function updateBlogPost(id: string, patch: BlogPostPatch): Promise<BlogPostRecord | null> {
  const data: Prisma.BlogPostUpdateInput = {};
  if (typeof patch.title === "string") data.title = patch.title.trim();
  if (typeof patch.excerpt === "string") data.excerpt = patch.excerpt.trim();
  if (typeof patch.body === "string") data.body = patch.body;
  if (patch.heroImage !== undefined) data.heroImage = patch.heroImage?.trim() || null;
  if (patch.heroCredit !== undefined) data.heroCredit = patch.heroCredit?.trim() || null;
  if (patch.pillarId !== undefined) data.pillarId = patch.pillarId || null;
  if (Array.isArray(patch.tags)) data.tags = patch.tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof patch.slug === "string" && patch.slug.trim()) {
    data.slug = await uniqueSlug(patch.slug, id);
  }
  try {
    const row = await prisma.blogPost.update({ where: { id }, data });
    return toRecord(row);
  } catch {
    return null;
  }
}

/**
 * Flip publish state. Publishing stamps publishedAt the first time only, so
 * re-publishing after an unpublish keeps the original date (and its sort
 * position on the blog).
 */
export async function setBlogPostStatus(
  id: string,
  status: BlogPostStatus,
): Promise<BlogPostRecord | null> {
  const current = await prisma.blogPost.findUnique({ where: { id } });
  if (!current) return null;
  const row = await prisma.blogPost.update({
    where: { id },
    data: {
      status,
      publishedAt:
        status === "published" ? (current.publishedAt ?? new Date()) : current.publishedAt,
    },
  });
  return toRecord(row);
}

export async function deleteBlogPost(id: string): Promise<boolean> {
  try {
    await prisma.blogPost.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/* ───────── tone ─────────
   The tone brief now lives on the BrandEssence singleton (migration 0005).
   Re-exported here so older imports keep working. */
export { getSavedTone, saveTone } from "@/lib/essenceStore";
