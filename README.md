# Fairway AI — Golf Swing Lab (MVP)

A browser-based golf swing analysis application. Upload a face-on golf swing and get **real** body-pose tracking, visual overlays, motion measurements, estimated swing checkpoints, comparison, and a transparent rule-based coaching layer. Optional OpenAI-powered explanations can be added without sending raw videos to the API.

![Status](https://img.shields.io/badge/status-MVP-orange)

## Run it

Requires **Node.js 20.9+** and a browser with modern WebAssembly support. The first analysis needs internet access to download MediaPipe WASM and the pose model. No account, database, or API key is needed for the core analyzer.

```bash
npm install
npm run dev
# In another terminal: npm test
```

Open **http://localhost:3000** and upload an MP4/MOV/WebM golf swing (ideally 5–10 seconds). The first **18 seconds** are processed. In development the first model download and compile can take some time.

### Optional: AI interpretation

```bash
cp .env.example .env.local
# Edit .env.local and set OPENAI_API_KEY=your_key
npm run dev
# In another terminal: npm test
```

The button **Explain with AI** calls `/api/coach` with **numeric, 2D pose-derived metrics only**, not video. The key stays server-side. Without a key, local measurements and drill suggestions still work. API calls may incur usage charges. If deploying publicly, add rate limits, authentication, abuse protection, and spending limits **before enabling** the AI endpoint.

## Features implemented

- Upload and process a local golf swing video using **MediaPipe Pose Landmarker** (33 landmarks)
- Draw visible skeleton joints, original-address alignment axis, head trajectory
- Scrub and play in slow motion at 0.25×, 0.5×, 1×
- Estimate **address, top, impact, finish** (heuristic; top and impact can be manually corrected)
- Calculate camera-relative head movement, hip movement, projected torso angle, shoulder line, knee flex, and pose-coverage fraction
- Get rule-based observations and practice drills; optionally request an LLM explanation
- Compare two analyzed swing clips side by side and jump to corresponding checkpoints
- Runs in the browser without video upload, cloud storage, or server-side frame processing

## Important limitations (do not remove in a commercial build)

- **2D video is not calibrated 3D biomechanics.** Values depend on camera angle, lens, occlusion, posture, and pixel geometry; movement is expressed relative to **address shoulder width** (not inches).
- **The app cannot reliably infer clubhead speed, clubface angle, shot outcome, impact contact, pressure shift, ground-reaction force, or 3D joint angles.**
- **Swing checkpoint guesses are approximate.** Top is estimated from highest wrists; impact is a return-toward-address wrist-height candidate, **not verified contact**. Both can be corrected in the UI.
- **Some degree measurements are projected image-plane angles**, not joint anatomy. This is not medical or injury advice.
- **Coaching is heuristic**, not a validated golf instruction model. Personalized guidance should be evaluated with golf instructors and representative videos.
- Pose frames are sampled at roughly 9 FPS up to 120 total; this **can miss actual impact**, especially in fast swings. A future club-specific tracker and high-FPS decoding pipeline would address this.
- Currently analyzes one person, browser-side, and only the first 18 seconds of a video. Processing large videos can block the main thread because MediaPipe Web's `detectForVideo` is synchronous; move to a worker/decoding pipeline for production.
- Browser support varies by MOV codec. MP4/H.264 is the most predictable format.
- MediaPipe on-device inference keeps video pixels local, but Google may collect MediaPipe usage metrics as documented in its [privacy notice](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md).

## Architecture

```text
app/page.tsx -> components/SwingLab.tsx (state, upload, insights, comparison)
             -> components/VideoPlayer.tsx (scrub/player/canvas)
             -> lib/vision.ts (MediaPipe model and offline video sampling)
             -> lib/kinematics.ts (measurements, checkpoints, coaching rules)
             -> lib/overlay.ts (canvas tracking visuals)
app/api/coach/route.ts (optional OpenAI Responses API interpretation)
```

No data persistence yet. Each browser refresh clears the loaded videos and results.

## Suggested next milestones

1. Upload 15–30 real swings, validate tracking accuracy, common camera placements, and checkpoint detection; include manual address marking.
2. Move video inference to a worker/offscreen pipeline and add robust trim/crop controls.
3. Add shaft/clubhead detection via a specialist model. Ground-truth key impact events with 120–240fps footage.
4. Build a consistent swing normalization/calibration protocol (camera height, orientation, distance) and benchmark across golfers.
5. Save swing histories, coach notes, and goals in a database with explicit privacy/retention controls.
6. Add expert-reviewed drill library and evaluate whether coaching improves performance.

## Deployment

Push this folder to the GitHub repository you create and import the repository into Vercel (Next.js preset). Core pose processing runs client-side. Optional AI requires adding `OPENAI_API_KEY` as a server environment variable.

## Source links

- [MediaPipe Pose Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [MediaPipe JS API](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.poselandmarker)
- [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text)

## License

MIT (application code). Third-party packages/models retain their respective licenses and usage conditions.
