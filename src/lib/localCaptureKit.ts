export interface LocalCaptureConfig {
  videoIndex: number;
  audioIndex: number;
  audioDeviceName: string;
  displayW: number;
  displayH: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  pixelFormat: string;
  outputDir: string;
  filePrefix: string;
  segmentSeconds: number;
  segmented: boolean;
  crf: number;
  preset: string;
}

export interface LocalCaptureFile {
  filename: string;
  body: string;
}

export const defaultLocalCaptureConfig: LocalCaptureConfig = {
  videoIndex: 1,
  audioIndex: 2,
  audioDeviceName: "BlackHole 2ch",
  displayW: 2560,
  displayH: 1440,
  x: 0,
  y: 0,
  w: 1280,
  h: 720,
  fps: 30,
  pixelFormat: "uyvy422",
  outputDir: "$HOME/Recordings",
  filePrefix: "parallax-region",
  segmentSeconds: 0,
  segmented: false,
  crf: 20,
  preset: "veryfast",
};

const shellQuote = (value: string) => `'${value.split("'").join("'\\''")}'`;

const htmlEscape = (value: string | number) =>
  String(value)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");

function configBlock(config: LocalCaptureConfig) {
  return `VIDEO_INDEX=${config.videoIndex}
AUDIO_INDEX=${config.audioIndex}
DISPLAY_W=${config.displayW}
DISPLAY_H=${config.displayH}
CROP_X=${config.x}
CROP_Y=${config.y}
CROP_W=${config.w}
CROP_H=${config.h}
FPS=${config.fps}
PIXEL_FORMAT=${shellQuote(config.pixelFormat)}
OUTDIR=${shellQuote(config.outputDir)}
FILE_PREFIX=${shellQuote(config.filePrefix)}
SEGMENT_SECONDS=${config.segmented ? Math.max(5, config.segmentSeconds) : 0}
CRF=${config.crf}
PRESET=${shellQuote(config.preset)}`;
}

export function generateLocalCaptureSetup(config: LocalCaptureConfig) {
  return `# Local Capture Kit

This export gives you an unattended local recorder for a fixed screen region.

Current preset:

- Display: ${config.displayW}x${config.displayH}
- Crop: ${config.w}x${config.h} at (${config.x}, ${config.y})
- FPS: ${config.fps}
- Video index: ${config.videoIndex}
- Audio index: ${config.audioIndex}
- Audio device hint: ${config.audioDeviceName}
- Output: ${config.outputDir}/${config.filePrefix}-YYYYMMDD-HHMMSS.mp4

Notes:

1. macOS needs Screen Recording permission for the Terminal app you launch from.
2. macOS audio routing still depends on BlackHole or a similar loopback device.
3. Windows audio depends on the exact device name you provide.
4. This is intentionally local-only. The browser does not capture the region for you.
`;
}

export function generateMacCaptureCommand(config: LocalCaptureConfig) {
  return `#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")"

${configBlock(config)}

PIDFILE="\${TMPDIR:-/tmp}/parallax-region-recorder.pid"
FFPIDFILE="\${PIDFILE}.ffmpeg"
LOGFILE="\${OUTDIR}/recorder.log"
mkdir -p "$OUTDIR"

say()  { printf "\\033[1;36m▸\\033[0m %s\\n" "$*"; }
ok()   { printf "\\033[1;32m✓\\033[0m %s\\n" "$*"; }
warn() { printf "\\033[1;33m!\\033[0m %s\\n" "$*"; }
err()  { printf "\\033[1;31m✗\\033[0m %s\\n" "$*" >&2; }
pause(){ printf "\\nPress return to continue… "; read -r _; }

ensure_deps() {
  if ! command -v brew >/dev/null 2>&1; then
    err "Homebrew is required. Install it from https://brew.sh first."
    pause; exit 1
  fi
  command -v ffmpeg >/dev/null 2>&1 || brew install ffmpeg || exit 1
  brew list --cask blackhole-2ch >/dev/null 2>&1 || brew install --cask blackhole-2ch || exit 1
}

list_devices() {
  ensure_deps
  ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1 || true
  pause
}

doctor() {
  ensure_deps
  [ "$CROP_W" -gt 0 ] && [ "$CROP_H" -gt 0 ] || { err "Bad crop size"; return 1; }
  [ $((CROP_X + CROP_W)) -le "$DISPLAY_W" ] || { err "Crop exceeds display width"; return 1; }
  [ $((CROP_Y + CROP_H)) -le "$DISPLAY_H" ] || { err "Crop exceeds display height"; return 1; }
  local devs; devs="$(ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1 || true)"
  echo "$devs" | grep -qi "BlackHole" || { err "BlackHole not detected"; return 1; }
  echo "$devs" | grep -q "\\[$VIDEO_INDEX\\]" || { err "Video index $VIDEO_INDEX not found"; return 1; }
  echo "$devs" | grep -q "\\[$AUDIO_INDEX\\]" || { err "Audio index $AUDIO_INDEX not found"; return 1; }
  ok "Doctor passed"
}

ff_run() {
  local out="$1"; shift || true
  ffmpeg -hide_banner -loglevel warning -nostdin \\
    -f avfoundation -pixel_format "$PIXEL_FORMAT" -framerate "$FPS" \\
    -video_size "\${DISPLAY_W}x\${DISPLAY_H}" -capture_cursor 0 \\
    -i "\${VIDEO_INDEX}:\${AUDIO_INDEX}" \\
    -vf "crop=\${CROP_W}:\${CROP_H}:\${CROP_X}:\${CROP_Y}" \\
    -c:v libx264 -preset "$PRESET" -crf "$CRF" -pix_fmt yuv420p \\
    -c:a aac -b:a 192k -movflags +faststart \\
    "$@" "$out"
}

test_capture() {
  doctor || { pause; return; }
  local out="$OUTDIR/\${FILE_PREFIX}-test-$(date +%Y%m%d-%H%M%S).mp4"
  ff_run "$out" -t 8 || { err "ffmpeg failed"; pause; return; }
  ok "Saved $out"
  command -v open >/dev/null 2>&1 && open -R "$out" || true
  pause
}

start_rec() {
  doctor || { pause; return; }
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    warn "Already running"
    pause
    return
  fi
  rm -f "$PIDFILE" "$FFPIDFILE"
  (
    trap 'rm -f "$PIDFILE" "$FFPIDFILE"' EXIT
    echo $$ > "$PIDFILE"
    while true; do
      local ts out
      ts="$(date +%Y%m%d-%H%M%S)"
      out="$OUTDIR/\${FILE_PREFIX}-$ts.mp4"
      if [ "$SEGMENT_SECONDS" -gt 0 ]; then
        ff_run "$out" -t "$SEGMENT_SECONDS" & FFPID=$!
      else
        ff_run "$out" & FFPID=$!
      fi
      echo "$FFPID" > "$FFPIDFILE"
      wait "$FFPID" || true
      rm -f "$FFPIDFILE"
      [ "$SEGMENT_SECONDS" -gt 0 ] || break
      [ -f "$PIDFILE" ] || break
    done
  ) >"$LOGFILE" 2>&1 &
  disown 2>/dev/null || true
  ok "Recording in background. Log: $LOGFILE"
  pause
}

stop_rec() {
  if [ ! -f "$PIDFILE" ]; then
    warn "Not running"
    pause
    return
  fi
  [ -f "$FFPIDFILE" ] && kill -INT "$(cat "$FFPIDFILE")" 2>/dev/null || true
  sleep 1
  [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null || true
  rm -f "$PIDFILE" "$FFPIDFILE"
  ok "Stopped"
  pause
}

menu() {
  while true; do
    clear
    echo "PARALLAX LOCAL CAPTURE KIT"
    echo "crop $CROP_W x $CROP_H @ ($CROP_X,$CROP_Y) · $FPS fps"
    echo
    echo "1) Test 8-second sample"
    echo "2) Start recording"
    echo "3) Stop recording"
    echo "4) List devices"
    echo "5) Open recordings folder"
    echo "q) Quit"
    printf "choose ▸ "
    read -r choice
    case "$choice" in
      1) test_capture ;;
      2) start_rec ;;
      3) stop_rec ;;
      4) list_devices ;;
      5) command -v open >/dev/null 2>&1 && open "$OUTDIR" || true ;;
      q|Q) exit 0 ;;
    esac
  done
}

menu
`;
}

export function generateWindowsCaptureApp(config: LocalCaptureConfig) {
  return String.raw`<!doctype html>
<html>
<head>
  <meta http-equiv="x-ua-compatible" content="IE=edge">
  <title>Parallax Local Capture Kit</title>
  <hta:application
    id="ParallaxLocalCapture"
    applicationname="Parallax Local Capture"
    border="thin"
    caption="yes"
    maximizebutton="yes"
    minimizebutton="yes"
    showintaskbar="yes"
    singleinstance="yes"
    sysmenu="yes" />
  <style>
    body { margin: 0; font-family: Segoe UI, system-ui, sans-serif; background: #09111a; color: #eef4ff; }
    .app { min-height: 100vh; padding: 24px; background: linear-gradient(135deg, #0a1422, #0c2742 45%, #33182d); }
    .panel { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); border-radius: 14px; padding: 18px; box-shadow: 0 20px 50px rgba(0,0,0,.28); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .stat { padding: 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: rgba(0,0,0,.18); }
    button { appearance: none; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.12); color: white; border-radius: 12px; padding: 12px 14px; cursor: pointer; font-weight: 600; }
    button:hover { background: rgba(255,255,255,.18); }
    .primary { background: #ff244f; }
    input { width: 100%; margin-top: 8px; background: rgba(0,0,0,.22); color: white; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 10px; }
    pre { margin: 0; max-height: 280px; overflow: auto; border-radius: 12px; background: rgba(0,0,0,.25); padding: 12px; }
  </style>
</head>
<body>
  <div class="app">
    <div class="panel">
      <h1 style="margin:0 0 6px">Parallax Local Capture Kit</h1>
      <p style="margin:0 0 18px;color:#b7cbe3">Silent region recorder launcher for Windows.</p>
      <div class="grid">
        <div class="stat"><strong>${htmlEscape(config.w)}×${htmlEscape(config.h)}</strong><div>crop size</div></div>
        <div class="stat"><strong>${htmlEscape(config.x)}, ${htmlEscape(config.y)}</strong><div>offset</div></div>
      </div>
      <label style="display:block;margin-top:16px">Audio device name</label>
      <input id="audioDevice" value="${htmlEscape(config.audioDeviceName)}" />
      <label style="display:block;margin-top:16px">Output folder</label>
      <input id="outputDir" value="%USERPROFILE%\\Recordings" />
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <button class="primary" onclick="alert('Use this HTA as a starter for your local ffmpeg workflow. Configure the exact DirectShow audio device name before running.')">Start guide</button>
        <button onclick="window.close()">Close</button>
      </div>
      <div style="margin-top:18px">
        <pre>Crop: ${htmlEscape(config.w)}x${htmlEscape(config.h)} at (${htmlEscape(config.x)}, ${htmlEscape(config.y)})
FPS: ${htmlEscape(config.fps)}
Video source: desktop
Audio device hint: ${htmlEscape(config.audioDeviceName)}

Recommended workflow:
1. Install ffmpeg.
2. Install a Windows loopback device if you need system audio.
3. Replace the audio device name with the exact DirectShow input.
4. Launch your own ffmpeg command using this region preset.</pre>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function generateLocalCaptureReadme(config: LocalCaptureConfig) {
  return `Parallax Local Capture Kit
==========================

This kit exports a local-only fixed region recorder starter.

Preset:
- Crop: ${config.w}x${config.h} @ (${config.x}, ${config.y})
- Display: ${config.displayW}x${config.displayH}
- FPS: ${config.fps}

Mac:
- Double-click Parallax Local Capture.command
- Allow Terminal screen recording when prompted
- Use BlackHole 2ch for system audio loopback

Windows:
- Open Parallax Local Capture.hta
- Install ffmpeg manually
- Use the exact DirectShow audio device name if you need audio
`;
}

export function generateLocalCaptureFiles(config: LocalCaptureConfig, platform: "mac" | "win"): LocalCaptureFile[] {
  if (platform === "mac") {
    return [
      { filename: "Parallax Local Capture.command", body: generateMacCaptureCommand(config) },
      { filename: "SETUP.md", body: generateLocalCaptureSetup(config) },
      { filename: "README.txt", body: generateLocalCaptureReadme(config) },
    ];
  }

  return [
    { filename: "Parallax Local Capture.hta", body: generateWindowsCaptureApp(config) },
    { filename: "SETUP.md", body: generateLocalCaptureSetup(config) },
    { filename: "README.txt", body: generateLocalCaptureReadme(config) },
  ];
}