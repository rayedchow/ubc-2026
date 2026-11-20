import { redirect } from "next/navigation";
export default async function RealmsPage({ searchParams }: { searchParams: Promise<{ realm?: string }> }) {
  const { realm } = await searchParams;
  redirect(realm ? `/gyms?realm=${encodeURIComponent(realm)}` : "/gyms");
}
