import { revalidatePath } from "next/cache";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import type { BlogPostRecord } from "@/lib/blogStore";
import {
  generateSocialDrafts,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/socialDrafts";

/*
  Side effects of publishing a BlogPost — the parity piece with
  robert-castellino's publish-hooks.ts.

    revalidateBlog()      cheap cache invalidation; call inline in the route so
                          the new post, index and sitemap are live immediately.
    onBlogPostPublished() slow, best-effort work (AI social drafts). Run it via
                          `after()` so it never blocks the publish response and
                          never throws into the caller.

  Idempotent: drafts are keyed by (blogPostId, platform). Re-publishing only
  fills in platforms that don't have a row yet; rows that were already
  scheduled/published through Meta are never touched. `force` regenerates
  rows that are still plain drafts (the "Regenerate social drafts" button).
*/

export function revalidateBlog(slug: string): void {
  try {
    revalidatePath("/blog");
    revalidatePath(`/blog/${slug}`);
    revalidatePath("/sitemap.xml");
    revalidatePath("/");
  } catch (err) {
    console.error("[publish] revalidate failed:", err);
  }
}

export interface EnsureDraftsResult {
  created: number;
  updated: number;
  skipped: number;
  generated: boolean;
}

export async function ensureSocialDrafts(
  post: BlogPostRecord,
  opts: { force?: boolean } = {},
): Promise<EnsureDraftsResult> {
  const result: EnsureDraftsResult = { created: 0, updated: 0, skipped: 0, generated: false };
  if (!isDatabaseConfigured()) return result;

  const existing = await prisma.socialDraft.findMany({
    where: { blogPostId: post.id },
    select: { id: true, platform: true, status: true },
  });
  const byPlatform = new Map(existing.map((d) => [d.platform as SocialPlatform, d]));

  const todo = SOCIAL_PLATFORMS.filter((p) => {
    const row = byPlatform.get(p);
    if (!row) return true;
    return !!opts.force && row.status === "draft";
  });
  result.skipped = SOCIAL_PLATFORMS.length - todo.length;
  if (!todo.length) return result;

  // Voice comes from the Essence (src/lib/brandContext.ts); the post's
  // pillar steers the angle.
  const { drafts, generated } = await generateSocialDrafts(
    {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body,
      heroImage: post.heroImage,
    },
    post.pillarId,
  );
  result.generated = generated;

  for (const d of drafts) {
    if (!todo.includes(d.platform)) continue;
    const row = byPlatform.get(d.platform);
    if (row) {
      await prisma.socialDraft.update({
        where: { id: row.id },
        data: { caption: d.caption, imageUrl: d.imageUrl, error: null, pillarId: post.pillarId },
      });
      result.updated++;
    } else {
      await prisma.socialDraft.create({
        data: {
          blogPostId: post.id,
          platform: d.platform,
          caption: d.caption,
          imageUrl: d.imageUrl,
          status: "draft",
          // Drafts inherit the post's pillar so the maker pre-selects it.
          pillarId: post.pillarId,
        },
      });
      result.created++;
    }
  }
  return result;
}

/** Fire-and-forget work for a newly published post. Wrap in `after()`. */
export async function onBlogPostPublished(post: BlogPostRecord): Promise<void> {
  try {
    const r = await ensureSocialDrafts(post);
    console.log(
      `[publish] social drafts for ${post.slug}: +${r.created} ~${r.updated} =${r.skipped} (${r.generated ? "ai" : "fallback"})`,
    );
  } catch (err) {
    console.error("[publish] social draft generation failed:", err);
  }
}
