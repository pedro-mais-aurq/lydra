import { avg, count, desc, gt } from "drizzle-orm";
import { z } from "zod";
import { getChatGPTUser } from "@/core/auth/chatgpt-auth";
import { getDb } from "../../../../db";
import { reviews } from "../../../../db/schema";

export const dynamic = "force-dynamic";

const reviewInput = z.object({ score: z.number().int().min(1).max(5), note: z.string().trim().max(500) });
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const db = getDb();
    if (!db) return Response.json({ available: false }, { headers });
    const [summary, notes, user] = await Promise.all([
      db.select({ total: count(), average: avg(reviews.score) }).from(reviews),
      db.select({ score: reviews.score, note: reviews.note, date: reviews.updatedAt }).from(reviews)
        .where(gt(reviews.note, "")).orderBy(desc(reviews.updatedAt)).limit(4),
      getChatGPTUser(),
    ]);
    const totals = summary[0];
    return Response.json({
      available: true,
      count: totals?.total ?? 0, average: totals?.average == null ? null : Number(totals.average),
      notes, canReview: Boolean(user),
    }, { headers });
  } catch {
    return Response.json({ error: "As avaliações estão indisponíveis agora." }, { status: 503, headers });
  }
}

export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Abra a página da Lydra para avaliar." }, { status: 403, headers });
  }
  const db = getDb();
  if (!db) return Response.json({ error: "As avaliações estão disponíveis no ChatGPT Sites." }, { status: 503, headers });

  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Entre no ChatGPT para registrar sua avaliação." }, { status: 401, headers });

  const parsed = reviewInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Escolha uma nota de 1 a 5 e use até 500 caracteres." }, { status: 400, headers });
  const value = { ...parsed.data, updatedAt: new Date().toISOString() };
  try {
    await db.insert(reviews).values({ ownerId: user.userId, ...value })
      .onConflictDoUpdate({ target: reviews.ownerId, set: value });
    return Response.json({ saved: true }, { headers });
  } catch {
    return Response.json({ error: "Não foi possível salvar a avaliação agora." }, { status: 503, headers });
  }
}
