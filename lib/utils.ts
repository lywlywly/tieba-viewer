import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUnix(ts: number): string {
  const d = new Date(ts * 1000);
  return safeSlice(d.toISOString().replace("T", " "), 0, 19);
}

function safeSlice(text: string, start: number, end: number) {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...seg.segment(text)].map((x) => x.segment);
  return graphemes.slice(start, end).join("");
}
