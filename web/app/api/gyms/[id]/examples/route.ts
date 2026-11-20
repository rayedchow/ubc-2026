import { trainingExamples } from "@/lib/gym-data";
import { requireAtlasGym } from "@/lib/atlas-registry";
import { respond } from "@/lib/http";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond(() => {
    const gym = requireAtlasGym(id);
    return { examples: trainingExamples(gym), source: gym.source };
  });
}
