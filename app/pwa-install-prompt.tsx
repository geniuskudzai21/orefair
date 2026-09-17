"use client";

import { useEffect, useState, type ReactNode } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "orefair-pwa-dismissed";

function isInstalled(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((navigator as unknown as { standalone?: boolean }).standalone) return true;
  return false;
}

export default function PwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (isInstalled()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    } else {
      dismiss();
    }
  };

  if (!visible) return null;

  const Icon: ReactNode = (
    <span className="flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-2xl bg-amber-600 text-lg font-extrabold text-white">
      O
    </span>
  );

  return (
    <div
      className="fixed inset-x-0 bottom-20 z-50 px-4 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:px-0"
      role="dialog"
      aria-label="Install OreFair app"
    >
      <div className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg shadow-black/10 backdrop-blur sm:max-w-sm lg:w-80 dark:border-zinc-700 dark:bg-zinc-900/95">
        {Icon}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Install OreFair</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Add to your home screen for faster access and offline use.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={install}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}