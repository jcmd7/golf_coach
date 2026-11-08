/** Measurements are 2D video estimates, never calibrated inches or 3D joint angles. */
export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export type PoseFrame = { time: number; landmarks: Landmark[] | null };
export type PhaseKey = "address" | "top" | "impact" | "finish";
export type PhaseTimes = Record<PhaseKey, number>;
export type Metric = { value: number | null; label: string; unit: string; note: string };
export type Metrics = {
  headSway: Metric;
  hipSway: Metric;
  spineChange: Metric;
  shoulderTilt: Metric;
  kneeFlex: Metric;
  tracking: Metric;
};
export type Insight = { title: string; body: string; drill: string; severity: "focus" | "info" | "good" };
export type SwingAnalysis = {
  id: string;
  name: string;
  url: string;
  duration: number;
  analyzedDuration: number;
  width: number;
  height: number;
  frames: PoseFrame[];
  phases: PhaseTimes;
};

const L = { NOSE: 0, LEFT_EAR: 7, RIGHT_EAR: 8, LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16, LH: 23, RH: 24, LK: 25, RK: 26, LA: 27, RA: 28 };
const visible = (p?: Landmark) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= 0.45;
const mid = (a: Landmark, b: Landmark): Landmark => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (x: number) => Math.round(x * 10) / 10;

export function nearestFrame(frames: PoseFrame[], time: number): PoseFrame | null {
  if (!frames.length) return null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].time < time) lo = m + 1; else hi = m; }
  const current = frames[lo];
  const prev = frames[Math.max(0, lo - 1)];
  return Math.abs(current.time - time) < Math.abs(prev.time - time) ? current : prev;
}

export function estimatePhases(frames: PoseFrame[]): PhaseTimes {
  const valid = frames.filter(f => {
    const p = f.landmarks;
    return p && [L.LS, L.RS, L.LW, L.RW, L.LH, L.RH].every(i => visible(p[i]));
  });
  if (valid.length < 4) {
    const end = frames.at(-1)?.time ?? 1;
    return { address: 0, top: end * .45, impact: end * .67, finish: end };
  }
  const start = valid[0];
  const finish = valid[valid.length - 1];
  const yWrist = (f: PoseFrame) => { const p = f.landmarks!; return (p[L.LW].y + p[L.RW].y) / 2; };
  // The highest wrists after the initial address window approximate the top. This is not a club-head tracker.
  const begin = Math.min(valid.length - 2, Math.max(1, Math.floor(valid.length * 0.09)));
  const end = Math.max(begin + 1, Math.floor(valid.length * .85));
  let topIdx = begin;
  for (let i = begin + 1; i < end; i++) if (yWrist(valid[i]) < yWrist(valid[topIdx])) topIdx = i;
  // Return-to-address wrist height is only a rough impact *candidate*.
  const baseline = yWrist(start);
  const candidateEnd = Math.min(valid.length - 1, Math.max(topIdx + 1, Math.floor(valid.length * .94)));
  let impactIdx = Math.min(topIdx + 1, valid.length - 1);
  let delta = Infinity;
  for (let i = topIdx + 1; i <= candidateEnd; i++) {
    const value = Math.abs(yWrist(valid[i]) - baseline) + (i - topIdx) * 0.0002;
    if (value < delta) { delta = value; impactIdx = i; }
  }
  return { address: start.time, top: valid[topIdx].time, impact: valid[impactIdx].time, finish: finish.time };
}

function at(frames: PoseFrame[], time: number): Landmark[] | null {
  const f = nearestFrame(frames, time);
  return f?.landmarks ?? null;
}

export function measureSwing(frames: PoseFrame[], phases: PhaseTimes): Metrics {
  const base = at(frames, phases.address);
  const top = at(frames, phases.top);
  const samples = frames.map(f => f.landmarks).filter((p): p is Landmark[] => !!p && [L.LS, L.RS, L.LH, L.RH, L.LK, L.RK, L.LA, L.RA].every(i => visible(p[i])));
  const quality = frames.length ? samples.length / frames.length * 100 : 0;
  const width = base && visible(base[L.LS]) && visible(base[L.RS]) ? dist(base[L.LS], base[L.RS]) : null;
  const validWidth = width && width > 0.045 ? width : null;
  const sway = (idx: number, both: boolean) => {
    if (!base || !validWidth) return null;
    const origin = both ? (visible(base[idx]) && visible(base[idx + 1]) ? mid(base[idx], base[idx + 1]) : null) : (visible(base[idx]) ? base[idx] : null);
    if (!origin) return null;
    const values = samples.flatMap(p => {
      const now = both ? (visible(p[idx]) && visible(p[idx + 1]) ? mid(p[idx], p[idx + 1]) : null) : (visible(p[idx]) ? p[idx] : null);
      return now ? [Math.abs(now.x - origin.x) / validWidth * 100] : [];
    });
    return values.length ? Math.max(...values) : null;
  };
  // Degrees of the projected torso line relative to image vertical, NOT anatomical 3D spinal bend.
  const spine = (p: Landmark[] | null) => {
    if (!p || ![L.LS, L.RS, L.LH, L.RH].every(i => visible(p[i]))) return null;
    const s = mid(p[L.LS], p[L.RS]); const h = mid(p[L.LH], p[L.RH]);
    return Math.atan2(s.x - h.x, h.y - s.y) * 180 / Math.PI;
  };
  const baseline = spine(base);
  const changes = samples.flatMap(p => { const value = spine(p); return value === null || baseline === null ? [] : [Math.abs(value - baseline)]; });
  const shoulderTilt = top && visible(top[L.LS]) && visible(top[L.RS]) ? Math.abs(Math.atan2(top[L.LS].y - top[L.RS].y, Math.abs(top[L.LS].x - top[L.RS].x)) * 180 / Math.PI) : null;
  const flex = (hip: Landmark, knee: Landmark, ankle: Landmark): number => {
    const v1 = { x: hip.x - knee.x, y: hip.y - knee.y }; const v2 = { x: ankle.x - knee.x, y: ankle.y - knee.y };
    const degrees = Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1)))) * 180 / Math.PI;
    return 180 - degrees;
  };
  const kneeValues = base ? [[L.LH, L.LK, L.LA], [L.RH, L.RK, L.RA]].flatMap(([h,k,a]) =>
    [h,k,a].every(i => visible(base[i])) ? [flex(base[h], base[k], base[a])] : []) : [];
  return {
    headSway: { value: sway(L.NOSE, false), label: "Head movement", unit: "%", note: "Maximum horizontal nose movement as % of address shoulder width" },
    hipSway: { value: sway(L.LH, true), label: "Hip movement", unit: "%", note: "Maximum horizontal midpoint movement as % of address shoulder width" },
    spineChange: { value: changes.length ? Math.max(...changes) : null, label: "Torso tilt change", unit: "°", note: "Maximum change in projected torso angle relative to address" },
    shoulderTilt: { value: shoulderTilt, label: "Shoulder line at top", unit: "°", note: "Image-plane shoulder line angle, not 3D shoulder rotation" },
    kneeFlex: { value: kneeValues.length ? kneeValues.reduce((a,b)=>a+b,0)/kneeValues.length : null, label: "Knee flex at address", unit: "°", note: "Average projected knee flex; camera angle affects reading" },
    tracking: { value: quality, label: "Pose coverage", unit: "%", note: "Fraction of samples with shoulders, hips, knees and ankles tracked" },
  };
}

export function coachingInsights(metrics: Metrics): Insight[] {
  const insights: Insight[] = [];
  const quality = metrics.tracking.value ?? 0;
  if (quality < 65) insights.push({ title: "Improve camera framing", body: `Pose landmarks appeared in only ${Math.round(quality)}% of samples. Retake from a stable tripod with your full body visible and good light.`, drill: "Set the camera around hand height, several steps away, with your feet and entire club path in frame.", severity: "focus" });
  if (quality >= 65 && metrics.headSway.value !== null && metrics.headSway.value > 28) insights.push({ title: "Review lateral head movement", body: `Detected up to ${round(metrics.headSway.value)}% of shoulder width in horizontal head movement. Some head movement is normal; look at the annotated frames to decide whether it matters.`, drill: "Film three slow half swings while keeping balance centered; compare the head trace rather than trying to hold your head rigid.", severity: "focus" });
  if (quality >= 65 && metrics.hipSway.value !== null && metrics.hipSway.value > 32) insights.push({ title: "Inspect lateral hip movement", body: `Hip midpoint shifted up to ${round(metrics.hipSway.value)}% of shoulder width on screen. A front-view camera cannot separate rotation, sway, and perspective perfectly.`, drill: "Make three controlled waist-high swings next to a vertical reference line, checking balance at address and finish.", severity: "focus" });
  if (quality >= 65 && metrics.spineChange.value !== null && metrics.spineChange.value > 18) insights.push({ title: "Check torso tilt consistency", body: `The projected torso angle varied by about ${round(metrics.spineChange.value)}°. Review whether this is intentional motion, camera perspective, or a repeatable posture change.`, drill: "Record slow-motion practice swings keeping the camera fixed; pause at address, top, and the return to the ball.", severity: "info" });
  if (quality >= 65 && metrics.headSway.value !== null && metrics.headSway.value < 16) insights.push({ title: "Relatively stable head trace", body: `Lateral nose movement stayed within ${round(metrics.headSway.value)}% of shoulder width in this clip. This is an observation, not a swing-quality score.`, drill: "Repeat with the same camera setup and compare consistency across 5 swings.", severity: "good" });
  if (insights.length === 0) insights.push({ title: "Establish your baseline", body: "We captured a first-pass pose trace. Review the estimated top and impact labels and correct them if needed before comparing swings.", drill: "Film 5 swings from a fixed face-on camera, then compare head and hip traces across clips.", severity: "info" });
  return insights.slice(0, 4);
}

export const metricText = (m: Metric) => m.value == null ? "—" : `${round(m.value)}${m.unit}`;
