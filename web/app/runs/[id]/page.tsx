import { redirect } from "next/navigation";
export default async function FormerRun({ params }: { params: Promise<{ id: string }> }) {
  redirect("/live/" + encodeURIComponent((await params).id));
}
