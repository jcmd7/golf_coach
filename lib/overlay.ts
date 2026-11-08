import type { Landmark, PoseFrame } from "./kinematics";

export type OverlayOptions = { skeleton: boolean; guides: boolean; trace: boolean };
const elbow = [[11,13],[13,15],[12,14],[14,16]];
const trunk = [[11,12],[11,23],[12,24],[23,24]];
const legs = [[23,25],[25,27],[24,26],[26,28]];

function point(p: Landmark | undefined, width: number, height: number) { return p ? { x: p.x * width, y: p.y * height } : null; }
function v(p: Landmark | undefined) { return !!p && (p.visibility ?? 1) >= .45; }
function drawLine(ctx: CanvasRenderingContext2D, a: Landmark | undefined, b: Landmark | undefined, color: string, w: number, h: number, lineWidth = 4) {
  if (!v(a) || !v(b)) return;
  const p1 = point(a,w,h)!; const p2 = point(b,w,h)!;
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
}

export function drawOverlay(canvas: HTMLCanvasElement, frame: PoseFrame | null, baseline: PoseFrame | null, options: OverlayOptions, history: PoseFrame[] = []) {
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  const p = frame?.landmarks;
  if (!p) return;
  ctx.save();
  if (options.guides && baseline?.landmarks) {
    const b = baseline.landmarks;
    const a = v(b[23]) && v(b[24]) ? (b[23].x + b[24].x) / 2 : .5;
    ctx.strokeStyle = "rgba(255,255,255,.65)"; ctx.lineWidth = 2.2; ctx.setLineDash([11,9]);
    ctx.beginPath(); ctx.moveTo(a*w,0);ctx.lineTo(a*w,h);ctx.stroke();ctx.setLineDash([]);
    if (v(b[0])) {
      const x = b[0].x*w; const y = b[0].y*h;
      ctx.strokeStyle = "rgba(202,255,95,.65)"; ctx.lineWidth = 2;
      ctx.strokeRect(x-w*.043,y-h*.052,w*.086,h*.104);
    }
  }
  if (options.trace && history.length) {
    ctx.strokeStyle = "#b9f968";ctx.lineWidth = 3;ctx.setLineDash([6,6]);
    ctx.beginPath();let started = false;
    for (const f of history) {
      if (f.time > (frame?.time ?? 0)) break;
      const n = f.landmarks?.[0];if (!v(n)) { started=false;continue; }
      if (!started) {ctx.moveTo(n.x*w,n.y*h);started=true;} else ctx.lineTo(n.x*w,n.y*h);
    }
    ctx.stroke();ctx.setLineDash([]);
  }
  if (options.skeleton) {
    trunk.forEach(([a,b]) => drawLine(ctx,p[a],p[b],"#5de8e9",w,h));
    elbow.forEach(([a,b]) => drawLine(ctx,p[a],p[b],"#f5dc61",w,h));
    legs.forEach(([a,b]) => drawLine(ctx,p[a],p[b],"#e9d86c",w,h));
    if (v(p[11])&&v(p[12])&&v(p[23])&&v(p[24])) {
      drawLine(ctx,{x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2},{x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2},"#64ebdc",w,h,5);
    }
    [...new Set([...trunk,...elbow,...legs].flat())].forEach(i => { const n=p[i];if(!v(n))return;ctx.beginPath();ctx.arc(n.x*w,n.y*h,Math.max(4,w*.007),0,Math.PI*2);ctx.fillStyle="#f98b68";ctx.fill();ctx.strokeStyle="white";ctx.lineWidth=2;ctx.stroke(); });
    const n=p[0];if(v(n)) {ctx.beginPath();ctx.arc(n.x*w,n.y*h,Math.max(5,w*.009),0,Math.PI*2);ctx.fillStyle="#6ae0ff";ctx.fill();ctx.strokeStyle="white";ctx.lineWidth=2;ctx.stroke();}
  }
  ctx.restore();
}
