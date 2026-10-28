"use client";

import { usePillars } from "@/components/usePillars";
import { pillarIn, pillarTagClsFor } from "@/lib/pillars";

/**
 * Small tag naming the content pillar a row carries; renders nothing for
 * none/unknown (and until the pillars have loaded). Pillars come from
 * GET /api/admin/pillars via the shared usePillars cache — inactive ones
 * still render so old rows keep their tag.
 */
export function PillarTag({ id, className = "" }: { id: string | null | undefined; className?: string }) {
  const { pillars } = usePillars(undefined, { includeInactive: true });
  const p = pillarIn(pillars, id);
  if (!p) return null;
  return (
    <span
      title={p.message}
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${pillarTagClsFor(pillars, p.id)} ${
        p.active ? "" : "opacity-60"
      } ${className}`}
    >
      {p.name}
    </span>
  );
}
