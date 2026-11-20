import { notFound } from "next/navigation";
import { GymWorkshop } from "@/components/GymWorkshop";
import { RegisteredGym } from "@/components/RegisteredGym";
import { gymById } from "@/lib/gyms";
import { findAtlasGym } from "@/lib/atlas-registry";
import { realms } from "@/lib/realms";
import { withOnchainData } from "@/lib/server/live-gym";

export default async function GymPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { id } = await params;
  const { seed } = await searchParams;
  const gym = findAtlasGym(id);
  if (gym)
    return <GymWorkshop seed={seed} key={id} gym={gym} realm={realms.find((row) => row.id === gym.realm)!} />;
  const registered = gymById(id);
  if (!registered) notFound();
  return <RegisteredGym gym={await withOnchainData(registered)} />;
}
