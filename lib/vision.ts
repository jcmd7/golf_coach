import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseFrame, SwingAnalysis } from "./kinematics";
import { estimatePhases } from "./kinematics";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM);
      try {
        return await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: "GPU" }, runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      } catch {
        return await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "VIDEO", numPoses: 1 });
      }
    })().catch(error => { landmarkerPromise = null; throw error; });
  }
  return landmarkerPromise;
}

function waitEvent(element: HTMLVideoElement, event: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, ok); element.removeEventListener("error", fail); };
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("The video could not be decoded in this browser.")); };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for the video (${event}). Try MP4/H.264.`)); }, timeoutMs);
    element.addEventListener(event, ok, { once: true });
    element.addEventListener("error", fail, { once: true });
  });
}

async function seekTo(video: HTMLVideoElement, time: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Analysis canceled", "AbortError");
  if (Math.abs(video.currentTime - time) < 0.002 && video.readyState >= 2) return;
  const seeked = waitEvent(video, "seeked", 12000);
  video.currentTime = time;
  await seeked;
  if (signal?.aborted) throw new DOMException("Analysis canceled", "AbortError");
}

export async function analyzeVideo(file: File, onProgress: (progress: number, status: string) => void, signal?: AbortSignal): Promise<SwingAnalysis> {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) throw new Error("Please choose a video file.");
  if (file.size > 200 * 1024 * 1024) throw new Error("For this browser MVP, please use a video under 200 MB.");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.cssText = "position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  try {
    onProgress(0, "Loading video metadata");
    video.src = url;
    video.load();
    if (video.readyState < 1) await waitEvent(video, "loadedmetadata");
    if (video.readyState < 2) await waitEvent(video, "loadeddata");
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not determine clip duration. Try a short MP4 file.");
    const analyzedDuration = Math.min(duration, 18);
    const sampleCount = Math.max(12, Math.min(120, Math.ceil(analyzedDuration * 9)));
    onProgress(2, "Loading pose-estimation model (first run may take longer)");
    const landmarker = await getLandmarker();
    const frames: PoseFrame[] = [];
    for (let i = 0; i < sampleCount; i++) {
      if (signal?.aborted) throw new DOMException("Analysis canceled", "AbortError");
      const t = Math.max(0, Math.min(Math.max(0, duration - .04), analyzedDuration * i / (sampleCount - 1)));
      await seekTo(video, t, signal);
      // A monotonic clock is mandatory in VIDEO mode, independent of browser seek precision.
      const result = landmarker.detectForVideo(video, i * 1000 / 9);
      const points = result.landmarks[0];
      frames.push({ time: t, landmarks: points ? points.map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null });
      onProgress(2 + Math.round(96 * (i + 1) / sampleCount), `Tracking pose · frame ${i + 1} of ${sampleCount}`);
      if (i % 6 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    }
    onProgress(100, "Analysis complete");
    return { id: `${file.name}-${Date.now()}`, name: file.name, url, duration, analyzedDuration, width: video.videoWidth, height: video.videoHeight, frames, phases: estimatePhases(frames) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
}
