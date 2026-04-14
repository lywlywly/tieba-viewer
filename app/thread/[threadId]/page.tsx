import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getThreadWithPostsAndCommentsByFloor,
  ThreadRow,
  PostWithComments,
} from "@/lib/db";
import { renderAvatar, renderTiebaContent } from "@/lib/renderContent";
import { formatUnix } from "@/lib/utils";
import { createPoll } from "@/components/ThreadCard";
import ThreadPager from "@/components/Pager";

interface ThreadPageProps {
  params: Promise<{
    threadId: string;
  }>;
  searchParams?: Promise<{
    floor?: string;
    mode?: string;
  }>;
}

// Make the component async so we can await params
export default async function ThreadPage({
  params,
  searchParams,
}: ThreadPageProps) {
  const { threadId } = await params; // params is a Promise in your Next version
  const resolvedSearchParams = (await searchParams) ?? {};

  const parsedThreadId = Number(threadId);
  const parsedFloor = Number(resolvedSearchParams.floor);
  const floor =
    Number.isInteger(parsedFloor) && parsedFloor >= 2 ? parsedFloor : 2;

  const mode =
    resolvedSearchParams.mode === "after" ||
    resolvedSearchParams.mode === "before" ||
    resolvedSearchParams.mode === "start_at" ||
    resolvedSearchParams.mode === "last"
      ? resolvedSearchParams.mode
      : "start_at";

  // Only allow numeric thread IDs
  if (!/^\d+$/.test(threadId)) {
    notFound();
  }

  const data = await getThreadWithPostsAndCommentsByFloor(
    parsedThreadId,
    floor,
    50,
    mode,
  );

  if (!data) {
    notFound(); // triggers the 404 page if no such thread
  }

  const { thread, posts, firstFloor, lastFloor, hasPrev, hasNext } = data;

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <ThreadHeader thread={thread} />

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3" id="posts">
            Posts ({posts.length})
          </h2>

          {posts.length === 0 ? (
            <div className="text-sm text-gray-500">
              No posts in this thread.
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((p, index) => (
                <PostCard key={p.id} post={p} index={index + 1} />
              ))}
            </div>
          )}
        </section>

        <ThreadPager
          threadId={threadId}
          firstFloor={firstFloor}
          lastFloor={lastFloor}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      </main>
    </div>
  );
}

function ThreadHeader({ thread }: { thread: ThreadRow }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {thread.title || `Thread ${thread.id}`}
          </h1>
          <div className="mt-1 text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/user/${thread.author_id}`}
              className=" text-inherit no-underline"
            >
              {renderAvatar(thread.author_avatar)}
            </Link>
            <Link
              href={`/user/${thread.author_id}`}
              className=" text-inherit no-underline"
            >
              {thread.author_name || "Unknown"}
            </Link>
            {thread.created_at && (
              <span>• {formatUnix(thread.created_at)}</span>
            )}
            {thread.forum_name && (
              <span className="text-gray-400">in {thread.forum_name}</span>
            )}
          </div>
        </div>
        <div>
          <Link
            href="/"
            className="block text-sm text-blue-600 hover:underline"
          >
            ← Back
          </Link>
          <Link
            href={`https://tieba.baidu.com/p/${thread.id}`}
            className="block text-sm text-blue-600 hover:underline"
          >
            ↗ View in Baidu Tieba
          </Link>
        </div>
      </div>

      {thread.content && (
        <div className="thread-content mt-3 bg-white rounded-md shadow p-4">
          <div className="text text-gray-800 text-sm space-y-2">
            {renderTiebaContent(thread.content)}
            {createPoll(thread.content)}
          </div>
        </div>
      )}
    </section>
  );
}

function PostCard({ post, index }: { post: PostWithComments; index: number }) {
  return (
    <article
      id={`post-${post.id}`}
      className="post bg-white rounded-md shadow p-3"
    >
      <header className="flex items-start justify-between mb-1">
        <div>
          <div className="flex text-sm font-medium text-gray-800 gap-2 items-center mb-0.5">
            <Link href={`/user/${post.author_id}`}>
              {renderAvatar(post.author_avatar)}
            </Link>
            <Link
              href={`/user/${post.author_id}`}
              className="no-underline text-inherit"
            >
              {post.author_name || "Unknown"}
            </Link>
          </div>
          <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {post.created_at && <span>{formatUnix(post.created_at)}</span>}
            <span className="text-gray-400">Floor #{post.floor}</span>
          </div>
        </div>
        {/* <span className="text-xs text-gray-400">#{index}</span> */}
      </header>

      <div className="text text-sm text-gray-900 whitespace-pre-wrap wrap-break-word space-y-2">
        {renderTiebaContent(post.content)}
      </div>

      {post.comments.length > 0 && (
        <section className="mt-3 border-l border-gray-200 pl-3">
          <div className="text-xs text-gray-500 mb-1">
            {post.comments.length} comment
            {post.comments.length > 1 ? "s" : ""}
          </div>
          <div className="space-y-1">
            {post.comments.map((c) => (
              <div
                key={c.id}
                id={`comment-${c.id}`}
                className="comment bg-gray-50 rounded-md px-2 py-1.5"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex text-xs font-medium text-gray-800 gap-2 items-center">
                    <Link href={`/user/${c.author_id}`}>
                      {renderAvatar(c.author_avatar, 7)}
                    </Link>
                    <Link
                      href={`/user/${c.author_id}`}
                      className="no-underline text-inherit"
                    >
                      {c.author_name || "Unknown"}
                    </Link>
                  </div>
                  {c.created_at && (
                    <div className="text-[11px] text-gray-500">
                      {formatUnix(c.created_at)}
                    </div>
                  )}
                </div>
                <div className="text text-xs text-gray-800 whitespace-pre-wrap wrap-break-word">
                  {c.reply_to != 0
                    ? `reply to ${c.reply_to_author_name}: `
                    : ""}
                  {renderTiebaContent(c.content)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
