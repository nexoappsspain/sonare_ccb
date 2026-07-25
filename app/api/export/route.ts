/**
 * CCB Sonare Music — Server-side .sonare export (Estágio 7)
 *
 * POST /api/export  body: { projectId }  ->  download "{name}.sonare"
 *
 * IMPORTANTE — escopo desta rota:
 * Esta rota gera um .sonare "receita" SOMENTE COM METADADOS (audio: {}),
 * pensado para compartilhamento leve da estrutura do projeto (nome, bpm,
 * trilhas, cortes, cadeia de efeitos). Quem abre o arquivo em outro
 * dispositivo recebe a estrutura sem o áudio gravado.
 *
 * O .sonare COMPLETO — com os blobs de áudio embutidos em base64 — continua
 * sendo gerado 100% no cliente por lib/audio/exporter.ts (exportProjectSonare),
 * porque o áudio bruto NUNCA sobe para o PostgreSQL nem passa pelo servidor.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const exportSchema = z.object({
  projectId: z.string().min(1),
});

/** Converte o nome do projeto em um nome de arquivo seguro para o header. */
function toSafeFilename(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos combinantes
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : "projeto";
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    }

    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    }

    /* Shape da linha retornada pelo select do Prisma (client gerado é `any`). */
    const project: { name: string; bpm: number; tracks: unknown } | null =
      await prisma.project.findFirst({
        where: {
          id: parsed.data.projectId,
          userId: session.user.id,
          deletedAt: null,
        },
        select: { name: true, bpm: true, tracks: true },
      });
    if (!project) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    /* "Receita" portável: version 1 + metadados; audio vazio de propósito. */
    const payload = {
      version: 1,
      project: {
        name: project.name,
        bpm: project.bpm,
        tracks: project.tracks,
      },
      audio: {},
    };

    const filename = `${toSafeFilename(project.name)}.sonare`;
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
