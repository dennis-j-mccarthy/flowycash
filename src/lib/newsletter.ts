import { site } from "@/lib/site";
import { absoluteImageUrl, blogPostUrl } from "@/lib/socialDrafts";

/*
  Newsletter rendering — deterministic, no network. The model writes the
  COPY (subjects, preheader, intro, a blurb per post, outro); this file turns
  that into a simple responsive single-column email (inline styles, one
  hero image from the first post, a section per post with "Read more →",
  a footer) and its plain-text twin. Keeping markup out of the model means
  every newsletter looks the same and nothing unsafe is ever injected.
*/

export interface NewsletterPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  heroImage: string | null;
}

export interface NewsletterCopy {
  /** One short greeting/intro paragraph (may be empty). */
  intro: string;
  /** One blurb per post, in the same order as `posts`. */
  blurbs: { postId: string; heading: string; blurb: string }[];
  /** A one-line sign-off / CTA paragraph. */
  outro: string;
}

export interface RenderedNewsletter {
  html: string;
  text: string;
}

const ACCENT = "#068b40"; // FlowyCash green; emails can't read CSS vars
const INK = "#0f172a";
const MUTED = "#5b6b63";
const PAPER = "#f7f9f7";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Paragraphs from a plain string: blank-line separated, HTML-escaped. */
function paras(s: string, style: string): string {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

const P_STYLE = `margin:0 0 14px;font-size:16px;line-height:1.6;color:${INK};`;

export function renderNewsletter(
  posts: NewsletterPost[],
  copy: NewsletterCopy,
  opts: { subject: string; preheader: string },
): RenderedNewsletter {
  const hero = absoluteImageUrl(posts[0]?.heroImage ?? null);
  const blurbFor = (p: NewsletterPost) =>
    copy.blurbs.find((b) => b.postId === p.id) ?? { postId: p.id, heading: p.title, blurb: p.excerpt };

  const sectionsHtml = posts
    .map((p, i) => {
      const b = blurbFor(p);
      const url = blogPostUrl(p.slug);
      const img = i > 0 ? absoluteImageUrl(p.heroImage) : null;
      return `
        <tr><td style="padding:${i === 0 ? 0 : 28}px 0 0;">
          ${img ? `<a href="${url}" style="display:block;margin:0 0 14px;"><img src="${escapeHtml(img)}" alt="" width="600" style="display:block;width:100%;height:auto;border-radius:12px;border:0;"></a>` : ""}
          <h2 style="margin:0 0 8px;font-size:22px;line-height:1.25;color:${INK};font-weight:700;"><a href="${url}" style="color:${INK};text-decoration:none;">${escapeHtml(b.heading || p.title)}</a></h2>
          ${paras(b.blurb || p.excerpt, P_STYLE)}
          <p style="margin:0;"><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:${ACCENT};color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Read more &rarr;</a></p>
        </td></tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAPER};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
  <tr><td style="padding:22px 28px 0;">
    <a href="${site.url}" style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};text-decoration:none;">${escapeHtml(site.name)}</a>
  </td></tr>
  ${hero ? `<tr><td style="padding:16px 28px 0;"><a href="${blogPostUrl(posts[0].slug)}" style="display:block;"><img src="${escapeHtml(hero)}" alt="" width="544" style="display:block;width:100%;height:auto;border-radius:12px;border:0;"></a></td></tr>` : ""}
  <tr><td style="padding:22px 28px 0;">
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;color:${INK};font-weight:800;">${escapeHtml(opts.subject)}</h1>
    ${paras(copy.intro, P_STYLE)}
  </td></tr>
  <tr><td style="padding:6px 28px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      ${sectionsHtml}
    </table>
  </td></tr>
  <tr><td style="padding:28px 28px 26px;">
    ${paras(copy.outro, P_STYLE)}
    <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">&mdash; Dennis, ${escapeHtml(site.name)}</p>
  </td></tr>
  <tr><td style="padding:18px 28px 24px;border-top:1px solid #eee7dc;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(site.name)} &middot; <a href="${site.url}" style="color:${MUTED};">${escapeHtml(site.domain)}</a><br>
    You're getting this because you asked to hear from us. <a href="{{unsubscribe_url}}" style="color:${MUTED};">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textSections = posts
    .map((p) => {
      const b = blurbFor(p);
      return `${(b.heading || p.title).toUpperCase()}\n\n${b.blurb || p.excerpt}\n\nRead more: ${blogPostUrl(p.slug)}`;
    })
    .join("\n\n— — —\n\n");

  const text = [
    opts.subject,
    opts.preheader ? opts.preheader : null,
    "",
    copy.intro,
    "",
    textSections,
    "",
    copy.outro,
    `— Dennis, ${site.name}`,
    "",
    `${site.name} · ${site.url}`,
    "Unsubscribe: {{unsubscribe_url}}",
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
}

/** Deterministic copy when the model isn't available. */
export function fallbackNewsletterCopy(posts: NewsletterPost[], topic?: string): NewsletterCopy {
  return {
    intro: topic
      ? `A few things worth your time this week, on ${topic}.`
      : posts.length > 1
        ? "A few things worth your time this week."
        : "One thing worth your time this week.",
    blurbs: posts.map((p) => ({ postId: p.id, heading: p.title, blurb: p.excerpt })),
    outro: "Questions? Reply to this email — it comes straight to me.",
  };
}
