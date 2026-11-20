import { redirect } from "next/navigation";
export default async function RealmGymPage({ params }: { params: Promise<{ gym: string }> }) {
  const { gym } = await params;
  redirect(`/gyms/${encodeURIComponent(gym)}`);
}
