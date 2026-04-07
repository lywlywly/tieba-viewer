import ThreadCard from "@/components/ThreadCard";
import { getUserInfo, getUserThreads } from "@/lib/db";
import { renderAvatar } from "@/lib/renderContent";
import Link from "next/link";

export default async function userPagePage({
  params,
}: {
  params: Promise<{
    userId: number;
  }>;
}) {
  const { userId } = await params;
  const userInfo = getUserInfo(userId);
  const threads = getUserThreads(userId, 200);
  return (
    <div className="mx-auto w-full min-w-100 max-w-200">
      <div className="flex items-center gap-3">
        {renderAvatar(userInfo.avatar_large_hash, 12)}
        <div className="flex flex-col">
          <span>{userInfo.nickname}</span>
          <span>uid: {userInfo.uid}</span>
        </div>
      </div>
      <div className="space-y-3">
        {threads.map((t) => (
          <ThreadCard key={t.id} thread={t} show_forum_name={true} />
        ))}
      </div>
    </div>
  );
}
