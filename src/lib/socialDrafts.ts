import Anthropic from "@anthropic-ai/sdk";
import { reportAiFailure } from "@/lib/alert";
import { brandSystemPrompt, loadBrandContext } from "@/lib/brandContext";
import { site } from "@/lib/site";
import {
  CAPTION_LIMITS,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/socialPlatforms";

/*
  Turn a blog post into platform-specific social captions. SERVER ONLY —
  client components import the constants from socialPlatforms.ts instead.

  Four platforms, each with its own length budget and conventions. The AI
  writer (Claude, same client pattern as /api/reality) is the primary path;
  `fallbackSocialDrafts` is a deterministic no-network version used when the
  API key is missing or the call fails, so publishing a post always yields a
  reviewable set of drafts. Everything here is a DRAFT for the operator —
  nothing is auto-posted.
*/

export {
  CAPTION_LIMITS,
  PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  isSocialPlatform,
  type SocialPlatform,
} from "@/lib/socialPlatforms";

export interface SocialSourcePost {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  heroImage: string | null;
}

export interface GeneratedSocialDraft {
  platform: SocialPlatform;
  caption: string;
  imageUrl: string | null;
}

export function blogPostUrl(slug: string): string {
  return `${site.url}/blog/${slug}`;
}

/** Meta needs a public https URL; site-relative hero paths get the www host. */
export function absoluteImageUrl(image: string | null | undefined): string | null {
  const v = (image ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `${site.url}${v.startsWith("/") ? "" : "/"}${v}`;
}

export function clamp(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function plainExcerpt(post: SocialSourcePost): string {
  if (post.excerpt.trim()) return post.excerpt.trim();
  // First real paragraph of the body, markdown stripped.
  const para = post.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#"));
  return (para ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .trim();
}

/** Deterministic drafts — no network. */
export function fallbackSocialDrafts(post: SocialSourcePost): GeneratedSocialDraft[] {
  const link = blogPostUrl(post.slug);
  const body = plainExcerpt(post);
  const image = absoluteImageUrl(post.heroImage);
  const tags = "#FlowyCash #CashflowCalendar #KnowYourMoney";
  return [
    {
      platform: "facebook",
      caption: clamp(`${post.title}\n\n${body}\n\nRead the full post: ${link}`, CAPTION_LIMITS.facebook),
      imageUrl: image,
    },
    {
      platform: "instagram",
      caption: clamp(`${post.title}\n\n${body}\n\nFull post — link in bio.\n\n${tags}`, CAPTION_LIMITS.instagram),
      imageUrl: image,
    },
    {
      platform: "linkedin",
      caption: clamp(`${post.title}\n\n${body}\n\n${link}`, CAPTION_LIMITS.linkedin),
      imageUrl: image,
    },
    {
      platform: "x",
      // Leave room for the link (X counts any URL as 23 characters).
      caption: clamp(`${clamp(`${post.title} — ${body}`, CAPTION_LIMITS.x - 25)} ${link}`, CAPTION_LIMITS.x + 60),
      imageUrl: image,
    },
  ];
}

const MODEL = "claude-opus-4-8";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    facebook: {
      type: "string",
      description:
        "Facebook Page post: 2-4 short paragraphs, conversational, ends with the post link on its own line. Under 1200 characters.",
    },
    instagram: {
      type: "string",
      description:
        "Instagram caption: a strong first line (shown before 'more'), 2-3 short paragraphs, then 5-8 relevant hashtags on the last line. Do NOT include the URL — say 'link in bio'. Under 1500 characters.",
    },
    linkedin: {
      type: "string",
      description:
        "LinkedIn post: a one-line hook, then 3-5 short paragraphs with one concrete takeaway, owner-to-owner. End with the post link. No hashtag walls (max 3). Under 1800 characters.",
    },
    x: {
      type: "string",
      description:
        "X (Twitter) post: ONE punchy sentence or two, at most 230 characters NOT counting the link, then a space and the post link at the end. Total must fit in 280 characters.",
    },
  },
  required: ["facebook", "instagram", "linkedin", "x"],
};

/**
 * Write all four captions in one structured call. Falls back to the
 * deterministic version on any failure so the publish hook always yields
 * drafts. Never throws.
 */
export async function generateSocialDrafts(
  post: SocialSourcePost,
  pillarId: string | null = null,
): Promise<{ drafts: GeneratedSocialDraft[]; generated: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { drafts: fallbackSocialDrafts(post), generated: false };
  }
  const ctx = await loadBrandContext({ pillarId });
  const link = blogPostUrl(post.slug);
  const image = absoluteImageUrl(post.heroImage);
  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: brandSystemPrompt(ctx, {
        role: "You write social media posts that promote a new blog post. Each platform gets its own native-feeling post — never the same text four times. Stay inside what the post actually says.",
      }),
      messages: [
        {
          role: "user",
          content: `Write the four platform posts for this blog post.

TITLE: ${post.title}
LINK: ${link}
EXCERPT: ${post.excerpt || "(none)"}

POST BODY (Markdown):
${post.body.slice(0, 6000)}`,
        },
      ],
    });

    if (res.stop_reason === "max_tokens") throw new Error("Social draft generation ran out of room.");
    const block = res.content.find((b) => b.type === "text");
    const data = JSON.parse(block && "text" in block ? block.text : "{}") as Partial<
      Record<SocialPlatform, unknown>
    >;

    const fallback = fallbackSocialDrafts(post);
    const drafts: GeneratedSocialDraft[] = SOCIAL_PLATFORMS.map((platform) => {
      const raw = String(data[platform] ?? "").trim();
      if (!raw) return fallback.find((d) => d.platform === platform)!;
      let caption = raw;
      if (platform === "x") {
        // Guarantee the link survives the clamp.
        const withoutLink = raw.replace(link, "").trim();
        caption = `${clamp(withoutLink, CAPTION_LIMITS.x - 25)} ${link}`;
      } else if (platform !== "instagram" && !raw.includes(link)) {
        caption = `${raw}\n\n${link}`;
      }
      return { platform, caption: clamp(caption, CAPTION_LIMITS[platform] + (platform === "x" ? 60 : 0)), imageUrl: image };
    });
    return { drafts, generated: true };
  } catch (err) {
    await reportAiFailure("Social draft writer", err);
    console.error("[social-drafts] generation failed, using fallback:", err);
    return { drafts: fallbackSocialDrafts(post), generated: false };
  }
}
