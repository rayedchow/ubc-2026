import { ALL_TAGS, categoryById } from "@/lib/gyms";
import { GRADING_METHODS, searchGyms, type SearchFilters } from "@/lib/search";
import type { GradingMethod, GymStatus } from "@/lib/types";

const STATUSES: GymStatus[] = ["open", "exclusive", "soon"];

/** GET /api/gyms/search?q=&mode=meaning|exact&category=&tags=a,b&status=&grading=&maxPrice= */
export function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const filters: SearchFilters = {};

  const category = categoryById(p.get("category"));
  if (category) filters.category = category.id;
  const tags = (p.get("tags") ?? "").split(",").filter((tag) => ALL_TAGS.includes(tag));
  if (tags.length) filters.tags = tags;
  const status = p.get("status") as GymStatus | null;
  if (status && STATUSES.includes(status)) filters.status = status;
  const grading = p.get("grading") as GradingMethod | null;
  if (grading && GRADING_METHODS.includes(grading)) filters.grading = grading;
  const maxPrice = Number(p.get("maxPrice"));
  if (p.get("maxPrice") && Number.isFinite(maxPrice) && maxPrice > 0) filters.maxPrice = maxPrice;

  const mode = p.get("mode") === "exact" ? "exact" : "meaning";
  const q = (p.get("q") ?? "").slice(0, 200);
  return Response.json({ mode, results: searchGyms(q, mode, filters) });
}
