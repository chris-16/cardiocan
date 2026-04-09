import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "videos");
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

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

    // Verify access to this dog
    const access = await getDogAccess(id, session.userId);
    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó un video" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["video/webm", "video/mp4", "video/quicktime"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato de video no válido. Usa WebM, MP4 o MOV" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: "El video no puede superar 100MB" },
        { status: 400 }
      );
    }

    // Save file
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = file.type === "video/quicktime" ? "mov" : file.type.split("/")[1];
    const filename = `${id}_${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const videoUrl = `/uploads/videos/${filename}`;

    return NextResponse.json({
      success: true,
      videoUrl,
      message: "Video subido exitosamente. El análisis automático estará disponible próximamente.",
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
