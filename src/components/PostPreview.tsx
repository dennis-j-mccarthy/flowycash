"use client";

import { useState } from "react";
import { CAPTION_LIMITS, PLATFORM_LABELS, type SocialPlatform } from "@/lib/socialPlatforms";

/*
  Post preview — what the post will look like on the chosen network, shown
  in step ④ of the post maker once image + platform + caption exist. The
  Publish / Schedule (or Copy) controls render INSIDE this card (`actions`),
  so the operator always sees the post before acting on it.

    facebook   page avatar "B", "Built with AI", "Just now · 🌐", caption with
               a "See more" fold at ~3 lines, image, Like / Comment / Share
    instagram  square image on top, "builtwithai" handle, caption with the
               handle bold on the first line, hashtags dimmed
    linkedin   avatar + name + "1h", caption, image, Like / Comment / Repost
    x          avatar + name + @handle, caption, image, reply/repost/like row

  `valid` is computed here and handed back through `onValidity` so the
  maker can gate its buttons: caption present, within the platform limit,
  and (Instagram) an image.
*/

export const PAGE_NAME = "Built with AI";
export const HANDLE = "builtwithai";

type Props = {
  platform: SocialPlatform;
  caption: string;
  imageUrl: string;
  /** datetime-local value ("" = post now) */
  scheduledAt: string;
  actions: React.ReactNode;
};

export function previewValidity(platform: SocialPlatform, caption: string, imageUrl: string) {
  const limit = CAPTION_LIMITS[platform];
  const len = caption.length;
  const over = len > limit;
  const needsImage = platform === "instagram" && !imageUrl.trim();
  const problems: string[] = [];
  if (!caption.trim()) problems.push("Write or pick a caption.");
  if (over) problems.push(`${(len - limit).toLocaleString()} characters over the ${PLATFORM_LABELS[platform]} limit.`);
  if (needsImage) problems.push("Instagram needs an image.");
  return { valid: problems.length === 0, problems, over, len, limit };
}

const AV = "grid h-10 w-10 flex-none place-items-center rounded-full bg-accent font-bold text-accent-ink";

/** Caption text with real line breaks; hashtags dimmed when asked. */
function CaptionText({ text, dimTags, lead }: { text: string; dimTags?: boolean; lead?: string }) {
  const parts = dimTags ? text.split(/(#[\p{L}\p{N}_]+)/u) : [text];
  return (
    <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.35]">
      {lead && <b className="mr-1">{lead}</b>}
      {parts.map((p, i) =>
        dimTags && /^#[\p{L}\p{N}_]+$/u.test(p) ? (
          <span key={i} className="text-[#00376b]/80">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function Img({ src, square }: { src: string; square?: boolean }) {
  if (!src.trim()) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src.trim()} alt="" className={`block w-full bg-black/5 object-cover ${square ? "aspect-square" : "max-h-[420px]"}`} />
  );
}

export function PostPreview({ platform, caption, imageUrl, scheduledAt, actions }: Props) {
  const [expanded, setExpanded] = useState(false);
  const v = previewValidity(platform, caption, imageUrl);
  const when = scheduledAt ? new Date(scheduledAt) : null;
  const whenLabel = when && !Number.isNaN(when.getTime()) ? `Scheduled for ${when.toLocaleString()}` : null;

  // Facebook's fold: ~3 lines → roughly 220 chars or the 3rd line break.
  const fbFold = (() => {
    if (expanded) return { text: caption, folded: false };
    const lines = caption.split("\n");
    let cut = caption;
    if (lines.length > 3) cut = lines.slice(0, 3).join("\n");
    if (cut.length > 220) cut = cut.slice(0, 220).replace(/\s+\S*$/, "");
    return { text: cut, folded: cut.length < caption.length };
  })();

  return (
    <div className="rounded-xl border-2 border-line bg-surface p-3.5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-ink">
          Preview · {PLATFORM_LABELS[platform]}
          {whenLabel && <span className="ml-2 rounded-full bg-sun-soft px-2 py-0.5 text-[11px] font-bold text-sun">{whenLabel}</span>}
        </h3>
        <span className={`font-mono text-[11px] ${v.over ? "font-bold text-berry" : "text-muted"}`}>
          {v.len.toLocaleString()} / {v.limit.toLocaleString()}
          {v.over && " — too long"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ── the mock ── */}
        <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl border border-black/10 bg-white text-[#050505] shadow-sm">
          {platform === "facebook" && (
            <>
              <div className="flex items-center gap-2.5 px-3 pt-3">
                <span className={AV}>B</span>
                <div className="leading-tight">
                  <div className="text-[15px] font-semibold">{PAGE_NAME}</div>
                  <div className="text-[12px] text-[#65676b]">{when ? whenLabel : "Just now"} · 🌐</div>
                </div>
              </div>
              <div className="px-3 pb-2 pt-2">
                <CaptionText text={fbFold.text} />
                {fbFold.folded && (
                  <button type="button" onClick={() => setExpanded(true)} className="text-[14px] font-semibold text-[#65676b] hover:underline">
                    … See more
                  </button>
                )}
              </div>
              <Img src={imageUrl} />
              <div className="flex justify-around border-t border-black/10 px-3 py-1.5 text-[13px] font-semibold text-[#65676b]">
                <span>👍 Like</span>
                <span>💬 Comment</span>
                <span>↗ Share</span>
              </div>
            </>
          )}

          {platform === "instagram" && (
            <>
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <span className={`${AV} h-8 w-8 text-sm`}>B</span>
                <div className="text-[13px] font-semibold">{HANDLE}</div>
              </div>
              {imageUrl.trim() ? (
                <Img src={imageUrl} square />
              ) : (
                <div className="grid aspect-square w-full place-items-center bg-black/5 text-xs text-[#65676b]">Instagram needs an image</div>
              )}
              <div className="px-3 pt-2 text-[20px] tracking-wide">♡ &nbsp;💬 &nbsp;↗</div>
              <div className="px-3 pb-3 pt-1">
                <CaptionText text={caption} dimTags lead={HANDLE} />
              </div>
            </>
          )}

          {platform === "linkedin" && (
            <>
              <div className="flex items-center gap-2.5 px-3 pt-3">
                <span className={`${AV} rounded-md`}>B</span>
                <div className="leading-tight">
                  <div className="text-[14px] font-semibold">{PAGE_NAME}</div>
                  <div className="text-[12px] text-[#666]">Custom sites, built with AI · 1h</div>
                </div>
              </div>
              <div className="px-3 pb-2 pt-2">
                <CaptionText text={caption} dimTags />
              </div>
              <Img src={imageUrl} />
              <div className="flex justify-around border-t border-black/10 px-3 py-1.5 text-[13px] font-semibold text-[#666]">
                <span>👍 Like</span>
                <span>💬 Comment</span>
                <span>🔁 Repost</span>
              </div>
            </>
          )}

          {platform === "x" && (
            <div className="flex gap-2.5 p-3">
              <span className={AV}>B</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] leading-tight">
                  <b>{PAGE_NAME}</b> <span className="text-[#536471]">@{HANDLE} · now</span>
                </div>
                <div className="mt-1">
                  <CaptionText text={caption} dimTags />
                </div>
                {imageUrl.trim() && (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-black/10">
                    <Img src={imageUrl} />
                  </div>
                )}
                <div className="mt-2 flex justify-between pr-6 text-[13px] text-[#536471]">
                  <span>💬</span>
                  <span>🔁</span>
                  <span>♡</span>
                  <span>↗</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── validity + actions ── */}
        <div className="flex min-w-0 flex-col justify-between gap-3">
          {v.problems.length > 0 ? (
            <ul className="space-y-1 text-sm font-semibold text-berry">
              {v.problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Looks right? {whenLabel ? "It will go out at the scheduled time." : "This is exactly what will be posted."}
            </p>
          )}
          <div>{actions}</div>
        </div>
      </div>
    </div>
  );
}
