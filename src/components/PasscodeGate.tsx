"use client";

import { useCallback, useEffect, useState } from "react";

/*
  Shared passcode plumbing for the admin tools. The code is remembered in
  localStorage under "flowycash-admin-pass" (same key the older composer/generator
  use, so unlocking one unlocks all). The server is the real gate
  (ADMIN_PASSCODE); this is just how the browser carries the code.
*/

export const PASS_KEY = "flowycash-admin-pass";

export function useAdminPasscode() {
  const [passcode, setPasscodeState] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem(PASS_KEY) || ""; } catch {}
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setPasscodeState(saved);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setPasscode = useCallback((v: string) => {
    try { localStorage.setItem(PASS_KEY, v); } catch {}
    setPasscodeState(v);
  }, []);

  const clearPasscode = useCallback(() => {
    try { localStorage.removeItem(PASS_KEY); } catch {}
    setPasscodeState("");
  }, []);

  return { passcode, hydrated, setPasscode, clearPasscode };
}

/** Headers for GET requests (no body to carry the passcode in). */
export function adminHeaders(passcode: string): Record<string, string> {
  return { "x-admin-passcode": passcode };
}

/** JSON fetch that throws the server's error message. */
export async function adminFetch<T = Record<string, unknown>>(
  passcode: string,
  url: string,
  init?: { method?: string; body?: Record<string, unknown> },
): Promise<T> {
  const method = init?.method || "GET";
  const res = await fetch(url, {
    method,
    headers: {
      ...adminHeaders(passcode),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify({ passcode, ...init.body }) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(data.error || `Failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

export function isAuthError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { status?: number }).status === 401;
}

export function PasscodeForm({
  prompt,
  msg,
  onUnlock,
}: {
  prompt: string;
  msg?: string;
  onUnlock: (v: string) => void;
}) {
  return (
    <form
      className="mx-auto max-w-sm text-center"
      onSubmit={(e) => {
        e.preventDefault();
        const v = ((new FormData(e.currentTarget).get("pass") as string) || "").trim();
        if (!v) return;
        onUnlock(v);
      }}
    >
      <p className="text-muted">{prompt}</p>
      {msg && <p className="mt-2 text-sm font-semibold text-berry">{msg}</p>}
      <input
        name="pass"
        type="password"
        autoComplete="current-password"
        placeholder="Passcode"
        aria-label="Admin passcode"
        className="mt-4 w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-center text-ink focus:border-accent focus:outline-none"
      />
      <button className="mt-3 w-full rounded-xl bg-accent px-6 py-3 font-bold text-accent-ink hover:bg-accent-strong">
        Unlock
      </button>
    </form>
  );
}
