import { passcodeError } from "@/lib/adminPasscode";
import { isDatabaseConfigured, DB_MISSING_MESSAGE } from "@/lib/prisma";
import { isSocialPlatform } from "@/lib/socialDrafts";
import { isDraftStatus, listSocialDrafts } from "@/lib/socialQueue";

/*
  GET /api/admin/social/drafts?status=&platform=&blogPostId=
  (header x-admin-passcode) → { items, db }

  The "From drafts" picker in /admin/social. Items are the SocialDraft rows
  generated when a blog post is published (plus anything the composer has
  posted). No database → empty list + db:false, never an error.
*/

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = passcodeError(req);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return Response.json({ items: [], db: false, message: DB_MISSING_MESSAGE });
  }
  const q = new URL(req.url).searchParams;
  const status = q.get("status");
  const platform = q.get("platform");
  const blogPostId = q.get("blogPostId");
  try {
    const items = await listSocialDrafts({
      status: isDraftStatus(status) ? status : undefined,
      platform: isSocialPlatform(platform) ? platform : undefined,
      blogPostId: blogPostId || undefined,
    });
    return Response.json({ items, db: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
