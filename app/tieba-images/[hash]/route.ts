import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

function parseImageBaseDirs(): string[] {
  const fromList = (process.env.IMAGE_BASE_DIRS ?? "")
    .split(",")
    .map((dir) => dir.trim())
    .filter(Boolean);
  if (fromList.length > 0) {
    return fromList;
  }

  const singleDir = process.env.IMAGE_BASE_DIR?.trim();
  return singleDir ? [singleDir] : [];
}

const IMAGE_BASE_DIRS = parseImageBaseDirs();

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const PREFIX_DIR = "by_prefix";

function getPrefixBucket(filename: string): string {
  const lowerName = filename.toLowerCase();
  const firstChar = lowerName[0];
  if (!firstChar || !/[a-z0-9]/.test(firstChar)) {
    return "_other";
  }
  return lowerName.slice(0, 2);
}

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
  if (IMAGE_BASE_DIRS.length === 0) {
    return new NextResponse("Missing image base dir config", { status: 500 });
  }

  let filePath: string | null = null;
  let usedExt = "";

  for (const baseDir of IMAGE_BASE_DIRS) {
    for (const ext of IMAGE_EXTS) {
      const fileName = hash + ext;
      const prefixBucket = getPrefixBucket(fileName);
      const candidate = path.join(baseDir, PREFIX_DIR, prefixBucket, fileName);
      if (fs.existsSync(candidate)) {
        filePath = candidate;
        usedExt = ext;
        break;
      }
    }
    if (filePath) {
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
