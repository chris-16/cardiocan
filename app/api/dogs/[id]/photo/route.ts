import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { hasPermission } from "@/lib/db/permissions";
import { eq } from "drizzle-orm";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "dogs");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    // Verify access and role
    const access = await getDogAccess(id, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    if (!hasPermission(access.role, "dog:photo")) {
      return NextResponse.json(
        { error: "No tienes permiso para modificar la foto" },
        { status: 403 }
      );
    }

    const db = getDb();

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó una foto" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato de imagen no válido. Usa JPG, PNG o WebP" },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "La imagen no puede superar 5MB" },
        { status: 400 }
      );
    }

    // Save file
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const photoUrl = `/uploads/dogs/${filename}`;

    await db
      .update(dogs)
      .set({ photoUrl, updatedAt: new Date() })
      .where(eq(dogs.id, id));

    const [dog] = await db.select().from(dogs).where(eq(dogs.id, id)).limit(1);

    return NextResponse.json({ dog });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
