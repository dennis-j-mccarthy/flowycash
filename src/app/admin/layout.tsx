import type { Metadata } from "next";
import { AdminSidebar } from "@/components/AdminSidebar";

// Every /admin/* page gets the persistent sidebar. Pages keep their own
// Container widths; the rail just sits beside them on desktop. The shell is
// forced light (.admin-shell in globals.css) so the app's dark-mode flip
// never reaches the creator page. Unlisted: noindex, passcode-gated APIs.
export const metadata: Metadata = {
  title: { default: "Creator page", template: "%s · FlowyCash creator page" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell min-h-screen flex-1">
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
          <AdminSidebar />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
