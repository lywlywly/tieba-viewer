"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ThreadPagerProps = {
  threadId: string;
  firstFloor: number | null;
  lastFloor: number | null;
  hasPrev: boolean;
  hasNext: boolean;
  pageSize?: number;
};

const PAGER_NAV_KEY = "thread-pager-nav";

function markPagerNavigation() {
  sessionStorage.setItem(PAGER_NAV_KEY, "1");
}

export default function ThreadPager({
  threadId,
  firstFloor,
  lastFloor,
  hasPrev,
  hasNext,
  pageSize = 50,
}: ThreadPagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (sessionStorage.getItem(PAGER_NAV_KEY) !== "1") {
      return;
    }

    sessionStorage.removeItem(PAGER_NAV_KEY);

    const postsHeader = document.getElementById("posts");
    if (!postsHeader) {
      return;
    }

    const rect = postsHeader.getBoundingClientRect();

    // Only scroll when #posts is above the viewport.
    if (rect.top < 0) {
      postsHeader.scrollIntoView({
        block: "start",
        behavior: "auto",
      });
    }
  }, [pathname, searchParams]);

  function navigate(href: string) {
    markPagerNavigation();
    router.push(href, { scroll: false });
  }

  return (
    <nav className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-3 border-t bg-white p-3">
      <button
        type="button"
        onClick={() => navigate(`/thread/${threadId}?mode=start_at&floor=2`)}
        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        Jump to home
      </button>

      {hasPrev && firstFloor !== null ? (
        <button
          type="button"
          onClick={() =>
            navigate(`/thread/${threadId}?mode=before&floor=${firstFloor}`)
          }
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Prev {pageSize}
        </button>
      ) : (
        <span className="rounded border px-3 py-1.5 text-sm text-gray-400">
          Prev {pageSize}
        </span>
      )}

      {hasNext && lastFloor !== null ? (
        <button
          type="button"
          onClick={() =>
            navigate(`/thread/${threadId}?mode=after&floor=${lastFloor}`)
          }
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Next {pageSize}
        </button>
      ) : (
        <span className="rounded border px-3 py-1.5 text-sm text-gray-400">
          Next {pageSize}
        </span>
      )}

      <button
        type="button"
        onClick={() => navigate(`/thread/${threadId}?mode=last`)}
        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        Jump to last
      </button>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();

          const formData = new FormData(e.currentTarget);
          const floorValue = Number(formData.get("floor"));
          const safeFloor =
            Number.isInteger(floorValue) && floorValue >= 2 ? floorValue : 2;

          navigate(`/thread/${threadId}?mode=start_at&floor=${safeFloor}`);
        }}
      >
        <label htmlFor="floor" className="text-sm">
          Go to floor
        </label>
        <input
          id="floor"
          name="floor"
          type="number"
          min={2}
          defaultValue={firstFloor ?? 2}
          className="w-24 rounded border px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Go
        </button>
      </form>

      <span className="text-sm text-gray-600">
        {firstFloor !== null && lastFloor !== null
          ? `Showing floors ${firstFloor}–${lastFloor}`
          : "No posts"}
      </span>
    </nav>
  );
}
