import test from "node:test";
import assert from "node:assert/strict";
import { estimatePhases, measureSwing, coachingInsights, nearestFrame } from "../lib/kinematics.ts";

function makeFrames(count = 45) {
  return Array.from({ length: count }, (_, i) => {
    const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
    p[0] = { x: .5 + Math.sin(i / 15) * .015, y: .18, visibility: 1 };
    p[11] = { x: .4, y: .32, visibility: 1 }; p[12] = { x: .6, y: .32, visibility: 1 };
    p[15] = { x: .4, y: .6 - Math.sin(i / (count - 1) * Math.PI) * .32, visibility: 1 };
    p[16] = { x: .6, y: .6 - Math.sin(i / (count - 1) * Math.PI) * .32, visibility: 1 };
    p[23] = { x: .44, y: .57, visibility: 1 }; p[24] = { x: .56, y: .57, visibility: 1 };
    p[25] = { x: .45, y: .78, visibility: 1 }; p[26] = { x: .55, y: .78, visibility: 1 };
    p[27] = { x: .45, y: .94, visibility: 1 }; p[28] = { x: .55, y: .94, visibility: 1 };
    return { time: i * .1, landmarks: p };
  });
}

test("estimated swing phases progress through a synthetic backswing/downswing", () => {
  const frames = makeFrames(); const phases = estimatePhases(frames);
  assert.ok(phases.top > phases.address);
  assert.ok(phases.impact > phases.top);
  assert.ok(phases.finish >= phases.impact);
});

test("camera-relative head movement and tracking coverage are finite", () => {
  const frames = makeFrames(); const metrics = measureSwing(frames, estimatePhases(frames));
  assert.equal(metrics.tracking.value, 100);
  assert.ok(metrics.headSway.value > 0);
  assert.ok(metrics.headSway.value < 100);
  assert.equal(metrics.shoulderTilt.value, 0);
  assert.ok(coachingInsights(metrics).length > 0);
});

test("missing poses do not produce invented measurements", () => {
  const frames = [{time:0,landmarks:null},{time:.1,landmarks:null}];
  const metrics = measureSwing(frames, estimatePhases(frames));
  assert.equal(metrics.tracking.value, 0);
  assert.equal(metrics.headSway.value, null);
  assert.equal(metrics.hipSway.value, null);
  assert.match(coachingInsights(metrics)[0].title, /camera/i);
});

test("nearest-frame lookup is stable at boundaries", () => {
  const frames = makeFrames(5);
  assert.equal(nearestFrame(frames, -3)?.time, 0);
  assert.equal(nearestFrame(frames, 99)?.time, .4);
});


// Benchmark 1 tests capture usability, not actual golf coaching accuracy.
import { evaluateBenchmark, benchmarkReport, hasCorePose } from "../lib/benchmark.ts";

test("benchmark quality gate passes an ordered, well tracked synthetic capture", () => {
  const frames = makeFrames();
  const clip = { id: "fixture", name: "synthetic.mp4", url: "blob:test", duration: 4.4, analyzedDuration: 4.4, width: 1080, height: 1920, frames, phases: estimatePhases(frames) };
  const result = evaluateBenchmark(clip);
  assert.equal(result.passed, true, JSON.stringify(result.checks));
  assert.equal(benchmarkReport(clip).result.passed, true);
});

test("benchmark gate rejects missing key joints even if pose arrays exist", () => {
  const frames = makeFrames();
  for (const frame of frames) frame.landmarks[27].visibility = 0.1;
  const result = evaluateBenchmark({ frames, phases: estimatePhases(frames), width: 1080, height: 1920, analyzedDuration: 4.4 });
  assert.equal(hasCorePose(frames[0].landmarks), false);
  assert.equal(result.passed, false);
  assert.ok(result.checks.some(check => check.id === "landmarks" && !check.passed));
  assert.ok(result.checks.some(check => check.id === "metrics" && !check.passed));
});

test("benchmark gate detects out-of-order checkpoint edits", () => {
  const frames = makeFrames();
  const phases = estimatePhases(frames);
  const result = evaluateBenchmark({ frames, phases: { ...phases, impact: phases.top - .1 }, width: 1080, height: 1920, analyzedDuration: 4.4 });
  assert.equal(result.passed, false);
  assert.ok(result.checks.some(check => check.id === "phases" && !check.passed));
});
