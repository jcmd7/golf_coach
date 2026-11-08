"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Activity, ArrowRight, BadgeCheck, BarChart3, BrainCircuit, Camera, Check, ChevronDown, CircleHelp, CloudUpload, Crosshair, FileVideo, GitCompare, Layers3, MoveUpRight, Play, ScanLine, Settings2, ShieldCheck, Sparkles, Target, Upload, WandSparkles, X } from "lucide-react";
import VideoPlayer, { type PlayerHandle } from "./VideoPlayer";
import { analyzeVideo } from "@/lib/vision";
import { coachingInsights, measureSwing, metricText, type Metric, type Metrics, type PhaseKey, type SwingAnalysis } from "@/lib/kinematics";
import type { OverlayOptions } from "@/lib/overlay";

const PHASES: { key: PhaseKey; label: string; index: string }[] = [
  { key: "address", label: "Address", index: "01" }, { key: "top", label: "Top", index: "02" }, { key: "impact", label: "Impact*", index: "03" }, { key: "finish", label: "Finish", index: "04" },
];
const defaults: OverlayOptions = { skeleton: true, guides: true, trace: true };
const formatTime = (time: number) => `${time.toFixed(2)}s`;

function Figure() {
  return <svg className="placeholder-figure" width="250" height="270" viewBox="0 0 250 270" fill="none" aria-hidden="true">
    <circle cx="125" cy="112" r="99" stroke="#86aa94" strokeOpacity=".12" strokeDasharray="5 10"/>
    <path d="M23 246H226M126 10V260" stroke="#b7c7c1" strokeOpacity=".22" strokeDasharray="5 8"/>
    <path d="M70 91L132 70L181 105" stroke="#b5fe72" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M132 70L130 132M130 132L96 202L77 241M130 132L158 198L181 240" stroke="#62d7d0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M70 91L55 56L116 30M181 105L197 73L115 30" stroke="#ecd985" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M116 30L38 9" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    <path d="M132 70C120 55 118 50 120 45" stroke="#c2dbce" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="121" cy="39" r="14" stroke="#b5fe72" strokeWidth="3"/>
    {[[70,91],[132,70],[181,105],[130,132],[96,202],[77,241],[158,198],[181,240],[55,56],[197,73],[116,30]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="5.5" fill="#ed9473" stroke="#fefcf0" strokeWidth="1.5"/>)}
    <rect x="100" y="18" width="44" height="48" rx="6" stroke="#b5fe72" strokeOpacity=".65"/>
  </svg>;
}

function UploadCard({ onFile, kind = "primary", compact = false, busy = false }: { onFile: (file: File, kind: "primary" | "compare") => void; kind?: "primary" | "compare"; compact?: boolean; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const choose = (files: FileList | null) => { if (files?.[0]) onFile(files[0], kind); };
  const dropped = (e: DragEvent<HTMLDivElement>) => {e.preventDefault();setDrag(false);choose(e.dataTransfer.files);};
  return <div className={`upload-card ${drag ? "dragged" : ""} ${compact ? "upload-small" : ""}`} onDragOver={e => { e.preventDefault();setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={dropped}>
    {!compact && <Figure/>}
    <div className="upload-icon"><CloudUpload size={compact ? 21 : 25}/></div>
    <h2>{kind === "compare" ? "Add reference swing" : "Every great swing starts here."}</h2>
    <p>{kind === "compare" ? "Upload another swing to compare positions and measurements." : "Upload a golf swing to uncover what the camera can measure. No sensor, no special equipment."}</p>
    <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" style={{ display: "none" }} onChange={(e: ChangeEvent<HTMLInputElement>)=>{choose(e.target.files);e.target.value="";}} />
    <button className="btn btn-accent" onClick={()=>input.current?.click()} disabled={busy}><Upload size={16}/> {busy ? "Processing..." : "Upload swing video"}</button>
    <span className="upload-help">MP4, MOV or WebM · First 18s analyzed · Max 200 MB</span>
  </div>;
}

function MetricTile({ metric, icon }: { metric: Metric; icon: React.ReactNode }) {
  return <div className="metric-tile" title={metric.note}><div className="metric-heading"><span>{metric.label}</span>{icon}</div><div className="metric-number">{metricText(metric)}</div><div className="metric-note">{metric.note}</div></div>;
}

export default function SwingLab() {
  const [primary, setPrimary] = useState<SwingAnalysis | null>(null);
  const [compare, setCompare] = useState<SwingAnalysis | null>(null);
  const [tab, setTab] = useState<"analysis" | "compare">("analysis");
  const [overlay, setOverlay] = useState<OverlayOptions>(defaults);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [coachText, setCoachText] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const primaryRef = useRef<PlayerHandle>(null);
  const compareRef = useRef<PlayerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urls = useRef<{primary?: string; compare?: string}>({});

  useEffect(() => () => {abortRef.current?.abort();Object.values(urls.current).forEach(url => {if(url)URL.revokeObjectURL(url);});}, []);

  const load = useCallback(async (file: File, kind: "primary" | "compare") => {
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(true);setProgress(0);setError("");setCoachText("");
    try {
      const result = await analyzeVideo(file,(percent,message) => { if (!controller.signal.aborted) {setProgress(percent);setStatus(message);} }, controller.signal);
      if(controller.signal.aborted) {URL.revokeObjectURL(result.url);return;}
      if (urls.current[kind]) URL.revokeObjectURL(urls.current[kind]!);
      urls.current[kind] = result.url;
      if(kind === "primary") {setPrimary(result);setTab("analysis");setCurrentTime(0);} else {setCompare(result);setTab("compare");}
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Could not analyze the clip.");
    } finally { if (abortRef.current === controller) {setBusy(false);abortRef.current=null;} }
  },[]);
  const metrics: Metrics | null = useMemo(() => primary ? measureSwing(primary.frames, primary.phases) : null, [primary]);
  const altMetrics: Metrics | null = useMemo(() => compare ? measureSwing(compare.frames, compare.phases) : null, [compare]);
  const insights = useMemo(() => metrics ? coachingInsights(metrics) : [], [metrics]);
  const setPhase = (phase: PhaseKey) => {
    if (!primary) return;
    setPrimary(prev => prev ? {...prev, phases:{...prev.phases, [phase]: currentTime}} : prev);
    setCoachText("");
  };
  const jumpTo = (phase: PhaseKey, sync = tab === "compare") => {
    if (primary) primaryRef.current?.seek(primary.phases[phase]);
    if(sync && compare) compareRef.current?.seek(compare.phases[phase]);
  };
  const getCoach = async () => {
    if(!metrics)return;
    setCoachBusy(true);setCoachText("");
    try {
      const res=await fetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({metrics})});
      const data=await res.json() as {explanation?: string;error?:string};
      if(!res.ok) throw new Error(data.error||"AI explanation unavailable.");
      setCoachText(data.explanation||"No explanation generated.");
    }catch(e){setCoachText(e instanceof Error ? e.message : "AI explanation unavailable.");}
    finally {setCoachBusy(false);}
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand-mark"><div className="brand-icon"><Target size={24}/></div><div><strong>fairway<span> / </span>ai</strong><small>SWING INTELLIGENCE</small></div></div>
      <div className="side-group">WORKSPACE</div>
      <button className={`nav-item ${tab==="analysis"?"active":""}`} onClick={()=>setTab("analysis")}><ScanLine size={18}/> Swing analysis <span className="nav-arrow"><ArrowRight size={15}/></span></button>
      <button className={`nav-item ${tab==="compare"?"active":""}`} onClick={()=>setTab("compare")}><GitCompare size={18}/> Compare swings</button>
      <div className="side-group small-group">HOW IT WORKS</div>
      <div className="sidebar-steps"><div><span>01</span> Upload a video</div><div><span>02</span> Track your movement</div><div><span>03</span> Review your drills</div></div>
      <div className="sidebar-bottom"><div className="privacy-icon"><ShieldCheck size={16}/></div><div><strong>Local video analysis</strong><span>Videos are processed in your browser. AI text is optional.</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">WORKSPACE <span>/</span> {tab==="compare"?"COMPARE":"SWING LAB"}</div><div className="top-actions"><span className="model-dot"/> 2D POSE ENGINE <span className="divider-v"/> <span className="beta">BETA 0.1</span></div></header>
      <div className="main-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> THE SWING LAB</div><h1>{tab==="compare"?"Two swings. One clearer picture.":"Better golf, frame by frame."}</h1><p>{tab==="compare"?"Find the differences that actually show up on camera.":"See your motion, understand the mechanics, and practice with purpose."}</p></div>{primary && <button className="btn btn-outline" onClick={()=>document.getElementById("replace-video")?.click()}><Upload size={16}/> New swing</button>}<input id="replace-video" type="file" accept="video/*" hidden onChange={e=>{if(e.target.files?.[0])void load(e.target.files[0],"primary");e.target.value="";}}/></div>
        {error && <div className="error-banner"><CircleHelp size={18}/><span>{error}</span><button onClick={()=>setError("")} aria-label="Dismiss error"><X size={17}/></button></div>}
        {busy && <div className="processing"><div className="processing-top"><div><span className="spinner"/> <strong>{status}</strong></div><strong>{progress}%</strong></div><div className="progress-track"><div style={{width:`${progress}%`}}/></div><button onClick={()=>abortRef.current?.abort()}>Cancel analysis</button></div>}
        {!primary && tab==="analysis" && <><UploadCard onFile={load} busy={busy}/><div className="feature-row"><div><ScanLine size={18}/> 33 body landmarks</div><div><Activity size={18}/> Motion measurements</div><div><BrainCircuit size={18}/> Coaching insights</div></div></>}
        {!primary && tab==="compare" && <><UploadCard onFile={load} busy={busy}/><p className="hint-under">Upload your first swing before comparing.</p></>}
        {primary && <>
          {tab==="analysis" ? <div className="work-grid">
            <div className="work-main"><VideoPlayer ref={primaryRef} clip={primary} overlay={overlay} title="SWING 01 — SOURCE VIDEO" onTimeChange={setCurrentTime}/><div className="phase-panel"><div className="panel-heading"><span><Crosshair size={18}/> Swing checkpoints</span><small>Estimated from wrist position — adjust as needed</small></div><div className="phases">{PHASES.map(phase=><button key={phase.key} className="phase-button" onClick={()=>jumpTo(phase.key)}><span className="phase-index">{phase.index}</span><strong>{phase.label}</strong><small>{formatTime(primary.phases[phase.key])}</small></button>)}</div><div className="phase-actions"><span>At {formatTime(currentTime)}:</span><button onClick={()=>setPhase("top")}>Mark top here</button><button onClick={()=>setPhase("impact")}>Mark impact here</button></div></div></div>
            <div className="work-rail"><div className="rail-panel"><div className="panel-heading"><span><Layers3 size={17}/> Motion overlays</span><Settings2 size={16}/></div>{([ ["skeleton","Pose skeleton","Joint tracking"], ["guides","Reference axis","Address alignment"], ["trace","Head path","Movement trail"] ] as const).map(([key,label,description])=><label key={key} className="toggle-row"><div><strong>{label}</strong><small>{description}</small></div><input type="checkbox" checked={overlay[key]} onChange={e=>setOverlay(prev=>({...prev,[key]:e.target.checked}))}/><span className="switch"/></label>)}</div><div className="rail-panel quality-card"><div className="panel-heading"><span><BadgeCheck size={17}/> Tracking confidence</span></div><div className="quality-score">{Math.round(metrics?.tracking.value ?? 0)}<span>%</span></div><div className="mini-track"><div style={{width:`${metrics?.tracking.value??0}%`}}/></div><p>Frames with a detected pose. This is not a golf swing quality score.</p></div><div className="tip-panel"><div><Camera size={18}/> CAMERA TIP</div><p>Film face-on, tripod fixed, entire body visible, ideally 60 fps or higher.</p></div></div>
          </div> : <div className="compare-grid"><div><VideoPlayer ref={primaryRef} clip={primary} overlay={overlay} title="SWING A — BASELINE" compact onTimeChange={setCurrentTime}/><div className="clip-sub">{primary.name}</div></div><div>{compare ? <><VideoPlayer ref={compareRef} clip={compare} overlay={overlay} title="SWING B — REFERENCE" compact/><div className="clip-sub">{compare.name} <button className="replace-ref" onClick={()=>document.getElementById("replace-reference")?.click()}>Replace reference</button><input id="replace-reference" type="file" accept="video/*" hidden onChange={e=>{if(e.target.files?.[0])void load(e.target.files[0],"compare");e.target.value="";}}/></div></> : <UploadCard kind="compare" compact onFile={load} busy={busy}/>}</div><div className="sync-panel"><strong><GitCompare size={17}/> Jump to same checkpoint</strong><div className="sync-buttons">{PHASES.map(p=><button key={p.key} onClick={()=>jumpTo(p.key,true)} disabled={!compare}>{p.label}</button>)}</div><p>Checkpoints align by estimated swing phase, not by absolute video time.</p></div></div>}
          <section className="metrics-section"><div className="section-heading"><div><div className="eyebrow">MOVEMENT DATA</div><h2>{tab==="compare"?"Swing comparison":"The numbers behind your swing"}</h2></div><span className="section-tag">2D IMAGE ESTIMATES <CircleHelp size={14}/></span></div>
            {tab==="analysis" ? <div className="metric-grid">{metrics && <><MetricTile metric={metrics.headSway} icon={<Crosshair size={17}/>}/><MetricTile metric={metrics.hipSway} icon={<Activity size={17}/>}/><MetricTile metric={metrics.spineChange} icon={<MoveUpRight size={17}/>}/><MetricTile metric={metrics.shoulderTilt} icon={<Layers3 size={17}/>}/><MetricTile metric={metrics.kneeFlex} icon={<Target size={17}/>}/><MetricTile metric={metrics.tracking} icon={<ScanLine size={17}/>}/></>}</div> : <div className="comparison-table"><div className="comparison-row comparison-head"><span>Metric</span><span>Swing A</span><span>Swing B</span></div>{metrics && (["headSway","hipSway","spineChange","shoulderTilt","kneeFlex","tracking"] as const).map(key=><div className="comparison-row" key={key}><span>{metrics[key].label}</span><strong>{metricText(metrics[key])}</strong><strong>{altMetrics ? metricText(altMetrics[key]):"—"}</strong></div>)}</div>}
            <p className="measurement-disclaimer"><CircleHelp size={15}/> Camera-relative data only. No calibrated inches, club-face data, launch data, or validated 3D joint angles. Obstructions and perspective affect measurements.</p>
          </section>
          <section className="coaching-section"><div className="section-heading"><div><div className="eyebrow">YOUR NEXT MOVE</div><h2>Coach&apos;s notes</h2></div><button className="btn btn-outline coach-action" onClick={getCoach} disabled={coachBusy}><Sparkles size={16}/>{coachBusy?"Generating...":"Explain with AI"}</button></div>
            <div className="insight-grid">{insights.map((insight,i)=><article key={i} className="insight-card"><div className={`insight-kicker ${insight.severity}`}><span className="insight-dot"/>{insight.severity === "focus" ? "REVIEW" : insight.severity === "good" ? "POSITIVE SIGNAL" : "OBSERVATION"}</div><h3>{insight.title}</h3><p>{insight.body}</p><div className="drill"><span><WandSparkles size={15}/> PRACTICE DRILL</span><p>{insight.drill}</p></div></article>)}</div>
            {coachText && <div className="llm-result"><div><BrainCircuit size={19}/> OPTIONAL AI INTERPRETATION</div><p>{coachText}</p></div>}
            <div className="footer-note"><ShieldCheck size={17}/> Swing analysis runs on this device. Optional AI text sends numeric measurements, not your video, to the server.</div>
          </section>
        </>}
      </div>
    </main>
  </div>;
}
