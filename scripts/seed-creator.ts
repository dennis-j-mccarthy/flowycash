/*
  Seed the creator page (/admin) for FlowyCash. Idempotent — every write is
  an upsert or a "skip if already there" check, so it can be re-run.

    npx tsx scripts/seed-creator.ts            # reads .env.local
    npx tsx scripts/seed-creator.ts .env.prod  # or another env file

  Seeds: BrandEssence (id "default"), the four Pillars, BlogSettings tone,
  and the Library — the two product logos from public/ plus two
  Unsplash-licensed concept photos fetched from the owner's other library.
  Needs DIRECT_DATABASE_URL (runtime) in the env file. Never prints secrets.
*/
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";

config({ path: process.argv[2] || ".env.local" });

const ROOT = path.resolve(__dirname, "..");

async function main() {
  if (!process.env.DIRECT_DATABASE_URL) {
    console.error("DIRECT_DATABASE_URL is not set — nothing seeded.");
    process.exit(1);
  }
  // Dynamic imports so dotenv has run before src/lib/prisma.ts reads the env.
  const { prisma } = await import("../src/lib/prisma");
  const { BRAND_ESSENCE, DEFAULT_PILLARS } = await import("../src/lib/pillars");
  const { importImageFromUrl, saveLibraryImage } = await import("../src/lib/library");
  const { measureImage, sniffImage } = await import("../src/lib/uploadedImages");

  const counts = { essence: 0, pillars: 0, settings: 0, libraryAdded: 0, librarySkipped: 0, libraryFailed: 0 };

  /* ── tone brief, derived from the essence ── */
  const tone = {
    voice:
      "Plain, calm money talk — no shame, no hype. Mostly serious with a light touch, a bit more casual than formal, slightly bold.",
    audience:
      "People who get paid on a schedule and want to stop being surprised by the month — not finance hobbyists.",
    style:
      "~400–600 words, 2–3 subheads, one concrete scenario (rent on the 1st, paycheck on the 15th, the credit-card day) and one small habit to take away.",
    dos: BRAND_ESSENCE.doList.join("; "),
    donts: BRAND_ESSENCE.dontList.join("; "),
  };

  /* ── BrandEssence ── */
  const essence = {
    line: BRAND_ESSENCE.line,
    purpose: BRAND_ESSENCE.purpose,
    promise: BRAND_ESSENCE.promise,
    doList: [...BRAND_ESSENCE.doList],
    dontList: [...BRAND_ESSENCE.dontList],
    voicePlayful: 40,
    voiceFormal: 45,
    voiceBold: 55,
    tone,
  };
  await prisma.brandEssence.upsert({ where: { id: "default" }, create: { id: "default", ...essence }, update: essence });
  counts.essence = 1;

  /* ── Pillars ── */
  for (const p of DEFAULT_PILLARS) {
    const data = {
      name: p.name,
      message: p.message,
      angles: p.angles,
      hashtags: p.hashtags,
      target: p.target,
      sortOrder: p.sortOrder,
      active: true,
    };
    await prisma.pillar.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
    counts.pillars++;
  }

  /* ── BlogSettings ── */
  await prisma.blogSettings.upsert({ where: { id: "default" }, create: { id: "default", tone }, update: { tone } });
  counts.settings = 1;

  /* ── Library: product images from public/ ── */
  const brand: { file: string; title: string }[] = [
    { file: "logo.png", title: "FlowyCash logo" },
    { file: "logo-white.png", title: "FlowyCash logo (white)" },
  ];
  for (const b of brand) {
    const existing = await prisma.uploadedImage.findFirst({
      where: { collection: "brand", title: b.title },
      select: { id: true },
    });
    if (existing) {
      counts.librarySkipped++;
      continue;
    }
    try {
      const raw = readFileSync(path.join(ROOT, "public", b.file));
      const buf = new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)) as Uint8Array<ArrayBuffer>;
      const kind = sniffImage(buf);
      if (!kind) throw new Error(`${b.file} is not a JPEG/PNG/WebP`);
      const { width, height } = measureImage(buf);
      const slug = b.file.replace(/\.[a-z0-9]+$/i, "");
      await saveLibraryImage({
        data: buf,
        mime: kind.mime,
        filename: `brand__${slug}.${kind.ext}`,
        width,
        height,
        title: b.title,
        collection: "brand",
        tags: ["logo", "brand"],
        source: "upload",
      });
      counts.libraryAdded++;
      console.log(`library + ${b.title}`);
    } catch (err) {
      counts.libraryFailed++;
      console.warn(`library ! ${b.title}: ${(err as Error).message}`);
    }
  }

  /* ── Library: concept photos (Unsplash-licensed) from the owner's other library ── */
  const concepts: { url: string; title: string; credit: string; pillarId: string; tags: string[] }[] = [
    {
      url: "https://www.built-with-ai.site/api/images/cmvmy7557000108l5vnffuhrh",
      title: "Alarm clock on the desk",
      credit: "Photo on Unsplash",
      pillarId: "seeit",
      tags: ["time", "morning", "deadline"],
    },
    {
      url: "https://www.built-with-ai.site/api/images/cmvmy85or000l08l5xum3l4dt",
      title: "Planning the calendar",
      credit: "Photo on Unsplash",
      pillarId: "calendar",
      tags: ["calendar", "planning", "month"],
    },
  ];
  for (const c of concepts) {
    const existing = await prisma.uploadedImage.findFirst({
      where: { collection: "concepts", title: c.title },
      select: { id: true },
    });
    if (existing) {
      counts.librarySkipped++;
      continue;
    }
    try {
      await importImageFromUrl({
        url: c.url,
        title: c.title,
        credit: c.credit,
        collection: "concepts",
        tags: c.tags,
        pillarId: c.pillarId,
        source: "stock",
      });
      counts.libraryAdded++;
      console.log(`library + ${c.title}`);
    } catch (err) {
      counts.libraryFailed++;
      console.warn(`library ! ${c.title}: ${(err as Error).message}`);
    }
  }

  const library = await prisma.uploadedImage.count();
  console.log(
    `seeded: essence=${counts.essence} pillars=${counts.pillars} blogSettings=${counts.settings} ` +
      `library(+${counts.libraryAdded} skipped ${counts.librarySkipped} failed ${counts.libraryFailed}, total ${library})`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
