export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface VideoFormat {
  formatId: string;
  extension: string;
  resolution: string;
  height: number | null;
  width: number | null;
  fps: number | null;
  fileSizeBytes: number | null;
  fileSizeEstimated: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  note: string | null;
}

export interface VideoInfo {
  title: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  sourceWebsite: string | null;
  canonicalUrl: string | null;
  formats: VideoFormat[];
}

export interface DownloadStart {
  downloadId: string;
  status: string;
  message: string;
  requestedFormatId: string;
  audioMerged: boolean;
  qualityDowngraded: boolean;
}

export interface DownloadStatus {
  downloadId: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "EXPIRED" | string;
  fileName: string | null;
  fileSizeBytes: number | null;
  audioMerged: boolean;
  qualityDowngraded: boolean;
  errorMessage: string | null;
  fileReady: boolean;
  progressPercent: number | null;
}
