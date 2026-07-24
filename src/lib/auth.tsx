import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { execute, select } from "./db";
import { hashPassword, verifyPassword } from "./hash";
import type { User, RolePermission } from "../types";

const STORAGE_KEY = "washsuite-current-user";

interface AuthContextValue {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  hasAccess: (pageKey: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [permittedPages, setPermittedPages] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // First run: the users table starts empty (password hashing happens in JS, so it can't be
      // seeded from a plain SQL migration) — bootstrap a default Owner so the app is usable at all.
      const [{ c }] = await select<{ c: number }>("SELECT COUNT(*) as c FROM users");
      if (c === 0) {
        const passwordHash = await hashPassword("admin123");
        await execute(
          "INSERT INTO users (branch_id, full_name, username, password_hash, role) VALUES (1, 'Owner', 'admin', ?, 'owner')",
          [passwordHash],
        );
      }

      const storedId = localStorage.getItem(STORAGE_KEY);
      if (storedId) {
        const [user] = await select<User>("SELECT * FROM users WHERE id = ? AND is_active = 1", [storedId]);
        if (user) {
          await loadUser(user);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function loadUser(user: User) {
    setCurrentUser(user);
    if (user.role === "owner") {
      setPermittedPages(new Set());
    } else {
      const rows = await select<RolePermission>("SELECT * FROM role_permissions WHERE role = ?", [user.role]);
      setPermittedPages(new Set(rows.map((r) => r.page_key)));
    }
  }

  async function login(username: string, password: string): Promise<string | null> {
    const [user] = await select<User>("SELECT * FROM users WHERE username = ? AND is_active = 1", [
      username.trim(),
    ]);
    if (!user) return "Invalid username or password.";
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return "Invalid username or password.";
    localStorage.setItem(STORAGE_KEY, String(user.id));
    await loadUser(user);
    return null;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentUser(null);
    setPermittedPages(new Set());
  }

  function hasAccess(pageKey: string): boolean {
    if (!currentUser) return false;
    if (currentUser.role === "owner") return true;
    return permittedPages.has(pageKey);
  }

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout, hasAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
