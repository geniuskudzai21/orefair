"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

interface ReferencePrice {
  key: string;
  name: string;
  pricePerGram: number;
  currency: string;
  source: string | null;
}

interface Appraisal {
  mineralType: string;
  mineralName: string;
  quality: string;
  qualityScore: number;
  confidence: number;
  notes: string;
  rawType: string;
}

interface TransactionData {
  $schema?: string;
  recordedAt?: string;
  appraisal: Appraisal;
  weightGrams: number;
  pricePerGram: number | null;
  ratePerGram: number | null;
  qualityMultiplier: number | null;
  totalPrice: number | null;
  currency: string;
  priceStatus: string;
  imageHash?: string;
  originalFilename?: string;
}

interface LedgerBlock {
  blockIndex: number;
  data: TransactionData;
  timestamp: string;
  previousHash: string;
  hash: string;
}

interface Verification {
  valid: boolean;
  blocksChecked: number;
  headMatches: boolean;
  firstInvalidBlock: number | null;
  headHash: string;
  checkedAt: string;
}

interface TransactionsResponse {
  configured: boolean;
  transactions: LedgerBlock[];
  referencePrices: ReferencePrice[];
  verification: Verification | null;
  error?: string;
}

interface AnalyzeResponse {
  ok: boolean;
  appraisal: Appraisal;
  referencePrice: ReferencePrice | null;
  ratePerGram: number | null;
  qualityMultiplier: number | null;
  priceStatus: string;
  error?: string;
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatMoney(value: number): string {
  return money.format(value);
}

function truncateHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : hash;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function renderToJpeg(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas is not supported in this browser."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode that image file."));
    };
    img.src = url;
  });
}

async function prepareImage(file: File): Promise<
  { dataUrl: string; imageHash: string; name: string } | { error: string }
> {
  if (file.size > 8 * 1024 * 1024) return { error: "File too large (max 8 MB)." };
  const originalBytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", originalBytes);
  const dataUrl = await renderToJpeg(file, 1024, 0.85);
  return { dataUrl, imageHash: bytesToHex(digest), name: file.name };
}

function qualityTone(quality: string): { label: string; classes: string } {
  const q = quality.toLowerCase();
  if (q.includes("clean")) return { label: "Clean sample", classes: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (q.includes("minor")) return { label: "Minor impurities", classes: "bg-amber-100 text-amber-800 border-amber-200" };
  if (q.includes("high")) return { label: "High visible impurities", classes: "bg-rose-100 text-rose-800 border-rose-200" };
  return { label: "Cannot assess", classes: "bg-zinc-100 text-zinc-700 border-zinc-200" };
}

function CameraCapture({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [camError, setCamError] = useState<string | null>(null);

  const start = useCallback(async (mode: "environment" | "user") => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamError(null);
    } catch {
      setCamError("Camera unavailable or permission denied.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await start("environment");
      if (cancelled) streamRef.current?.getTracks().forEach((t) => t.stop());
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [start]);

  const flip = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    start(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border bg-white p-5 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">{facingMode === "environment" ? "Back camera" : "Front camera"}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 text-center text-sm text-white">
              {camError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={flip}
            className="rounded-lg border px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Flip camera
          </button>
          <button
            type="button"
            onClick={capture}
            aria-label="Capture photo"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white ring-4 ring-amber-500 focus:outline-none"
          >
            <span className="h-10 w-10 rounded-full border-2 border-amber-600 bg-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

const NAV_TABS: { id: "sample" | "rates" | "ledger"; label: string; icon: ReactNode }[] = [
  {
    id: "sample",
    label: "New sample",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    ),
  },
  {
    id: "rates",
    label: "Rates",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h.008v.008H3.75zM3.75 12h.008v.008H3.75zM3.75 17.25h.008v.008H3.75z" />
      </svg>
    ),
  },
];

export default function Home() {
  const [image, setImage] = useState<{ dataUrl: string; imageHash: string; name: string } | null>(null);
  const [busy, setBusy] = useState<"analyzing" | "submitting" | "verifying" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);
  const [refPerGram, setRefPerGram] = useState<number | null>(null);
  const [ratePerGram, setRatePerGram] = useState<number | null>(null);
  const [qualityMult, setQualityMult] = useState<number | null>(null);
  const [priceStatus, setPriceStatus] = useState<string>("not_analyzed");
  const [weight, setWeight] = useState("");
  const [ledger, setLedger] = useState<LedgerBlock[]>([]);
  const [refPrices, setRefPrices] = useState<ReferencePrice[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [dbConfigured, setDbConfigured] = useState(false);
  const [lastBlock, setLastBlock] = useState<LedgerBlock | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [activeTab, setActiveTab] = useState<"sample" | "rates" | "ledger">("sample");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchLedger(): Promise<TransactionsResponse | null> {
    try {
      const res = await fetch("/api/transactions?limit=30");
      return (await res.json()) as TransactionsResponse;
    } catch {
      return null;
    }
  }

  const applyLedgerData = (data: TransactionsResponse | null) => {
    if (!data) {
      setDbConfigured(false);
      setError("Could not reach the API.");
      return;
    }
    if (data.configured) {
      setLedger(data.transactions ?? []);
      setRefPrices(data.referencePrices ?? []);
      setVerification(data.verification ?? null);
      setDbConfigured(true);
      setError(null);
    } else {
      setDbConfigured(false);
      setError(data.error ?? null);
    }
  };

  const loadLedger = async () => {
    applyLedgerData(await fetchLedger());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchLedger();
      if (!cancelled) applyLedgerData(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetSampleState = () => {
    setError(null);
    setAppraisal(null);
    setRefPerGram(null);
    setRatePerGram(null);
    setQualityMult(null);
    setPriceStatus("not_analyzed");
    setLastBlock(null);
  };

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    resetSampleState();

    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPEG, PNG, WebP).");
      return;
    }

    const prepared = await prepareImage(file);
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }
    setImage(prepared);
    e.target.value = "";
  }

  async function handleCameraCapture(dataUrl: string) {
    setShowCamera(false);
    resetSampleState();
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      const prepared = await prepareImage(file);
      if ("error" in prepared) {
        setError(prepared.error);
        return;
      }
      setImage(prepared);
    } catch {
      setError("Could not process the captured photo.");
    }
  }

  async function handleAnalyze() {
    if (!image) {
      setError("Upload a photo of the sample first.");
      return;
    }
    setBusy("analyzing");
    setError(null);
    setLastBlock(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: image.dataUrl }),
      });
      const data: AnalyzeResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Image analysis failed.");
      setAppraisal(data.appraisal);
      setRefPerGram(data.referencePrice?.pricePerGram ?? null);
      setRatePerGram(data.ratePerGram ?? null);
      setQualityMult(data.qualityMultiplier ?? null);
      setPriceStatus(data.priceStatus === "catalogued" ? "catalogued" : "no_reference_price");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image analysis failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!appraisal) {
      setError("Analyze the photo first.");
      return;
    }
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      setError("Enter a valid weight in grams.");
      return;
    }
    if (!dbConfigured) {
      setError("Ledger storage is not configured. Add DATABASE_URL to .env.local.");
      return;
    }
    setBusy("submitting");
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appraisal,
          weightGrams: w,
          imageHash: image?.imageHash,
          originalFilename: image?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record the transaction.");
      setLastBlock(data.transaction as LedgerBlock);
      setImage(null);
      setAppraisal(null);
      setRefPerGram(null);
      setRatePerGram(null);
      setQualityMult(null);
      setPriceStatus("not_analyzed");
      setWeight("");
      await loadLedger();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleVerify() {
    setBusy("verifying");
    setError(null);
    try {
      const res = await fetch("/api/chain");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not verify the chain.");
      setVerification(data.verification as Verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chain verification failed.");
    } finally {
      setBusy(null);
    }
  }

  const previewTotal = useMemo(() => {
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0 || ratePerGram == null) return null;
    return ratePerGram * w;
  }, [weight, ratePerGram]);

  const quality = appraisal ? qualityTone(appraisal.quality) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 pb-24 sm:px-6 lg:gap-5 lg:px-8 lg:py-6 lg:pb-10">
      <header className="sticky top-0 z-40 -mx-4 mb-1 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90 lg:static lg:mx-0 lg:mb-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 select-none items-center justify-center rounded-xl bg-amber-600 text-base font-extrabold text-white">
              O
            </span>
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
                Ore<span className="text-amber-600">Fair</span>
              </h1>
              <p className="hidden text-[11px] text-zinc-500 sm:block dark:text-zinc-400">
                AI fair pricing · tamper-evident ledger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {verification && (
              <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm dark:bg-zinc-900">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    verification.valid ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <span className="text-xs font-semibold">
                  {verification.valid ? "Chain verified" : "Integrity FAILED"}
                </span>
              </div>
            )}
            {!dbConfigured && (
              <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 sm:inline dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                DB not configured
              </span>
            )}
          </div>
        </div>
      </header>

      {!dbConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Ledger storage is not configured. Set DATABASE_URL (Neon Postgres) in .env.local, then run{" "}
          <code className="rounded bg-black/5 px-1 font-mono dark:bg-white/10">npm run db:init</code>.
          Analyze still works once GEMINI_API_KEY is set.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {error}
        </div>
      )}

      <main className="grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
        <section className={`space-y-4 self-start ${activeTab === "sample" ? "" : "hidden"} lg:block`}>
          <div className="rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">New sample</h2>
              <p className="text-xs text-zinc-500">Step 1 - photograph the ore sample.</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {image ? (
              <div className="mt-3 flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.dataUrl}
                  alt="Ore sample preview"
                  className="h-24 w-24 shrink-0 rounded-xl border object-cover sm:h-28 sm:w-28"
                />
                <div className="flex flex-col justify-between py-0.5">
                  <div>
                    <div className="truncate text-sm font-medium">{image.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                      sha256 {truncateHash(image.imageHash)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null);
                        setAppraisal(null);
                        setRefPerGram(null);
                        setRatePerGram(null);
                        setQualityMult(null);
                        setPriceStatus("not_analyzed");
                      }}
                      className="rounded-md border px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Replace photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="rounded-md border px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Retake
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-6 text-center transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-amber-500 dark:hover:bg-amber-950/20 lg:py-4"
                >
                  <svg className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm font-medium">Upload a photo of the sample</span>
                  <span className="text-xs text-zinc-400">JPEG, PNG or WebP · max 8 MB</span>
                </button>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  <span className="text-xs text-zinc-400">or</span>
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-amber-950/20 lg:w-auto lg:self-start lg:px-6"
                >
                  Take photo with camera
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!image || busy !== null}
              className="mt-6 w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto lg:min-w-56 lg:self-start lg:px-10"
            >
              {busy === "analyzing" ? "Analyzing..." : "Analyze sample with AI"}
            </button>

            {appraisal && (
              <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-400 dark:bg-zinc-800">
                    {appraisal.mineralType}
                  </span>
                  <span className="text-sm font-semibold">{appraisal.mineralName}</span>
                  {quality && (
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${quality.classes}`}>
                      {quality.label}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800">
                    <div className="text-[11px] text-zinc-500">Identification confidence</div>
                    <div className="mt-0.5 font-semibold">{Math.round(appraisal.confidence * 100)}%</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800">
                    <div className="text-[11px] text-zinc-500">Visual quality score</div>
                    <div className="mt-0.5 font-semibold">{appraisal.qualityScore.toFixed(2)} / 1.00</div>
                  </div>
                </div>

                {appraisal.notes && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{appraisal.notes}</p>
                )}

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800">
                  {priceStatus === "catalogued" && refPerGram !== null ? (
                    <div className="space-y-1">
                      <div>
                        <span className="text-zinc-500">Reference rate: </span>
                        <span className="font-semibold">{formatMoney(refPerGram)} / gram</span>
                      </div>
                      {qualityMult != null && (
                        <div>
                          <span className="text-zinc-500">Quality adjustment: </span>
                          <span className="font-semibold">×{qualityMult.toFixed(2)}</span>
                          {ratePerGram != null && (
                            <span className="text-zinc-500">
                              {" "}→ <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(ratePerGram)} / gram</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className="text-zinc-500">No reference price for </span>
                      <span className="font-mono font-semibold">{appraisal.mineralType}</span>
                      <span className="text-zinc-500"> yet. A rate can be added to the reference_prices table.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-3">
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium">
                    Weight
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        step="any"
                        placeholder="e.g. 12.5"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-12 text-sm focus:border-amber-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <span className="absolute inset-y-0 right-3 flex items-center text-xs text-zinc-400">grams</span>
                    </div>
                  </label>
                  <div className="flex-1 rounded-lg bg-zinc-50 px-4 py-2 dark:bg-zinc-800">
                    <div className="text-xs text-zinc-500">Fair price</div>
                    <div className="text-lg font-bold">
                      {previewTotal !== null ? formatMoney(previewTotal) : "--"}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={busy !== null || !appraisal}
                    className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    {busy === "submitting" ? "Recording..." : "Record to ledger"}
                  </button>
                </div>
              </div>
            </form>

            {lastBlock && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Recorded as block #{lastBlock.blockIndex}
                </div>
                <div className="mt-0.5 break-all font-mono text-[11px] text-emerald-800/80 dark:text-emerald-300/70">
                  {lastBlock.hash}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="grid gap-4 self-start lg:grid-cols-2">
          <div
            className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${
              activeTab === "rates" ? "" : "hidden"
            } lg:block`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Reference rates</h2>
              <p className="text-[11px] text-zinc-500">USD/gram, seeded in reference_prices.</p>
            </div>
            <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {refPrices.length === 0 && (
                <div className="py-2.5 text-sm text-zinc-500">No rates loaded.</div>
              )}
              {refPrices.map((r) => (
                <div key={r.key} className="flex items-center justify-between py-1.5 text-sm">
                  <div>
                    <span className="font-mono text-xs font-semibold uppercase">{r.key}</span>
                    <span className="ml-2 text-zinc-500">{r.name}</span>
                  </div>
                  <span className="font-semibold">
                    {r.pricePerGram >= 1 ? formatMoney(r.pricePerGram) : formatMoney(r.pricePerGram * 1000) + " /kg"}
                    <span className="font-normal text-zinc-400"> /g</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-900 ${
              activeTab === "ledger" ? "" : "hidden"
            } lg:block`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">Ledger</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={!dbConfigured || busy !== null}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:hover:bg-zinc-800"
                >
                  {busy === "verifying" ? "Verifying..." : "Verify chain"}
                </button>
                <button
                  type="button"
                  onClick={loadLedger}
                  disabled={!dbConfigured || busy !== null}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:hover:bg-zinc-800"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
                    <th className="py-1.5 pr-2 font-medium">Block</th>
                    <th className="py-1.5 pr-2 font-medium">Mineral</th>
                    <th className="py-1.5 pr-2 font-medium">Wt (g)</th>
                    <th className="py-1.5 pr-2 font-medium">Price</th>
                    <th className="py-1.5 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-zinc-500">
                        No transactions yet. Analyze a sample to create block #1.
                      </td>
                    </tr>
                  )}
                  {ledger.map((block) => (
                    <tr key={block.blockIndex} className="text-xs">
                      <td className="py-1.5 pr-2 font-mono font-semibold">#{block.blockIndex}</td>
                      <td className="py-1.5 pr-2 font-mono uppercase">{block.data.appraisal.mineralType}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{block.data.weightGrams}</td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {block.data.totalPrice !== null ? formatMoney(block.data.totalPrice) : "--"}
                      </td>
                      <td className="py-1.5 font-mono text-zinc-500" title={block.hash}>
                        {truncateHash(block.hash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {verification && (
              <div className="mt-3 border-t border-zinc-100 pt-2.5 text-xs text-zinc-500 dark:border-zinc-800">
                {verification.valid
                  ? `Verified ${verification.blocksChecked} blocks at ${new Date(verification.checkedAt).toLocaleTimeString()}.`
                  : `Integrity check FAILED at block #${verification.firstInvalidBlock}.`}
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="hidden border-t border-zinc-200 pt-4 text-xs text-zinc-400 lg:block dark:border-zinc-800">
        OreFair MVP - Gemini vision classification, reference-priced quotes, and a SHA-256 hash-chained
        ledger. Every block links to its parent hash, so the record is tamper-evident end to end.
      </footer>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
        aria-label="Main navigation"
      >
        <div className="mx-auto flex max-w-lg">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {showCamera && <CameraCapture onClose={() => setShowCamera(false)} onCapture={handleCameraCapture} />}
    </div>
  );
}