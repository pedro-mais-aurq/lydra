import { ComparisonDetailPage } from "@/components/comparison-ui/ComparisonDetailPage";
export const dynamic = "force-dynamic";
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ComparisonDetailPage key={id} id={id} />;
}
