import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const LAST_ROUTE_KEY = "washsuite-last-route";

/**
 * Android can silently kill and recreate the app's WebView while it's backgrounded
 * (e.g. while the native camera is capturing a receipt photo). Tauri then reloads
 * index.html from scratch, HashRouter has no hash to restore, and the app lands on
 * "/" looking like the in-progress form vanished. This restores the last screen the
 * user was on so that kind of restart resumes instead of dumping them at Dashboard.
 */
export function RouteMemory() {
  const location = useLocation();
  const navigate = useNavigate();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = localStorage.getItem(LAST_ROUTE_KEY);
    const current = location.pathname + location.search;
    if (saved && saved !== current) {
      navigate(saved, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(LAST_ROUTE_KEY, location.pathname + location.search);
  }, [location]);

  return null;
}
