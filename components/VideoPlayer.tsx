"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pause, Play, RotateCcw, VolumeX } from "lucide-react";
import type { OverlayOptions } from "@/lib/overlay";
import { drawOverlay } from "@/lib/overlay";
import { nearestFrame, type SwingAnalysis } from "@/lib/kinematics";

export type PlayerHandle = { seek: (time: number) => void; pause: () => void };
type Props = { clip: SwingAnalysis; overlay: OverlayOptions; title: string; compact?: boolean; onTimeChange?: (time: number) => void };
const pretty = (value: number) => `${Math.floor(value / 60).toString().padStart(2,"0")}:${Math.floor(value % 60).toString().padStart(2,"0")}`;

const VideoPlayer = forwardRef<PlayerHandle, Props>(function VideoPlayer({ clip, overlay, title, compact = false, onTimeChange }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(.5);
  useImperativeHandle(ref, () => ({
    seek: t => { const v = videoRef.current; if (v) { v.currentTime = Math.max(0, Math.min(clip.analyzedDuration, t)); setTime(v.currentTime); } },
    pause: () => { videoRef.current?.pause(); setPlaying(false); },
  }), [clip.analyzedDuration]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause(); v.currentTime = 0; setTime(0); setPlaying(false);
  }, [clip.url]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current; const canvas = canvasRef.current;
      if (v && canvas) {
        if (!v.paused && v.currentTime >= clip.analyzedDuration) { v.pause(); setPlaying(false); }
        const current = Math.min(v.currentTime, clip.analyzedDuration);
        const pose = nearestFrame(clip.frames, current);
        const address = nearestFrame(clip.frames, clip.phases.address);
        drawOverlay(canvas, pose, address, overlay, clip.frames);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clip, overlay]);

  const play = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) { v.pause(); setPlaying(false); return; }
    if (v.currentTime >= clip.analyzedDuration - .1) v.currentTime = 0;
    try { v.playbackRate = speed; await v.play(); setPlaying(true); } catch { setPlaying(false); }
  };
  return (
    <div className={`player-shell ${compact ? "player-compact" : ""}`}>
      <div className="player-topline"><div><span className="signal"/> {title}</div><span className="muted-tag">{clip.width} × {clip.height} · 2D POSE</span></div>
      <div className="player-stage" style={{ aspectRatio: `${clip.width} / ${clip.height}` }}>
        <video ref={videoRef} src={clip.url} muted playsInline preload="auto" onTimeUpdate={e => { const t=Math.min(e.currentTarget.currentTime, clip.analyzedDuration);setTime(t);onTimeChange?.(t); }} onEnded={() => setPlaying(false)} />
        <canvas ref={canvasRef} width={clip.width} height={clip.height} aria-hidden="true" />
        <div className="stage-pill"><span className="live-dot"/> TRACKED VIDEO</div>
        <div className="stage-bottom"><span>FACE-ON ANALYSIS</span><span>{clip.frames.filter(f=>f.landmarks).length}/{clip.frames.length} SAMPLES</span></div>
      </div>
      <div className="player-controls">
        <button className="play-button" onClick={play} aria-label={playing ? "Pause video" : "Play video"}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
        <span className="time-label">{pretty(time)}</span>
        <input aria-label="Scrub swing video" className="seek-range" type="range" min="0" max={clip.analyzedDuration} step="0.01" value={Math.min(time, clip.analyzedDuration)} onChange={e => { const t=Number(e.target.value); if(videoRef.current) videoRef.current.currentTime=t; setTime(t); onTimeChange?.(t); }} style={{ "--seek-progress": `${time / clip.analyzedDuration * 100}%` } as React.CSSProperties} />
        <span className="time-label">{pretty(clip.analyzedDuration)}</span>
        <button className="icon-button" title="Restart" aria-label="Restart" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.pause(); } setPlaying(false); }}><RotateCcw size={16}/></button>
        <select aria-label="Playback speed" className="speed-select" value={speed} onChange={e => {const n=Number(e.target.value);setSpeed(n);if(videoRef.current)videoRef.current.playbackRate=n;}}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option></select>
        <VolumeX size={15} color="#6b7d83" />
      </div>
      {clip.analyzedDuration < clip.duration - .05 && <div className="clip-notice">Only the first 18 seconds were analyzed.</div>}
    </div>
  );
});

export default VideoPlayer;
