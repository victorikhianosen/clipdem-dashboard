"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  Layers,
  Link as LinkIcon,
  LoaderCircle,
  Monitor,
  MonitorPlay,
  MoonStar,
  MousePointerClick,
  Music,
  Play,
  ShieldCheck,
  Smartphone,
  Sun,
  Volume2,
  Zap,
} from "lucide-react";
import type { DownloadStart, DownloadStatus, VideoFormat, VideoInfo } from "@/lib/types";
import { fetchJson, requestFile } from "@/lib/api-client";

const FEATURES = [
  {
    icon: Zap,
    color: "red",
    title: "Lightning Fast",
    description:
      "Optimized processing means you spend less time waiting for your downloads.",
  },
  {
    icon: Layers,
    color: "purple",
    title: "Multiple Platforms",
    description: "YouTube, TikTok, Instagram, Facebook, X and more.",
  },
  {
    icon: Monitor,
    color: "blue",
    title: "Best Available Quality",
    description:
      "We always surface the highest resolution the source actually offers.",
  },
  {
    icon: Smartphone,
    color: "green",
    title: "Mobile Friendly",
    description: "Works beautifully across phones, tablets, laptops and desktops.",
  },
  {
    icon: ShieldCheck,
    color: "yellow",
    title: "Privacy First",
    description:
      "Your submitted URLs are processed securely without unnecessary tracking.",
  },
  {
    icon: MousePointerClick,
    color: "orange",
    title: "One-Click Download",
    description: "No complicated steps. Paste your link and you're ready to go.",
  },
] as const;

const STEPS = [
  {
    number: "01",
    title: "Copy the link",
    description: "Copy the URL of the video you want.",
  },
  {
    number: "02",
    title: "Paste it here",
    description: "Paste the URL into the downloader above.",
  },
  {
    number: "03",
    title: "Download",
    description: "Pick a resolution and save it to your device.",
  },
];

const FEATURE_COLORS: Record<string, string> = {
  red: "bg-red-500/10 text-red-400",
  purple: "bg-purple-500/10 text-purple-400",
  blue: "bg-blue-500/10 text-blue-400",
  green: "bg-green-500/10 text-green-400",
  yellow: "bg-yellow-500/10 text-yellow-400",
  orange: "bg-orange-500/10 text-orange-400",
};

type Stage =
  | "idle"
  | "fetching-info"
  | "info-ready"
  | "starting-download"
  | "processing"
  | "downloading"
  | "saved"
  | "error";

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

function qualityLabel(format: VideoFormat) {
  if (format.note) return format.note;
  if (format.height) return `${format.height}p`;
  return format.resolution;
}

/**
 * Keeps the video's real title (as shown on the source site) as the saved filename -- only
 * strips the handful of characters that are actually illegal in a filename on
 * Windows/macOS/Linux, instead of slugifying the whole thing into hyphens.
 */
function sanitizeFilename(title: string) {
  const cleaned = title
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "video").slice(0, 150);
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [downloadStatusMessage, setDownloadStatusMessage] = useState<string | null>(null);
  const [serverProgress, setServerProgress] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const initial = stored === "light" ? "light" : "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("light", initial === "light");
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("light", next === "light");
      window.localStorage.setItem("theme", next);
      showToast(`${next === "light" ? "Light" : "Dark"} mode enabled.`);
      return next;
    });
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestUrlRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3500);
  }

  async function pasteUrl() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      showToast("Unable to access clipboard.");
    }
  }

  function resetResult() {
    setVideoInfo(null);
    setSelectedFormatId(null);
    setDownloadStatusMessage(null);
    setServerProgress(null);
    setDownloadProgress(null);
    setSavedFileName(null);
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  async function fetchVideoInfo() {
    const trimmed = url.trim();

    if (!trimmed) {
      setErrorMessage("Please paste a video URL first.");
      inputRef.current?.focus();
      return;
    }

    if (!isHttpUrl(trimmed)) {
      setErrorMessage("That doesn't look like a valid http(s) URL.");
      inputRef.current?.focus();
      return;
    }

    resetResult();
    setErrorMessage(null);
    setStage("fetching-info");
    requestUrlRef.current = trimmed;

    const result = await fetchJson<VideoInfo>("/api/video-info", {
      method: "POST",
      body: JSON.stringify({ url: trimmed }),
    });

    if (!result.success || !result.data) {
      setStage("error");
      setErrorMessage(result.message || "Failed to retrieve video information.");
      return;
    }

    if (result.data.formats.length === 0) {
      setStage("error");
      setErrorMessage(
        "This video was found, but no downloadable formats were returned. The source site may require sign-in or isn't supported."
      );
      return;
    }

    setVideoInfo(result.data);
    // Backend already returns formats highest-resolution first.
    setSelectedFormatId(result.data.formats[0].formatId);
    setStage("info-ready");

    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function startDownload() {
    if (!selectedFormatId || !videoInfo) {
      showToast("Choose a resolution first.");
      return;
    }

    setErrorMessage(null);
    setStage("starting-download");
    setDownloadStatusMessage("Starting download…");

    const result = await fetchJson<DownloadStart>("/api/download", {
      method: "POST",
      body: JSON.stringify({ url: requestUrlRef.current, formatId: selectedFormatId }),
    });

    if (!result.success || !result.data) {
      setStage("error");
      setErrorMessage(result.message || "Failed to start the download.");
      return;
    }

    setStage("processing");
    setServerProgress(0);
    setDownloadStatusMessage(
      result.data.audioMerged
        ? "Download in progress — merging audio and video…"
        : "Download in progress…"
    );
    pollStatus(result.data.downloadId);
  }

  function pollStatus(downloadId: string) {
    const poll = async () => {
      const result = await fetchJson<DownloadStatus>(`/api/download/${downloadId}/status`);

      if (!result.success || !result.data) {
        setStage("error");
        setErrorMessage(result.message || "Lost track of the download. Please try again.");
        return;
      }

      const status = result.data;

      if (status.status === "FAILED") {
        setStage("error");
        setErrorMessage(status.errorMessage || "The download failed on the server.");
        return;
      }

      if (status.status === "COMPLETED" && status.fileReady) {
        setServerProgress(100);
        setDownloadStatusMessage("Saving to your device…");
        await saveFile(downloadId, status.fileName);
        return;
      }

      setServerProgress(status.progressPercent ?? null);
      setDownloadStatusMessage(
        status.status === "PENDING"
          ? "Queued…"
          : status.progressPercent !== null && status.progressPercent !== undefined
            ? `Download in progress… ${status.progressPercent}%`
            : "Download in progress…"
      );
      pollTimer.current = setTimeout(poll, 1000);
    };

    poll();
  }

  async function saveFile(downloadId: string, suggestedName: string | null) {
    setStage("downloading");
    setDownloadProgress(0);

    try {
      const { blob } = await requestFile(`/api/download/${downloadId}/file`, (loaded, total) => {
        if (total) {
          setDownloadProgress(Math.min(100, Math.round((loaded / total) * 100)));
        }
        // total unknown: leave downloadProgress null so the UI shows an indeterminate bar
        // instead of a misleading percentage.
      });

      const format = videoInfo?.formats.find((f) => f.formatId === selectedFormatId);
      const extension = format?.extension || suggestedName?.split(".").pop() || "mp4";
      const title = videoInfo ? sanitizeFilename(videoInfo.title) : "video";
      const resolutionPart = format ? ` (${qualityLabel(format)})` : "";
      const fileName = `${title}${resolutionPart}.${extension}`;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setSavedFileName(fileName);
      setDownloadProgress(100);
      setStage("saved");
      showToast(`Saved ${fileName} to your device.`);
    } catch (err) {
      setStage("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to save the file to your device.");
    }
  }

  const isBusy =
    stage === "fetching-info" ||
    stage === "starting-download" ||
    stage === "processing" ||
    stage === "downloading";

  return (
    <div className="min-h-screen font-sans text-[var(--text-primary)] bg-[var(--bg-page)] bg-[radial-gradient(circle_at_15%_10%,rgba(239,68,68,.13),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,.10),transparent_25%)] transition-colors">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(var(--grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--grid-line)_1px,transparent_1px)] [background-size:40px_40px]" />

      {/* Navbar */}
      <header className="relative z-10 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="h-20 flex items-center justify-between">
            <a href="#" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                <Play className="w-5 h-5 fill-white" />
              </div>

              <div>
                <div className="text-lg font-bold tracking-tight">
                  Clip<span className="text-red-500">Dem</span>
                </div>

                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">
                  Video Downloader
                </div>
              </div>
            </a>

            <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--text-secondary)]">
              <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition">
                How it works
              </a>
              <a href="#features" className="hover:text-[var(--text-primary)] transition">
                Features
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="w-10 h-10 rounded-xl border border-[var(--border)] bg-[var(--overlay-1)] hover:bg-[var(--overlay-2)] flex items-center justify-center transition"
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-[var(--text-primary)]" />
                ) : (
                  <MoonStar className="w-4 h-4 text-[var(--text-primary)]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-20 sm:pt-28 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-[var(--border)] bg-[var(--overlay-1)] text-xs text-[var(--text-secondary)] mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            Fast & simple video downloads
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.04em] leading-[1.05] max-w-4xl mx-auto">
            Download videos.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-orange-400">
              Without the hassle.
            </span>
          </h1>

          <p className="mt-7 text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            Paste a link from YouTube, TikTok, Instagram, Facebook or X, pick a
            resolution, and download it straight to your device.
          </p>

          <div className="mt-12 max-w-3xl mx-auto">
            <div className="bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-2xl p-2 shadow-2xl shadow-black/30 transition focus-within:shadow-[0_0_0_1px_rgba(239,68,68,.5),0_0_35px_rgba(239,68,68,.08)]">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center px-4 gap-3">
                  <LinkIcon className="w-5 h-5 text-[var(--text-tertiary)] flex-shrink-0" />

                  <input
                    ref={inputRef}
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") fetchVideoInfo();
                    }}
                    placeholder="Paste a video URL here..."
                    className="w-full bg-transparent outline-none border-0 text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] py-4 text-sm"
                  />

                  <button
                    onClick={pasteUrl}
                    className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition whitespace-nowrap"
                  >
                    Paste
                  </button>
                </div>

                <button
                  onClick={fetchVideoInfo}
                  disabled={isBusy}
                  className="group px-6 py-4 sm:py-3.5 rounded-xl bg-red-500 hover:bg-red-400 active:scale-[.98] transition font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {stage === "fetching-info" ? (
                    <>
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                      Fetching video...
                    </>
                  ) : (
                    <>
                      <span>Get Video</span>
                      <Info className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4 text-xs text-[var(--text-quaternary)]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Secure
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Fast processing
              </span>
              <span className="flex items-center gap-1.5">
                <MonitorPlay className="w-3.5 h-3.5" />
                Best available quality
              </span>
            </div>

            {stage === "error" && errorMessage && (
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-left">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-red-300">
                    Something went wrong
                  </div>
                  <div className="text-sm text-red-300/80 mt-0.5">{errorMessage}</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Video Result */}
        {videoInfo && (
          <section ref={resultRef} className="max-w-4xl mx-auto px-5 sm:px-8 pb-20">
            <div className="bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-3xl overflow-hidden">
              <div className="p-5 sm:p-6">
                <div className="grid md:grid-cols-[260px_1fr] gap-6">
                  <div className="relative aspect-video md:aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-900">
                    {videoInfo.thumbnail ? (
                      // thumbnail host varies per source platform, so it can't be allowlisted for next/image
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                        <MonitorPlay className="w-10 h-10" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

                    {formatDuration(videoInfo.durationSeconds) && (
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <span className="px-2 py-1 rounded-md bg-black/70 text-xs font-medium">
                          {formatDuration(videoInfo.durationSeconds)}
                        </span>
                      </div>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                        <Play className="w-5 h-5 fill-white" />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-[11px] font-semibold uppercase">
                          {videoInfo.sourceWebsite || "Video"}
                        </span>
                        <span className="text-xs text-[var(--text-quaternary)]">
                          {videoInfo.formats.length} resolution
                          {videoInfo.formats.length === 1 ? "" : "s"} available
                        </span>
                      </div>

                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug">
                        {videoInfo.title}
                      </h2>

                      <p className="mt-3 text-sm text-[var(--text-tertiary)]">
                        Choose a resolution below. The highest quality is selected by
                        default.
                      </p>
                    </div>

                    <div className="mt-6">
                      <label className="block text-[11px] uppercase tracking-wider text-[var(--text-quaternary)] mb-2">
                        Resolution
                      </label>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {videoInfo.formats.map((format) => {
                          const selected = format.formatId === selectedFormatId;
                          return (
                            <button
                              key={format.formatId}
                              onClick={() => setSelectedFormatId(format.formatId)}
                              disabled={isBusy}
                              className={`flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60 ${
                                selected
                                  ? "border-red-500/60 bg-red-500/10"
                                  : "border-[var(--border)] bg-[var(--surface-strong)] hover:bg-[var(--overlay-2)]"
                              }`}
                            >
                              <span className="flex items-center gap-1.5 text-sm font-semibold">
                                {qualityLabel(format)}
                                {/* Every format plays with audio once downloaded -- formats without
                                    a native audio track get the best available audio merged in
                                    automatically, so this is never shown as "muted" here. */}
                                <Volume2 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                              </span>
                              <span className="text-[11px] text-[var(--text-tertiary)] uppercase">
                                {format.extension}
                                {formatBytes(format.fileSizeBytes) &&
                                  ` · ${formatBytes(format.fileSizeBytes)}${
                                    format.fileSizeEstimated ? " (est)" : ""
                                  }`}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {selectedFormatId &&
                        !videoInfo.formats.find((f) => f.formatId === selectedFormatId)
                          ?.hasAudio && (
                          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[var(--text-quaternary)]">
                            <Music className="w-3.5 h-3.5" />
                            This resolution downloads with audio automatically merged in at
                            full quality.
                          </p>
                        )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-[var(--border)]">
                  {isBusy && stage !== "fetching-info" && (() => {
                    const activePercent =
                      stage === "processing"
                        ? serverProgress
                        : stage === "downloading"
                          ? downloadProgress
                          : null;

                    return (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] mb-2">
                        <span className="flex items-center gap-1.5">
                          <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                          {downloadStatusMessage}
                        </span>
                        {activePercent !== null && <span>{activePercent}%</span>}
                      </div>

                      <div className="h-2 w-full rounded-full bg-[var(--overlay-2)] overflow-hidden">
                        {activePercent !== null ? (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-200"
                            style={{ width: `${activePercent}%` }}
                          />
                        ) : (
                          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-red-500 to-orange-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
                        )}
                      </div>

                      {stage === "downloading" && downloadProgress === null && (
                        <p className="mt-2 text-[11px] text-[var(--text-quaternary)]">
                          Downloading… your browser couldn&apos;t report total size for
                          this file, so we can&apos;t show an exact percentage.
                        </p>
                      )}
                    </div>
                    );
                  })()}

                  {stage === "saved" && savedFileName && (
                    <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                      <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
                      Saved <span className="font-semibold">{savedFileName}</span> to
                      your device.
                    </div>
                  )}

                  {stage === "error" && errorMessage && (
                    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      <AlertTriangle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
                      {errorMessage}
                    </div>
                  )}

                  <button
                    onClick={startDownload}
                    disabled={isBusy || !selectedFormatId}
                    className="w-full py-4 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-bold text-sm hover:opacity-90 active:scale-[.99] transition flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isBusy ? (
                      <>
                        <LoaderCircle className="w-5 h-5 animate-spin" />
                        {downloadStatusMessage || "Working…"}
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Download Video
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Features */}
        <section
          id="features"
          className="max-w-6xl mx-auto px-5 sm:px-8 py-20 border-t border-[var(--border)]"
        >
          <div className="text-center mb-14">
            <span className="text-xs uppercase tracking-[.2em] text-red-500 font-semibold">
              Why ClipDem
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-4 tracking-tight">
              Everything you need.
            </h2>
            <p className="text-[var(--text-tertiary)] mt-3">
              Simple tools. No unnecessary complexity.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, color, title, description }) => (
              <div
                key={title}
                className="bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-2xl p-6 hover:bg-[var(--overlay-2)] transition"
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${FEATURE_COLORS[color]}`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <h3 className="font-semibold text-lg">{title}</h3>

                <p className="text-sm text-[var(--text-tertiary)] mt-2 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="max-w-5xl mx-auto px-5 sm:px-8 py-20">
          <div className="text-center mb-14">
            <span className="text-xs uppercase tracking-[.2em] text-red-500 font-semibold">
              How it works
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-4 tracking-tight">
              Three simple steps.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map(({ number, title, description }) => (
              <div key={number} className="text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--surface-strong)] border border-[var(--border)] flex items-center justify-center text-xl font-bold">
                  {number}
                </div>
                <h3 className="font-semibold mt-5">{title}</h3>
                <p className="text-sm text-[var(--text-tertiary)] mt-2">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-5xl mx-auto px-5 sm:px-8 py-20">
          <div className="relative overflow-hidden rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-transparent to-orange-500/10 p-10 sm:p-16 text-center">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-red-500/10 blur-3xl" />

            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-red-500 mx-auto flex items-center justify-center shadow-xl shadow-red-500/20">
                <Download className="w-6 h-6" />
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold mt-6">Ready to download?</h2>

              <p className="text-[var(--text-tertiary)] mt-3">Paste your video link and get started.</p>

              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="mt-7 px-6 py-3.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-sm hover:opacity-90 transition"
              >
                Start Downloading
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-[var(--text-quaternary)]">© 2026 ClipDem. All rights reserved.</div>

            <div className="flex items-center gap-5 text-xs text-[var(--text-quaternary)]">
              <a href="#" className="hover:text-[var(--text-secondary)] transition">
                Privacy
              </a>
              <a href="#" className="hover:text-[var(--text-secondary)] transition">
                Terms
              </a>
              <a href="#" className="hover:text-[var(--text-secondary)] transition">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Toast */}
      <div
        className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"
        }`}
      >
        <div className="bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Info className="w-4 h-4 text-red-400" />
          </div>
          <span className="text-sm text-[var(--text-secondary)]">{toast}</span>
        </div>
      </div>
    </div>
  );
}
