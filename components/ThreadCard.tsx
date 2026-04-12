import { ThreadRow } from "@/lib/db";
import { renderAvatar, renderThreadSummary } from "@/lib/renderContent";
import { formatUnix } from "@/lib/utils";
import { ArrowUp, MessageCircle } from "lucide-react";
import Link from "next/link";
import { DOMParser } from "@xmldom/xmldom";

export default function ThreadCard({
  thread,
  show_forum_name,
  user_link,
  show_avatar = true,
  show_author_name = true,
}: {
  thread: ThreadRow;
  show_forum_name?: boolean;
  user_link?: boolean;
  show_avatar?: boolean;
  show_author_name?: boolean;
}) {
  const authorHref = `/user/${thread.author_id}`;

  return (
    <article className="relative rounded-md border bg-white p-3 text-sm shadow-sm transition-colors hover:bg-gray-100/70">
      <Link
        href={`/thread/${thread.id}`}
        prefetch={false}
        className="absolute inset-0 no-underline text-inherit"
      />

      <div className={`flex items-start ${show_avatar ? "gap-3" : "gap-0"}`}>
        {user_link ? (
          <>
            {show_avatar && (
              <Link
                href={authorHref}
                prefetch={false}
                className="relative mt-0.5 text-inherit no-underline"
              >
                {renderAvatar(thread.author_avatar)}
              </Link>
            )}
            <Link
              href={authorHref}
              prefetch={false}
              className="relative text-inherit no-underline"
            >
              {show_author_name && (
                <div className="font-medium text-gray-900">
                  {thread.author_name || "Unknown"}
                </div>
              )}
              <div className="text-xs text-gray-500">
                {formatUnix(thread.created_at)}
                {show_forum_name ? " in " + thread.forum_name : ""}
              </div>
            </Link>
          </>
        ) : (
          <>
            {show_avatar && (
              <span className="mt-0.5 text-inherit no-underline">
                {renderAvatar(thread.author_avatar)}
              </span>
            )}
            <span className="text-inherit no-underline">
              {show_author_name && (
                <div className="font-medium text-gray-900">
                  {thread.author_name || "Unknown"}
                </div>
              )}
              <div className="text-xs text-gray-500">
                {formatUnix(thread.created_at)}
                {show_forum_name ? " in " + thread.forum_name : ""}
              </div>
            </span>
          </>
        )}
      </div>

      <div className="mt-2 space-y-2">
        <h3 className="text-sm leading-snug font-semibold text-gray-900">
          {thread.title || `Thread ${thread.id}`}
        </h3>
        {renderThreadSummary(thread.content)}
        {createPoll(thread.content)}
        <StatsBar upvote_num={thread.agree} reply_num={thread.reply_num} />
      </div>
    </article>
  );
}

export function StatsBar({
  upvote_num,
  reply_num,
}: {
  upvote_num: number;
  reply_num: number;
}) {
  return (
    <div className="flex items-center gap-2 text-gray-500">
      {/* vote */}
      <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">
        <ArrowUp className="h-4 w-4" />
        <span className="text-sm font-medium text-gray-700">{upvote_num}</span>
        {/* <ArrowDown className="h-4 w-4 cursor-pointer" /> */}
      </div>

      {/* comment */}
      <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1">
        <MessageCircle className="h-4 w-4" />
        <span className="text-sm font-medium text-gray-700">{reply_num}</span>
      </div>
    </div>
  );
}

type PollOption = {
  label: string;
  votes: number;
  selected?: boolean;
};

type PollProps = {
  title: string;
  options: PollOption[];
  caption?: string;
};

export function createPoll(thread_content: string) {
  const xml = thread_content.trim();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const votes = doc.getElementsByTagName("VoteInfo");
  const hasVote = votes.length == 1;
  if (!hasVote) return null;
  const vote = votes[0];
  //   console.log("title", root.getAttribute("title"));
  //   console.log("total_vote", root.getAttribute("total_vote"));
  //   console.log("total_user", root.getAttribute("total_user"));
  //   const children = Array.from(root.childNodes[0].childNodes as any);
  //   console.log("length", children.length);
  //   console.log(children);
  //   console.log(children[0].childNodes[0].tagName);
  //   console.log(children[0].childNodes[0].textContent);
  //   console.log(root.getElementsByTagName("item")[0].textContent);
  //   console.log(root.getElementsByTagName("item")[1].textContent);

  const optionsEl = doc.getElementsByTagName("options")[0];
  const itemNodes = optionsEl.getElementsByTagName("item");

  const items = Array.from(itemNodes).map((item) => {
    const voteNumEl = item.getElementsByTagName("vote_num")[0];
    const textEl = item.getElementsByTagName("text")[0];

    return {
      votes: Number(voteNumEl?.textContent ?? 0),
      label: (textEl?.textContent ?? "").trim(),
    };
  });

  const title: string = vote.getAttribute("title")!;
  const total_user = Number(vote.getAttribute("total_user"));
  return (
    <Poll
      title={title}
      caption={`${total_user} people voted`}
      options={items}
    />
  );
}

function Poll({ title, caption, options }: PollProps) {
  const total = options.reduce((s, o) => s + o.votes, 0);

  return (
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-4">
      {/* title */}
      <div className="mb-3 text-sm font-semibold text-gray-800">{title}</div>

      {/* options */}
      <div className="space-y-2">
        {options.map((o, i) => {
          const percent = total ? Math.round((o.votes / total) * 100) : 0;

          return (
            <div
              key={i}
              className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
            >
              {/* progress */}
              <div
                className={`absolute inset-y-0 left-0 ${
                  o.selected ? "bg-blue-100" : "bg-gray-200"
                }`}
                style={{ width: `${percent}%` }}
              />

              {/* content */}
              <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                <div
                  className={`flex items-center gap-1 ${
                    o.selected ? "text-blue-600" : "text-gray-800"
                  }`}
                >
                  <span>{o.label}</span>
                  {o.selected && <span>✓</span>}
                </div>

                <div className="text-gray-500">
                  {o.votes} | {percent}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* caption */}
      {caption && <div className="mt-3 text-xs text-gray-500">{caption}</div>}
    </div>
  );
}
