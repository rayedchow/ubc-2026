import type { Metadata } from "next";
import { ModelStudio } from "@/components/ModelStudio";
import "./studio.css";

export const metadata: Metadata = { title: "Model studio" };

export default async function ModelStudioPage({ searchParams }: {
  searchParams: Promise<{ view?: string; model?: string; realm?: string }>;
}) {
  const params = await searchParams;
  return <ModelStudio initialView={params.view} initialBot={params.model} initialRealm={params.realm} />;
}
