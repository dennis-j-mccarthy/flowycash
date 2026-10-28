/*
  Social platform constants — pure data, safe to import from client
  components. The AI writer that uses them lives in socialDrafts.ts (server
  only: it pulls in the Anthropic SDK and the email-backed alert helper).
*/

export type SocialPlatform = "facebook" | "instagram" | "linkedin" | "x";

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "linkedin", "x"];

export const CAPTION_LIMITS: Record<SocialPlatform, number> = {
  facebook: 2000,
  instagram: 2200,
  linkedin: 3000,
  x: 280,
};

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
};

export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return typeof v === "string" && (SOCIAL_PLATFORMS as string[]).includes(v);
}
