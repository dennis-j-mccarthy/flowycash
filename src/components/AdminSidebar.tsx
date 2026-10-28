"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
  Persistent admin navigation — the creator page's left rail, grouped:
  Strategy (Essence first — every generator reads it), Content, Creative
  (the Library), Channels, Tools.
  Desktop: fixed-width column beside the page. Phone: a horizontal strip
  above the page so every section is still one tap away.
*/

type Item = { href: string; label: string; hint?: string; external?: boolean };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Strategy",
    items: [{ href: "/admin/essence", label: "Essence", hint: "line · voice · tone · pillars" }],
  },
  {
    title: "Content",
    items: [
      { href: "/admin/blog", label: "Blog generator", hint: "titles → draft" },
      { href: "/admin/blog/posts", label: "Blogs", hint: "edit · publish" },
    ],
  },
  {
    title: "Creative",
    items: [{ href: "/admin/library", label: "Library", hint: "images · collections · pillars" }],
  },
  {
    title: "Channels",
    items: [
      { href: "/admin/social", label: "Post maker", hint: "image → platform → pillar → caption → preview" },
      { href: "/admin/email", label: "Email", hint: "newsletter from posts" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/", label: "View site", external: true },
      { href: "/app", label: "Open the app", external: true },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/blog") return pathname === "/admin/blog";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminSidebar() {
  const pathname = usePathname() || "";

  return (
    <nav aria-label="Admin" className="lg:sticky lg:top-6">
      {/* Phone: horizontal strip */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:hidden">
        {GROUPS.flatMap((g) => g.items).map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold " +
                (active
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-ink hover:border-accent")
              }
            >
              {it.label}
            </Link>
          );
        })}
      </div>

      {/* Desktop: left rail */}
      <div className="hidden rounded-2xl border border-line bg-surface p-3 lg:block">
        <div className="px-2 pb-3 pt-1">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Admin
          </span>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-3 last:mb-0">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {g.title}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(pathname, it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={
                        "block rounded-xl px-3 py-2 transition " +
                        (active
                          ? "bg-accent text-white"
                          : "text-ink hover:bg-line/40")
                      }
                    >
                      <span className="block text-sm font-semibold leading-tight">
                        {it.label}
                        {it.external && <span aria-hidden> ↗</span>}
                      </span>
                      {it.hint && (
                        <span
                          className={
                            "block text-[11px] leading-tight " +
                            (active ? "text-white/80" : "text-muted")
                          }
                        >
                          {it.hint}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
