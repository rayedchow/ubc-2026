import { RunMonitor } from "@/components/RunMonitor";
export default async function LiveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunMonitor selection={id} />;
}
