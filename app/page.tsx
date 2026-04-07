"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const id = (new FormData(form).get("threadId") as string | null)?.trim();
    if (!id) return;
    router.push(`/thread/${id}`);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Welcome</h2>

        <p className="text-gray-700 mb-4">
          Enter a thread ID to view a thread from your local SQLite database.
        </p>

        <form onSubmit={onSubmit} className="flex gap-2 mb-6">
          <input
            type="text"
            name="threadId"
            placeholder="Enter thread ID (e.g. 12345)"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            View
          </button>
        </form>

        <p className="text-sm text-gray-500">
          Or manually visit:{" "}
          <code className="bg-gray-200 px-2 py-1 rounded">
            /thread/&lt;id&gt;
          </code>
        </p>
      </main>
    </div>
  );
}
