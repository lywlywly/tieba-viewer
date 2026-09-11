"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ThreadIdForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const id = (new FormData(form).get("threadId") as string | null)?.trim();
    if (!id || !/^\d+$/.test(id)) {
      setError("Enter a numeric thread ID.");
      return;
    }

    setError("");
    router.push(`/thread/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          name="threadId"
          placeholder="Enter thread ID (e.g. 12345)"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "thread-id-error" : undefined}
          onChange={() => error && setError("")}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 aria-invalid:border-red-500 aria-invalid:ring-red-500"
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          View
        </button>
      </div>
      {error && (
        <p id="thread-id-error" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
