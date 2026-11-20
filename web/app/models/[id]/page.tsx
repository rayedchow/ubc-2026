import { ModelCollection } from "@/components/ModelCollection";

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ModelCollection initialId={id} />;
}
