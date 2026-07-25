import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const profileSchema = z.object({
  name: z.string().trim().min(2),
  instrument: z.string().trim().optional(),
});

/** Returns the logged-in user's public profile fields. */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, instrument: true },
    });
    if (!user) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}

/** Updates name and main instrument of the logged-in user. */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidInput" }, { status: 400 });
    }

    const { name, instrument } = parsed.data;
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        instrument: instrument && instrument.length > 0 ? instrument : null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
