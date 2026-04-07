import Link from "next/link";
import {
  searchThreadsWithKeywordAndScopes,
  ThreadSearchWithCounts,
} from "@/lib/db";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    deep?: string; // "1" means include posts & comments
    f?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, deep, f } = await searchParams;
  const keyword = (q ?? "").trim();
  const includeDeep = deep === "1"; // include posts & comments
  const forum = (f ?? "").trim();

  const includePosts = includeDeep;
  const includeComments = includeDeep;

  let results: ThreadSearchWithCounts[] = [];

  if (keyword) {
    results = searchThreadsWithKeywordAndScopes(
      keyword,
      includePosts,
      includeComments,
      forum,
      200,
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Search</h2>

        <SearchForm
          initialKeyword={keyword}
          initialDeep={includeDeep}
          forum={forum}
        />

        {!keyword ? (
          <p className="text-sm text-gray-500">
            Enter a keyword to search thread titles and content. Enable{" "}
            <strong>Include posts &amp; comments</strong> to also find matches
            inside replies and comments.
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-gray-500">
            No threads found containing <strong>{keyword}</strong>.
          </p>
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm text-gray-600">
              Found {results.length} thread
              {results.length > 1 ? "s" : ""} containing{" "}
              <strong>{keyword}</strong>
              {includeDeep && " (threads/posts/comments)"}:
            </h2>
            <div className="space-y-3">
              {results.map((t) => (
                <ThreadSearchCard key={t.id} thread={t} keyword={keyword} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SearchForm({
  initialKeyword,
  initialDeep,
  forum,
}: {
  initialKeyword: string;
  initialDeep: boolean;
  forum: string;
}) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      action="/search"
      method="get"
    >
      <div className="flex-1 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={initialKeyword}
          placeholder="Search in thread titles and content..."
          className="flex-3 rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          name="f"
          defaultValue={forum}
          placeholder="Forum name..."
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Search
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          name="deep"
          value="1"
          defaultChecked={initialDeep}
          className="h-3 w-3 rounded border-gray-300"
        />
        <span>Include posts &amp; comments</span>
      </label>
    </form>
  );
}

function ThreadSearchCard({
  thread,
  keyword,
}: {
  thread: ThreadSearchWithCounts;
  keyword: string;
}) {
  const snippetSource = getSnippetSource(thread, keyword);
  const snippet =
    snippetSource && keyword
      ? makeSnippet(snippetSource, keyword, 160)
      : snippetSource;

  const hasThreadMatch = thread.thread_match;
  const postCount = thread.post_match_count;
  const commentCount = thread.comment_match_count;

  return (
    <article className="bg-white rounded-md shadow p-3 text-sm">
      <header className="mb-1 flex items-center justify-between gap-2">
        <Link
          href={`/thread/${thread.id}`}
          className="font-semibold text-gray-900 hover:underline"
        >
          {highlight(thread.title, keyword)}
        </Link>
        <span className="text-[11px] text-gray-500">
          {formatUnix(thread.created_at)}
        </span>
      </header>

      <div className="text-xs text-gray-500 mb-1 flex flex-wrap gap-x-2 gap-y-1">
        <span>{thread.author_name || "Unknown"}</span>
        {thread.forum_name && (
          <span className="text-gray-400">in {thread.forum_name}</span>
        )}
      </div>

      {snippet && (
        <p className="mt-1 text-xs text-gray-800 line-clamp-3">
          {highlight(snippet, keyword)}
        </p>
      )}

      {/* match summary label */}
      <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
        {hasThreadMatch && <span>Matches thread</span>}
        {postCount > 0 && (
          <span>
            {postCount} matching post{postCount > 1 ? "s" : ""}
          </span>
        )}
        {commentCount > 0 && (
          <span>
            {commentCount} matching comment{commentCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </article>
  );
}

function getSnippetSource(
  thread: ThreadSearchWithCounts,
  keyword: string,
): string | "" {
  const k = keyword.toLowerCase();
  const candidates: (string | null | undefined)[] = [];

  // 1) If the thread itself matches, prefer its content
  if (thread.thread_match && thread.content) {
    candidates.push(thread.content);
  } else {
    // 2) Otherwise prefer first matching post, then first matching comment
    if (thread.post_match_count > 0 && thread.post_match_sample_content) {
      candidates.push(thread.post_match_sample_content);
    }
    if (thread.comment_match_count > 0 && thread.comment_match_sample_content) {
      candidates.push(thread.comment_match_sample_content);
    }
  }

  for (const raw of candidates) {
    if (!raw) continue;
    const plain = stripXmlTags(raw);
    if (!keyword) return plain;
    if (plain.toLowerCase().includes(k)) {
      return plain;
    }
  }

  // Fallback: just strip the thread content (might not contain keyword)
  if (thread.content) {
    return stripXmlTags(thread.content);
  }
  return "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, keyword: string) {
  if (!keyword) return text;

  const pattern = escapeRegExp(keyword);
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  const lowerKeyword = keyword.toLowerCase();

  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lowerKeyword ? (
          <mark key={i} className="bg-yellow-200 text-inherit rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function stripXmlTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, "");
}

function safeSlice(text: string, start: number, end: number) {
  // careful about multiple byte Unicode bugs
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...seg.segment(text)].map((x) => x.segment);
  return graphemes.slice(start, end).join("");
}

function makeSnippet(text: string, keyword: string, maxLen: number): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const k = keyword.toLowerCase();
  const idx = k ? lower.indexOf(k) : -1;

  if (idx === -1 || !keyword) {
    return text.length > maxLen ? safeSlice(text, 0, maxLen) + "..." : text;
  }

  const start = Math.max(0, idx - Math.floor(maxLen / 3));
  const end = Math.min(text.length, start + maxLen);
  let snippet = safeSlice(text, start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

function formatUnix(ts: number): string {
  const d = new Date(ts * 1000);
  return safeSlice(d.toISOString().replace("T", " "), 0, 19);
}
