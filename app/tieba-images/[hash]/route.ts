import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const IMAGE_BASE_DIR = process.env.IMAGE_BASE_DIR!;

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

function guessContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;

  if (!hash) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  let filePath: string | null = null;
  let usedExt = "";

  for (const ext of IMAGE_EXTS) {
    const candidate = path.join(IMAGE_BASE_DIR, hash + ext);
    if (fs.existsSync(candidate)) {
      filePath = candidate;
      usedExt = ext;
      break;
    }
  }

  if (!filePath) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const contentType = guessContentType(usedExt);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
