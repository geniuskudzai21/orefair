# OreFair — 3-Minute Hackathon Demo Transcript

Total runtime: ~3:00 | Recommended demo setup: `npm run dev`, seeded Neon Postgres, sample ore photos ready (e.g. a gold-bearing quartz rock).

---

## Timeline at a glance

| Time | Section | What happens on screen |
| ---- | ------- | ---------------------- |
| 0:00 | Hook + problem | OreFair homepage |
| 0:25 | Photograph the sample | Upload / camera capture, SHA-256 shown |
| 0:50 | AI analysis | "Analyzing…" → appraisal cards |
| 1:20 | Fair pricing | Reference rate, quality adjustment |
| 1:50 | Enter weight + record | Fair price total → "Recorded as block #N" |
| 2:15 | Ledger + verification | Ledger tab, Verify chain |
| 2:40 | Close | Tagline, problem revisited |

---

## 0:00 – 0:25 · Hook

> **SPEAKER:**
> Most of the roughly 40 million artisanal miners in the world are price-takers. They sell what they dig to middlemen, and they have almost no way to know what their ore is actually worth — or to prove later what they sold.

> **ON SCREEN:**
> OreFair logo + tagline — "AI fair pricing · tamper-evident ledger".

> **SPEAKER (continues):**
> OreFair fixes that with a phone. One photo, one fair quote, one tamper-evident record. Here's the flow.

---

## 0:25 – 0:50 · Step 1 — Photograph the sample

> **SPEAKER:**
> On the "New sample" screen, we photograph the ore — either with the camera or by uploading a photo. The browser downsizes the image and computes a SHA-256 fingerprint of the original file, right here on the device.

> **ON SCREEN:**
> Click "Take photo with camera" (or upload). Point camera at ore sample, capture. Show the preview thumbnail with `sha256 9f3b2a1e…` beneath it.

---

## 0:50 – 1:20 · Step 2 — AI analysis

> **SPEAKER:**
> Hitting "Analyze sample with AI" sends the image to Gemini Flash. The model is constrained to structured JSON, so it returns exactly what we need: the mineral type, a visible quality assessment, a quality score, and a confidence level.

> **ON SCREEN:**
> Click "Analyze sample with AI". Wait for the "Analyzing…" state, then show the appraisal cards:
> - `gold` badge / "Native gold in quartz"
> - Quality pill: "Minor impurities" (amber)
> - Identification confidence: 96%
> - Visual quality score: 0.74 / 1.00

---

## 1:20 – 1:50 · Step 3 — Fair price

> **SPEAKER:**
> Now the fairness part. We look up a reference rate for gold from our price table — in this case $75 per gram for an average-quality sample. Then we adjust it by the visible quality the model just scored: cleaner ore earns a premium, heavily contaminated ore drops toward a floor.

> **ON SCREEN:**
> Show "Reference rate: $75.00 / gram" and "Quality adjustment: ×1.18 → $88.50 / gram".

---

## 1:50 – 2:15 · Step 4 — Record it

> **SPEAKER:**
> The miner types the weight — say 12.5 grams — and the fair price updates live: $1,106.25. One click records the full transaction to the ledger: appraisal, weight, rate, and the image hash. The app immediately confirms it with the block's hash.

> **ON SCREEN:**
> Type `12.5` in the weight field → "Fair price $1,106.25" appears. Click "Record to ledger" → green pill: "Recorded as block #4" with the full hash. Show the image-hash from step 1 is now anchored in the block.

---

## 2:15 – 2:40 · Step 5 — Ledger and verification

> **SPEAKER:**
> Every sale is a block in a SHA-256 hash-chained ledger — each block links to the hash of the one before it. Anything changed after the fact breaks the chain. We can prove that live: the app re-computes every hash from genesis and reports the integrity of the whole ledger.

> **ON SCREEN:**
> Switch to the "Ledger" tab. Show the table of blocks: #, mineral, weight, price, truncated hash. Click "Verify chain" → green badge in the header: "Chain verified" and "Verified N blocks at …".

---

## 2:40 – 3:00 · Close

> **SPEAKER:**
> So, one phone — and a single seller gets three things they almost never had: an AI-backed valuation, a fair quality-adjusted price, and a permanent, verifiable record of the sale. That's OreFair — fair pricing and traceability for the people at the base of the mineral supply chain. Thank you.

> **ON SCREEN:**
> OreFair logo + tagline. URL or QR code to the live demo.

---

## Recording tips

- **Do a dry run first** — have 2–3 sample photos already staged so the analysis step doesn't feel rushed.
- **Prep the ledger** — record 1–2 sales before recording so the Ledger tab isn't empty and the "Verify chain" output looks real.
- **Pause on the verification** — the green "Chain verified" badge is the most persuasive shot; linger on it for 2–3 seconds.
- **No audio needed for the AI step** — the 3–4 second analysis is a natural beat to let the result "land" before you keep talking.
- **Backup plan** — if the live network is flaky, pre-record each step and edit; keep this transcript as the voiceover.