import { redirect } from "next/navigation";

// /admin used to host the title-and-bullets "New article" builder; it
// duplicated the Blog generator, so the sidebar entry is gone and the route
// now lands on the generator. (ArticleBuilder.tsx is still in the tree.)
export default function AdminPage() {
  redirect("/admin/blog");
}
