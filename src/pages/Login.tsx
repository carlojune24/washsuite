import { useState, type FormEvent } from "react";
import { WashingMachine } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await login(username, password);
    if (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-page px-6">
      <div className="mb-8 flex flex-col items-center">
        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-sm">
          <WashingMachine size={28} strokeWidth={1.8} />
        </span>
        <h1 className="text-xl font-bold text-ink">WashSuite</h1>
        <p className="mt-0.5 text-sm text-ink/60">Sign in to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>
        <label className="block rounded-2xl bg-surface p-3.5 shadow-sm">
          <span className="mb-1 block text-xs font-medium text-ink/50">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full text-sm font-medium text-ink outline-none"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
