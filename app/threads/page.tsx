import OrderSelectClient from "@/components/OrderSelectClient";
import ThreadCard from "@/components/ThreadCard";
import UserComboboxClient from "@/components/UserComboboxClient";
import { getForumNames, getThreads } from "@/lib/db";

type Order = "Reply" | "Create";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; order?: string }>;
}) {
  const { name, order } = await searchParams;
  const sortOrder: Order = order === "Create" ? "Create" : "Reply";

  const [threads, forumOptions] = await Promise.all([
    getThreads(50, name, order),
    getForumNames(),
  ]);
  const options = forumOptions.map((e) => e.name);

  return (
    <div className="mx-auto w-full min-w-100 max-w-200 pt-2 space-y-3">
      <div className="flex gap-4">
        <div className="flex-1">
          <UserComboboxClient options={options} value={name ?? null} />
        </div>
        <div className="flex-1">
          <OrderSelectClient value={sortOrder} />
        </div>
      </div>
      <div className="space-y-3">
        {threads.map((t) => (
          <ThreadCard key={t.id} thread={t} user_link={true} />
        ))}
      </div>
    </div>
  );
}
