import { compareManualValues } from "@/modules/product/structured-comparison";

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  const result = compareManualValues(input);
  if (!result) return Response.json({ error: "Confira os valores e preencha os dados de duas a quatro propostas." }, { status: 400 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
