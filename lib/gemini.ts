/**
 * Gemini API client for respiratory video analysis.
 * Uses raw fetch calls to avoid adding SDK dependency.
 * Includes in-memory rate limiting for free tier (15 req/min).
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

// --- Rate Limiter (15 requests per minute for Gemini free tier) ---

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 15;
const requestTimestamps: number[] = [];

function checkRateLimit(): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  // Remove timestamps outside the window
  while (
    requestTimestamps.length > 0 &&
    requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS
  ) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = requestTimestamps[0];
    const retryAfterMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, retryAfterMs };
  }

  requestTimestamps.push(now);
  return { allowed: true };
}

// --- File Upload API ---

interface GeminiFile {
  name: string;
  uri: string;
  mimeType: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

interface UploadResponse {
  file: GeminiFile;
}

async function uploadVideoToGemini(
  videoBuffer: Buffer,
  mimeType: string,
  apiKey: string
): Promise<GeminiFile> {
  // Step 1: Start resumable upload
  const startRes = await fetch(
    `${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": videoBuffer.length.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: { displayName: "respiratory_video" },
      }),
    }
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Error al iniciar upload a Gemini: ${startRes.status} - ${errText}`);
  }

  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("No se recibió URL de upload de Gemini");
  }

  // Step 2: Upload the actual bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": videoBuffer.length.toString(),
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Error al subir video a Gemini: ${uploadRes.status} - ${errText}`);
  }

  const uploadData = (await uploadRes.json()) as UploadResponse;
  return uploadData.file;
}

async function waitForFileProcessing(
  fileName: string,
  apiKey: string,
  maxWaitMs = 120_000
): Promise<GeminiFile> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(
      `${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`
    );

    if (!res.ok) {
      throw new Error(`Error al verificar estado del archivo: ${res.status}`);
    }

    const file = (await res.json()) as GeminiFile;

    if (file.state === "ACTIVE") {
      return file;
    }

    if (file.state === "FAILED") {
      throw new Error("Gemini no pudo procesar el video. Intenta con un video más corto o de mejor calidad.");
    }

    // Wait 2 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("El procesamiento del video tardó demasiado. Intenta de nuevo.");
}

// --- Analysis ---

interface GeminiAnalysisResult {
  breathCount: number;
  durationSeconds: number;
  breathsPerMinute: number;
  confidence: "alta" | "media" | "baja";
  notes: string;
}

const ANALYSIS_PROMPT = `Eres un experto veterinario en cardiología canina. Analiza este video de un perro en reposo y cuenta las respiraciones visibles.

INSTRUCCIONES:
1. Observa los movimientos del pecho/abdomen del perro en el video
2. Cuenta cada ciclo respiratorio completo (una inhalación + una exhalación = 1 respiración)
3. Determina la duración total del video en segundos
4. Calcula las respiraciones por minuto (RPM)

RESPONDE EXCLUSIVAMENTE en este formato JSON (sin markdown, sin backticks, solo JSON puro):
{
  "breathCount": <número entero de respiraciones contadas>,
  "durationSeconds": <duración del video en segundos, entero>,
  "breathsPerMinute": <RPM calculado, entero redondeado>,
  "confidence": "<alta|media|baja>",
  "notes": "<observaciones breves sobre la calidad del video o el estado del perro>"
}

CRITERIOS DE CONFIANZA:
- "alta": Movimientos respiratorios claramente visibles y contables
- "media": Algunos movimientos difíciles de distinguir pero conteo razonable
- "baja": Video con poca visibilidad, perro en movimiento, o difícil de contar

Si NO puedes contar las respiraciones (video borroso, perro no visible, etc.), responde:
{
  "breathCount": 0,
  "durationSeconds": 0,
  "breathsPerMinute": 0,
  "confidence": "baja",
  "notes": "<explicación de por qué no se pudo analizar>"
}`;

export async function analyzeRespiratoryVideo(
  videoBuffer: Buffer,
  mimeType: string
): Promise<GeminiAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada en las variables de entorno");
  }

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    const waitSecs = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000);
    throw new Error(
      `Límite de análisis alcanzado. Por favor espera ${waitSecs} segundos antes de intentar de nuevo.`
    );
  }

  // Upload video to Gemini
  const uploadedFile = await uploadVideoToGemini(videoBuffer, mimeType, apiKey);

  // Wait for processing
  const activeFile = await waitForFileProcessing(uploadedFile.name, apiKey);

  // Send analysis request
  const generateRes = await fetch(
    `${GEMINI_API_BASE}/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                fileData: {
                  mimeType: activeFile.mimeType,
                  fileUri: activeFile.uri,
                },
              },
              { text: ANALYSIS_PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  if (!generateRes.ok) {
    const errText = await generateRes.text();
    throw new Error(`Error en el análisis de Gemini: ${generateRes.status} - ${errText}`);
  }

  const generateData = await generateRes.json();

  // Extract text from response
  const responseText: string =
    generateData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!responseText) {
    throw new Error("Gemini no devolvió un análisis válido. Intenta de nuevo.");
  }

  // Parse JSON response (strip potential markdown code fences)
  const cleanJson = responseText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed: GeminiAnalysisResult;
  try {
    parsed = JSON.parse(cleanJson) as GeminiAnalysisResult;
  } catch {
    throw new Error(
      "No se pudo interpretar la respuesta de Gemini. Intenta grabar un video más claro."
    );
  }

  // Validate the parsed result
  if (
    typeof parsed.breathCount !== "number" ||
    typeof parsed.durationSeconds !== "number" ||
    typeof parsed.breathsPerMinute !== "number"
  ) {
    throw new Error(
      "La respuesta de Gemini no contiene datos válidos. Intenta de nuevo."
    );
  }

  // Validate confidence is one of the allowed values
  if (!["alta", "media", "baja"].includes(parsed.confidence)) {
    parsed.confidence = "media";
  }

  return parsed;
}
