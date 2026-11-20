import { requireAtlasGym, gymActivity } from "@/lib/atlas-registry";
import { publicGradingVolumeCents } from "@/lib/reported-runs";
import { respond } from "@/lib/http";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => ({
    gym: requireAtlasGym(id),
    activity: gymActivity(id),
    gradingVolumeCents: publicGradingVolumeCents(id),
  }));
}
