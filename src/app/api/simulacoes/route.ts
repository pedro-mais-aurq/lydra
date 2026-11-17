import { simulateComparison } from "@/modules/product/structured-comparison";

export async function POST(request: Request) {
  const selected = await request.json().catch(() => null);
  const result = simulateComparison(selected);
  if (!result) return Response.json({ error: "Selecione pelo menos duas propostas de exemplo." }, { status: 400 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
