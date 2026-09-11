import ThreadIdForm from "@/components/ThreadIdForm";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Welcome</h2>

        <p className="text-gray-700 mb-4">
          Enter a thread ID to view a thread from your local SQLite database.
        </p>

        <ThreadIdForm />

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
