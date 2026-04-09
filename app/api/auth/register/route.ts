import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { isValidTimezone } from "@/lib/timezone";
import crypto from "crypto";

interface RegisterBody {
  email: string;
  password: string;
  name: string;
  timezone?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegisterBody;
    const { email, password, name, timezone } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, contraseña y nombre son requeridos" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    const db = getDb();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con este email" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();

    const userTimezone =
      timezone && isValidTimezone(timezone) ? timezone : "America/Santiago";

    await db.insert(users).values({
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      name,
      timezone: userTimezone,
    });

    await createSession(userId);

    return NextResponse.json(
      { user: { id: userId, email: email.toLowerCase(), name } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
