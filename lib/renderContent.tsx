import React from "react";
import fs from "fs";
import path from "path";
import { DOMParser } from "@xmldom/xmldom";

const EMOJI_URL_BASE = "/emoji";
const IMAGE_URL_BASE = "/tieba-images";

const IMAGE_DIR = path.join(process.cwd(), "public", "tieba-images");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

function findLocalImageByHash(hash: string): string | null {
  for (const ext of IMAGE_EXTS) {
    const filePath = path.join(IMAGE_DIR, hash + ext);
    if (fs.existsSync(filePath)) {
      return `${IMAGE_URL_BASE}/${hash}${ext}`;
    }
  }
  return null;
}

export function renderTiebaContent(
  raw: string | null | undefined,
): React.ReactNode {
  if (!raw) return null;

  let xml = raw.trim();

  // Ensure there is a single root element
  if (!xml.startsWith("<root")) {
    xml = `<root>${xml}</root>`;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const root = doc.documentElement;

  if (!root) {
    // Fallback: just show the raw text
    return (
      <span className="whitespace-pre-wrap wrap-break-word text-inherit">
        {raw}
      </span>
    );
  }

  const children = Array.from(root.childNodes);
  const nodes = children
    .filter((node) => node.nodeName != "VoteInfo")
    .map((node: any, idx: number) => renderNode(node, `root-${idx}`));

  const filteredNodes = nodes.filter(
    (x): x is Exclude<React.ReactNode, null | undefined> => x != null,
  );

  const groupedContent = groupConsecutive(
    filteredNodes,
    isSpanAnchorOrEmojiImg,
  );

  const normalized = groupedContent.map((item, i) =>
    Array.isArray(item) ? (
      <div key={i} className="inline-block">
        {item}
      </div>
    ) : (
      item
    ),
  );

  return <>{normalized}</>;
}

function isEmojiImg(
  node: React.ReactNode,
): node is React.ReactElement<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "img"
> {
  return React.isValidElement(node) && node.type === "img";
}

function isSpanAnchorOrEmojiImg(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false;

  if (node.type === "span" || node.type === "a") {
    return true;
  }

  if (isEmojiImg(node)) {
    return (
      typeof node.props.src === "string" && node.props.src.includes("emoji")
    );
  }

  return false;
}

function groupConsecutive<T>(
  arr: T[],
  predicate: (item: T) => boolean,
): (T | T[])[] {
  const result: (T | T[])[] = [];
  let buffer: T[] = [];

  for (const x of arr) {
    if (predicate(x)) {
      buffer.push(x);
    } else {
      if (buffer.length > 0) {
        result.push(buffer);
        buffer = [];
      }
      result.push(x);
    }
  }

  if (buffer.length > 0) {
    result.push(buffer);
  }

  return result;
}

function partition<T>(arr: T[], predicate: (item: T) => boolean) {
  const keep = [];
  const extracted = [];

  for (const item of arr) {
    if (predicate(item)) {
      extracted.push(item);
    } else {
      keep.push(item);
    }
  }

  return [keep, extracted];
}

export function renderThreadSummary(
  raw: string | null | undefined,
): React.ReactNode {
  if (!raw) return null;

  let xml = raw.trim();

  // Ensure there is a single root element
  if (!xml.startsWith("<root")) {
    xml = `<root>${xml}</root>`;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const root = doc.documentElement;

  if (!root) {
    // Fallback: just show the raw text
    return (
      <span className="whitespace-pre-wrap wrap-break-word text-inherit">
        {raw}
      </span>
    );
  }

  const children = Array.from(root.childNodes);
  const nodes = children
    .filter((node) => node.nodeName != "VoteInfo")
    .map((node: any, idx: number) =>
      renderNode(node, `root-${idx}`, { square_img: true, hide_link: true }),
    );
  const [texts, imgs] = partition(nodes, isTiebaImg);

  return (
    <>
      <div className="line-clamp-4">{texts}</div>
      <div className="grid grid-cols-3 gap-2">{imgs.slice(0, 3)}</div>
    </>
  );
}

function isTiebaImg(node: React.ReactNode): boolean {
  if (isEmojiImg(node)) {
    return (
      typeof node.props.src === "string" &&
      node.props.src.includes("tieba-image")
    );
  }

  return false;
}

const sizeClassMap: Record<number, string> = {
  7: "h-7 w-7",
  8: "h-8 w-8",
  12: "h-12 w-12",
};

export function renderAvatar(
  hash: string | null | undefined,
  diameter: number = 8,
): React.ReactNode {
  if (!hash) return null;
  const src = `${IMAGE_URL_BASE}/${encodeURIComponent(hash)}`;
  const sizeClass = sizeClassMap[diameter] ?? "h-10 w-10";

  return (
    <img
      src={src}
      loading="lazy"
      alt={hash}
      className={`inline-block ${sizeClass} rounded-full object-cover align-middle`}
    />
  );
}

function renderNode(
  node: any,
  key: string,
  options?: { square_img?: boolean; hide_link?: boolean },
): React.ReactNode {
  const square_inline_img = options?.square_img ?? false;
  const hide_link = options?.hide_link ?? false;

  // 3 = TEXT_NODE
  if (node.nodeType === 3) {
    const text = node.nodeValue as string;
    if (!text) return null;
    return (
      <span key={key} className="whitespace-pre-wrap wrap-break-word text-inherit">
        {text}
      </span>
    );
  }

  // 1 = ELEMENT_NODE
  if (node.nodeType === 1) {
    const tagName = (node.nodeName || "").toLowerCase();

    if (tagName === "a") {
      const text: string = node.childNodes[0].nodeValue;

      if (hide_link)
        return (
          <span
            key={key}
            className="whitespace-pre-wrap wrap-break-word text-inherit"
          >
            {text}
          </span>
        );

      const href = node.getAttribute("href");

      return (
        <a href={href} key={key}>
          {text}
        </a>
      );
    }

    if (tagName === "at") {
      const href = node.getAttribute("hash");

      if (href === "0") {
        return null;
      }

      const text: string = node.childNodes[0].nodeValue;

      if (hide_link)
        return (
          <span
            key={key}
            className="whitespace-pre-wrap wrap-break-word text-inherit"
          >
            {text}
          </span>
        );

      return (
        <a href={`/user/${href}`} key={key}>
          {text}
        </a>
      );
    }

    if (tagName === "emoji") {
      const id = node.getAttribute("id"); // e.g. image_emoticon15
      const desc = node.getAttribute("desc") || "emoji";
      if (!id) return null;

      const src = `${EMOJI_URL_BASE}/${id}.png`;
      return (
        <img
          key={key}
          src={src}
          alt={desc}
          className="inline-block h-5 w-5 align-text-bottom mx-0.5"
        />
      );
    }

    if (tagName === "img") {
      const hash = node.getAttribute("hash") || "";
      const remoteSrc = node.getAttribute("src") || "";
      const alt = node.getAttribute("alt") || hash;

      let src: string | null = null;

      if (hash) {
        const local = findLocalImageByHash(hash);
        src = local ?? (remoteSrc || null);
        src = `${IMAGE_URL_BASE}/${encodeURIComponent(hash)}`;
      } else if (remoteSrc) {
        src = remoteSrc;
      }

      if (!src) return null;

      return (
        <img
          key={key}
          src={src}
          loading="lazy"
          alt={alt}
          className={
            square_inline_img
              ? "w-full aspect-square object-cover"
              : "max-w-full h-auto max-h-125 min-h-12.5 rounded-md"
          }
        />
      );
    }

    // Unknown tag: render its children recursively (ignore the tag itself)
    const children = Array.from(node.childNodes as any).map(
      (child: any, idx: number) =>
        renderNode(child, `${key}-${tagName}-${idx}`),
    );
    return <React.Fragment key={key}>{children}</React.Fragment>;
  }

  // Other node types: ignore
  return null;
}
