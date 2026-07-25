/**
 * CCB Sonare Music — Cloud projects API (Estágio 7)
 *
 * GET  /api/projects  -> { projects: [{ id, name, bpm, trackCount, updatedAt }] }
 * POST /api/projects  -> 201 { id }
 *
 * Apenas METADADOS (name, bpm, Track[]) são persistidos no PostgreSQL.
 * O áudio bruto NUNCA sobe para a nuvem — permanece no IndexedDB local.
 * Projetos excluídos (soft-delete, deletedAt != null) nunca aparecem aqui.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { cloudProjectSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";

/**
 * Limite rígido do corpo JSON: 256 KB.
 * Metadados de um projeto real (dezenas de trilhas com fxChain) ficam muito
 * abaixo disso; qualquer coisa maior indica tentativa de subir áudio/blob.
 */
const MAX_BODY_BYTES = 256 * 1024;

/** Shape da linha retornada pelo select do Prisma (client gerado é `any`). */
interface ProjectListRow {
  id: string;
  name: string;
  bpm: number;
  tracks: unknown;
  updatedAt: Date;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const rows: ProjectListRow[] = await prisma.project.findMany({
      where: { userId: session.user.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, bpm: true, tracks: true, updatedAt: true },
    });

    /* A lista NÃO retorna o array tracks — só o contador (payload leve). */
    const projects = rows.map((row) => ({
      id: row.id,
      name: row.name,
      bpm: row.bpm,
      trackCount: Array.isArray(row.tracks) ? row.tracks.length : 0,
      updatedAt: row.updatedAt.toISOString(),
    }));

    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    /* Rejeição precoce via Content-Length quando o cliente o informa. */
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payloadTooLarge" }, { status: 413 });
    }

    /* Lê como texto para medir o tamanho REAL antes de fazer parse. */
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payloadTooLarge" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    }

    const parsed = cloudProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    }

    const { name, bpm, tracks } = parsed.data;
    const project = await prisma.project.create({
      data: {
        name,
        bpm,
        /* TrackMetadata[] contém apenas ponteiros (audioKey), nunca blobs. */
        tracks: tracks as unknown as Prisma.InputJsonValue,
        userId: session.user.id,
      },
      select: { id: true },
    });

    return NextResponse.json({ id: project.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
