import type { Metadata } from "next";
import { cookies } from "next/headers";
import { listAtlasGyms } from "@/lib/atlas-registry";
import { RealmAtlas } from "@/components/RealmAtlas";
import { realms } from "@/lib/realms";

export const metadata: Metadata = { title: "Gyms" };
type Query = { gym?: string; sheet?: string; realm?: string; domain?: string; d?: string; seed?: string };

export default async function GymsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { realm, domain, d, seed: querySeed, gym, sheet } = await searchParams;
  const selected = realms.find((r) => r.id === (realm ?? domain) || r.kit === d);
  const seed = querySeed ?? (await cookies()).get("atlas-seed")?.value;
  const initialSeed =
    typeof seed === "string" && /^\d{1,10}$/.test(seed) && Number(seed) <= 0xffffffff ? Number(seed) : 17;
  return (
    <RealmAtlas
      initialGyms={listAtlasGyms()}
      initialGym={gym}
      initialSheet={sheet && /^\d+$/.test(sheet) ? Math.max(0, Number(sheet) - 1) : 0}
      initialRealm={selected?.id}
      initialSeed={initialSeed}
    />
  );
}
