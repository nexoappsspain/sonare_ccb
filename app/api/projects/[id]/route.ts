/**
 * CCB Sonare Music — Cloud project by id (Estágio 7)
 *
 * GET    /api/projects/{id} -> { id, name, bpm, tracks, updatedAt }
 * PUT    /api/projects/{id} -> { ok: true }  (atualização parcial; updatedAt
 *         é renovado automaticamente pelo @updatedAt do Prisma — auditoria)
 * DELETE /api/projects/{id} -> { ok: true }  (SOFT DELETE: deletedAt = now,
 *         o registro nunca é removido fisicamente do PostgreSQL)
 *
 * Escopo por usuário: findFirst({ id, userId, deletedAt: null }) — um id
 * válido de outro usuário responde 404, nunca 403 (não vaza existência).
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { cloudProjectUpdateSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";

/** Mesmo limite de corpo do POST /api/projects: metadados, nunca áudio. */
const MAX_BODY_BYTES = 256 * 1024;

interface RouteContext {
  params: { id: string };
}

/** Shape da linha retornada pelo select do Prisma (client gerado é `any`). */
interface ProjectRow {
  id: string;
  name: string;
  bpm: number;
  tracks: unknown;
  updatedAt: Date;
}

/** Campos atualizáveis via PUT — updatedAt é automático (@updatedAt). */
interface ProjectUpdateData {
  name?: string;
  bpm?: number;
  tracks?: Prisma.InputJsonValue;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const project: ProjectRow | null = await prisma.project.findFirst({
      where: { id: params.id, userId: session.user.id, deletedAt: null },
      select: { id: true, name: true, bpm: true, tracks: true, updatedAt: true },
    });
    if (!project) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    return NextResponse.json({
      id: project.id,
      name: project.name,
      bpm: project.bpm,
      tracks: project.tracks,
      updatedAt: project.updatedAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payloadTooLarge" }, { status: 413 });
    }

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

    const parsed = cloudProjectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    }

    const existing: { id: string } | null = await prisma.project.findFirst({
      where: { id: params.id, userId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    const { name, bpm, tracks } = parsed.data;
    const data: ProjectUpdateData = {};
    if (name !== undefined) data.name = name;
    if (bpm !== undefined) data.bpm = bpm;
    if (tracks !== undefined) {
      data.tracks = tracks as unknown as Prisma.InputJsonValue;
    }

    /* updatedAt é atualizado automaticamente pelo @updatedAt do schema. */
    await prisma.project.update({ where: { id: existing.id }, data });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const existing: { id: string } | null = await prisma.project.findFirst({
      where: { id: params.id, userId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    /* Soft delete: marca deletedAt; o registro (e sua auditoria) permanece. */
    await prisma.project.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
