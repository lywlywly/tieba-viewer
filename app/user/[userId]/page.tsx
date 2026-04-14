import ThreadCard from "@/components/ThreadCard";
import {
  getUserInfo,
  getUserOverviewActivities,
  getUserPostAndCommentActivities,
  getUserThreads,
  type ThreadRow,
  type UserCommentFeedItem,
  type UserOverviewItem,
} from "@/lib/db";
import { renderAvatar, renderTiebaContent } from "@/lib/renderContent";
import { formatUnix } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

type UserTab = "overview" | "threads" | "comments";
type UserFeedItem = UserCommentFeedItem;
const USER_ACTIVITY_LIMIT = 200;
const THREAD_CARD_PROFILE_PROPS = {
  show_forum_name: true,
  show_avatar: false,
  show_author_name: false,
} as const;

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{
    userId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
}) {
  const { userId } = await params;
  if (!/^\d+$/.test(userId)) {
    notFound();
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const tab = normalizeTab(resolvedSearchParams.tab);

  const parsedUserId = Number(userId);
  let userInfo;
  try {
    userInfo = await getUserInfo(parsedUserId);
  } catch {
    notFound();
  }

  const [threads, commentFeed, overview] = await Promise.all([
    tab === "threads"
      ? getUserThreads(parsedUserId, USER_ACTIVITY_LIMIT)
      : Promise.resolve([]),
    tab === "comments"
      ? getUserPostAndCommentActivities(parsedUserId, USER_ACTIVITY_LIMIT)
      : Promise.resolve([]),
    tab === "overview"
      ? getUserOverviewActivities(parsedUserId, USER_ACTIVITY_LIMIT)
      : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto w-full min-w-100 max-w-200 space-y-4 pt-2">
      <section className="flex min-w-0 items-center gap-3 px-1 pt-1">
        <div className="shrink-0 rounded-full ring-1 ring-gray-200">
          {renderAvatar(userInfo.avatar_large_hash, 12)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-2xl font-semibold text-gray-900">
            {userInfo.nickname}
          </div>
          {userInfo.username && userInfo.username !== userInfo.nickname && (
            <div className="truncate text-sm text-gray-500">
              @{userInfo.username}
            </div>
          )}
          <div className="text-sm text-gray-500">uid: {userInfo.uid}</div>
        </div>
      </section>

      <nav className="flex items-center gap-2 border-b pb-2">
        <TabLink userId={userId} tab="overview" currentTab={tab} />
        <TabLink userId={userId} tab="threads" currentTab={tab} />
        <TabLink userId={userId} tab="comments" currentTab={tab} />
      </nav>

      <div className="space-y-3 pb-6">
        {tab === "threads" &&
          threads.map((t) => (
            <ThreadCard key={t.id} thread={t} {...THREAD_CARD_PROFILE_PROPS} />
          ))}

        {tab === "comments" &&
          commentFeed.map((item) => (
            <ActivityCard key={activityKey(item)} item={item} />
          ))}

        {tab === "overview" &&
          overview.map((item) =>
            item.kind === "thread" ? (
              <ThreadCard
                key={activityKey(item)}
                thread={activityThreadToThreadRow(item, userInfo.nickname)}
                {...THREAD_CARD_PROFILE_PROPS}
              />
            ) : (
              <ActivityCard key={activityKey(item)} item={item} />
            ),
          )}
      </div>
    </div>
  );
}

function normalizeTab(input: string | undefined): UserTab {
  if (input === "posts") {
    return "threads";
  }

  if (input === "threads" || input === "comments") {
    return input;
  }

  return "overview";
}

function TabLink({
  userId,
  tab,
  currentTab,
}: {
  userId: string;
  tab: UserTab;
  currentTab: UserTab;
}) {
  const active = tab === currentTab;
  const title = tab[0].toUpperCase() + tab.slice(1);

  return (
    <Link
      href={`/user/${userId}?tab=${tab}`}
      className={`rounded-full px-4 py-1.5 text-sm ${
        active
          ? "bg-gray-800 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {title}
    </Link>
  );
}

function activityKey(item: UserOverviewItem | UserFeedItem): string {
  if (item.kind === "thread") {
    return `thread-${item.thread_id}`;
  }
  if (item.kind === "post") {
    return `post-${item.post_id}`;
  }
  return `comment-${item.comment_id}`;
}

function activityThreadToThreadRow(
  item: Extract<UserOverviewItem, { kind: "thread" }>,
  authorName: string,
): ThreadRow {
  return {
    id: item.thread_id,
    title: item.thread_title,
    content: item.thread_content,
    author_id: item.author_id,
    created_at: item.created_at,
    updated_at: item.created_at,
    forum_id: 0,
    forum_name: item.forum_name,
    author_name: authorName,
    author_avatar: null,
    view_num: 0,
    reply_num: item.reply_num,
    share_num: 0,
    agree: item.agree,
    disagree: item.disagree,
  };
}

function ActivityCard({ item }: { item: UserFeedItem }) {
  return (
    <article className="rounded-md border bg-white p-3 text-sm shadow-sm space-y-2 transition-colors hover:bg-gray-100/70">
      <div className="text-xs text-gray-500">
        <span>{formatUnix(item.created_at)}</span>
        {item.forum_name ? (
          <span className="ml-2">in {item.forum_name}</span>
        ) : null}
      </div>

      <div className="text-sm text-gray-700">
        {item.kind === "post"
          ? "posted in"
          : `commented${item.reply_to_author_name ? ` on ${item.reply_to_author_name}` : ""}`}{" "}
        <Link
          href={`/thread/${item.thread_id}`}
          className="font-medium text-gray-900"
        >
          {item.thread_title || `Thread ${item.thread_id}`}
        </Link>
      </div>

      <div className="text-sm text-gray-900 whitespace-pre-wrap wrap-break-word space-y-2">
        {renderTiebaContent(item.content)}
      </div>

      <div>
        <Link
          href={activityHref(item)}
          className="text-xs text-blue-600 hover:underline"
        >
          Open in thread
        </Link>
      </div>
    </article>
  );
}

function activityHref(item: UserFeedItem | UserOverviewItem): string {
  if (item.kind === "post") {
    return `/thread/${item.thread_id}?mode=start_at&floor=${item.floor}#post-${item.post_id}`;
  }

  if (item.kind === "comment") {
    return `/thread/${item.thread_id}?mode=start_at&floor=${item.post_floor}#comment-${item.comment_id}`;
  }

  return `/thread/${item.thread_id}`;
}
