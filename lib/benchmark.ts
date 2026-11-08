import { measureSwing, type Landmark, type SwingAnalysis, type PhaseKey } from "./kinematics.ts";

export const BENCHMARK_VERSION = "B1.0";
const PRIMARY = [11, 12, 23, 24, 25, 26, 27, 28] as const;
const ORDER: PhaseKey[] = ["address", "top", "impact", "finish"];
export type BenchmarkCheck = { id: string; label: string; passed: boolean; detail: string };
export type BenchmarkResult = { version: string; passed: boolean; checks: BenchmarkCheck[]; summary: string };

const reliable = (landmark: Landmark | undefined) => !!landmark && Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && (landmark.visibility ?? 1) >= 0.45;
export const hasCorePose = (landmarks: Landmark[] | null) => !!landmarks && PRIMARY.every(i => reliable(landmarks[i]));

/** B1 tests capture usability, NOT accuracy of 3D biomechanics or golf technique. */
export function evaluateBenchmark(clip: Pick<SwingAnalysis, "frames" | "phases" | "width" | "height" | "analyzedDuration">): BenchmarkResult {
  const frames = clip.frames;
  const validSamples = frames.filter(f => hasCorePose(f.landmarks)).length;
  const coverage = frames.length ? validSamples / frames.length * 100 : 0;
  const ordered = ORDER.every((phase, i) => Number.isFinite(clip.phases[phase]) && clip.phases[phase] >= 0 && clip.phases[phase] <= clip.analyzedDuration && (i === 0 || clip.phases[ORDER[i - 1]] < clip.phases[phase]));
  const stableTimes = frames.every((frame, i) => Number.isFinite(frame.time) && frame.time >= 0 && frame.time <= clip.analyzedDuration + .05 && (i === 0 || frames[i - 1].time < frame.time));
  const metrics = measureSwing(frames, clip.phases);
  const usable = [metrics.headSway.value, metrics.hipSway.value, metrics.spineChange.value].every(v => v !== null && Number.isFinite(v));
  const checks: BenchmarkCheck[] = [
    { id: "media", label: "Decodable video", passed: clip.width > 0 && clip.height > 0 && clip.analyzedDuration > 0, detail: `${clip.width} × ${clip.height} pixels, ${clip.analyzedDuration.toFixed(1)}s analyzed` },
    { id: "samples", label: "Sufficient temporal samples", passed: frames.length >= 12 && stableTimes, detail: `${frames.length} ordered frame samples` },
    { id: "landmarks", label: "Key body tracking ≥70%", passed: coverage >= 70, detail: `${coverage.toFixed(1)}% samples with shoulders, hips, knees and ankles visible` },
    { id: "phases", label: "Swing checkpoints ordered", passed: ordered, detail: ordered ? "Address → top → impact candidate → finish" : "Check the estimated phase markers manually" },
    { id: "metrics", label: "2D motion measurements available", passed: usable, detail: usable ? "Head, hip and torso traces available" : "Insufficient tracking for stable measurement" },
  ];
  const passed = checks.every(check => check.passed);
  return { version: BENCHMARK_VERSION, passed, checks, summary: passed ? "Capture-quality gate passed. Golf-mechanics accuracy still requires validation against reference footage." : "Needs review: adjust framing or phase markers and rerun the capture-quality checks." };
}

export function benchmarkReport(clip: SwingAnalysis) {
  return {
    kind: "fairway-ai-benchmark", version: BENCHMARK_VERSION,
    generatedAt: new Date().toISOString(),
    source: { fileName: clip.name, durationSeconds: clip.duration, analyzedSeconds: clip.analyzedDuration, resolution: { width: clip.width, height: clip.height }, sampleCount: clip.frames.length },
    engine: { name: "MediaPipe Pose Landmarker", model: "pose_landmarker_full", rendering: "Canvas 2D", limitations: "Single camera, uncalibrated 2D projected measurements. No impact/contact, clubhead, clubface, or 3D validation." },
    result: evaluateBenchmark(clip), phases: clip.phases, metrics: measureSwing(clip.frames, clip.phases),
    privacy: "Report contains numeric summaries and filename only; no source video or frame pixels.",
  };
}
