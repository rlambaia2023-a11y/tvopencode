// =====================================================================
// PLAYER — motor de streaming: HLS adaptativo + pré-buffer + watchdog
//
// Transmissão contínua (sem baixar o arquivo inteiro):
//  1. Pré-buffer: só inicia depois de acumular segundos suficientes
//  2. Codificação/qualidade adaptativas (ABR): começa leve e sobe
//     conforme a banda medida — evita travamento
//  3. Watchdog: monitora o buffer; se secar, recupera ou reconecta
//  4. Drift de live: reposiciona no ponto de sincronia quando atrasa
// =====================================================================
import { CONFIG } from "./config.js";

const S = CONFIG.stream;
const st = {
  hls: null, media: null, watchdog: null,
  starve: 0, restarts: 0, currentUrl: null, mode: null, hooks: null
};
const els = {};

const el = id => document.getElementById(id);

// ---------------- infra ----------------
function ensureHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CONFIG.cdn.hls;
    s.onload = () => resolve(window.Hls);
    s.onerror = () => reject(new Error("Falha ao carregar hls.js"));
    document.head.appendChild(s);
  });
}

function ytId(embedUrl) {
  const m = String(embedUrl).match(/\/embed\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Segundos de buffer disponíveis à frente da posição atual */
export function bufferAhead(media = st.media) {
  if (!media) return 0;
  try {
    for (let i = media.buffered.length - 1; i >= 0; i--) {
      if (media.currentTime >= media.buffered.start(i) - 0.5) {
        return Math.max(0, media.buffered.end(i) - media.currentTime);
      }
    }
  } catch {}
  return 0;
}

/**
 * Pré-buffer: resolve a promessa somente quando a mídia tem
 * `targetSeg` segundos armazenados à frente (e está tocando).
 */
function waitReady(media, targetSeg, timeoutMs, hooks) {
  media.play().catch(() => {});
  return new Promise((resolve, reject) => {
    let iv = null;
    let timer = 0;
    const done = (fn, arg) => { clearInterval(iv); clearTimeout(timer); fn(arg); };
    iv = setInterval(() => {
      const ahead = bufferAhead(media);
      if (hooks.onStatus && ahead > 0.3 && targetSeg > 1) {
        hooks.onStatus(`Armazenando buffer… ${Math.min(ahead, targetSeg).toFixed(1)}s`);
      }
      if (ahead >= targetSeg && !media.paused) done(resolve);
    }, 250);
    media.onerror = () => done(reject, new Error("erro de stream"));
    timer = setTimeout(() => {
      const ahead = bufferAhead(media);
      done(reject, new Error(ahead > 0 ? "buffer instável" : "timeout"));
    }, timeoutMs);
  });
}

// ---------------- codificação adaptativa ----------------
function hlsConfig(Hls) {
  return new Hls({
    enableWorker: true,          // decodificação fora da thread principal
    lowLatencyMode: false,       // estabilidade > latência
    // Começa na menor qualidade e sobe conforme a banda medida (ABR)
    startLevel: S.startLevel,
    testBandwidth: true,
    capLevelToPlayerSize: true,  // compressão: não baixa resolução inútil
    abrEwmaDefaultEstimate: 600000,
    abrEwmaFastLive: 2.5,
    // Buffer contínuo à frente, apaga o que já passou
    maxBufferLength: S.maxBufferLength,
    maxMaxBufferLength: S.maxMaxBufferLength,
    backBufferLength: S.backBufferLength,
    liveSyncDurationCount: S.liveSyncDurationCount
  });
}

/** Meta de pré-buffer por tipo de mídia */
function startTarget(mode) {
  return mode === "radio" ? 1 : S.minStart; // áudio precisa de pouco; vídeo, mais
}

function openStream(url, mode, hooks) {
  const media = mode === "radio" ? els.audio : els.video;
  st.currentUrl = url;
  st.media = media;
  st.mode = mode;
  st.hooks = hooks;
  showMedia(mode === "radio" ? "audio" : "video");

  const isHlsUrl = /\.m3u8(\?|$)/i.test(url);
  const nativeHls = media.canPlayType("application/vnd.apple.mpegurl");

  if (isHlsUrl && !nativeHls) {
    return ensureHls().then(Hls => {
      if (!Hls.isSupported()) return Promise.reject(new Error("HLS não suportado neste navegador"));
      if (st.hls) { try { st.hls.destroy(); } catch {} }
      const hls = hlsConfig(Hls);
      st.hls = hls;
      hls.on(Hls.Events.LEVEL_SWITCHED, () => hooks.onStatus?.("Otimizando qualidade…"));
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, d) => { st.ccTracks = d.subtitleTracks || []; hls.subtitleDisplay = false; });
      // recuperação imediata de falhas de rede/mídia (antes de virar travamento)
      let netRetries = 0;
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 4) {
          netRetries++;
          hooks.onStatus?.("Reconectando…");
          hls.startLoad();
          return;
        }
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && netRetries < 2) {
          netRetries++;
          hls.recoverMediaError();
          return;
        }
        hooks.onStatus?.("Reconectando…");
      });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), S.connectTimeout);
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { clearTimeout(timer); reject(new Error(d.details || "hls fatal")); } });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          clearTimeout(timer);
          waitReady(media, startTarget(mode), S.bufferTimeout, hooks).then(resolve, reject);
        });
        hls.loadSource(url);
        hls.attachMedia(media);
      });
    });
  }

  // Streams progressivos (rádio direta/áudio): transmissão contínua nativa
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), S.connectTimeout);
    media.onerror = () => { clearTimeout(timer); reject(new Error("erro de stream")); };
    media.src = url;
    waitReady(media, startTarget(mode), S.bufferTimeout, hooks)
      .then(ok => { clearTimeout(timer); resolve(ok); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

// ---------------- watchdog (recuperação automática) ----------------
function startWatchdog() {
  stopWatchdog();
  st.starve = 0;
  st.watchdog = setInterval(() => {
    const media = st.media;
    if (!media) return;
    const ahead = bufferAhead(media);

    // buffer secando → contabilizar seguidas e recuperar
    if (ahead < 0.6 && !media.paused) {
      st.starve++;
      if (st.starve === 3) st.hooks?.onStatus?.("Rede lenta — ajustando…");
      if (st.starve >= 5) { st.starve = 0; recover(); }
    } else {
      st.starve = 0;
    }

    // no vivo, se atrasou muito do ponto de sincronia, reposicionar
    if (st.hls && media.currentTime > 0 && !media.paused) {
      const live = st.hls.liveSyncPosition;
      if (live && media.currentTime < live - 8 && ahead > 1) media.currentTime = live;
    }
  }, 2000);
}

function stopWatchdog() {
  if (st.watchdog) { clearInterval(st.watchdog); st.watchdog = null; }
}

async function recover() {
  st.hooks?.onStatus?.("Reconectando…");
  if (st.hls) {
    try { st.hls.startLoad(); st.hls.recoverMediaError(); return; } catch {}
    await restartCurrent();
  } else if (st.media) {
    st.media.play().catch(() => {});
  }
}

/** Reinicia a mesma fonte (stream caiu de vez) */
async function restartCurrent() {
  if (st.restarts > 2 || !st.currentUrl) return;
  st.restarts++;
  const url = st.currentUrl;
  const mode = st.mode;
  const hooks = st.hooks;
  st.hooks?.onStatus?.("Reconectando…");
  try {
    hardStop();
    await openStream(url, mode, hooks);
    startWatchdog();
  } catch {/* fonte realmente morta; denúncialo no próximo watchdog */}
}

// ---------------- API ----------------
export async function play(item, mode, hooks = {}) {
  exitZen();
  stopWatchdog();
  st.restarts = 0;
  stop();

  if (mode === "webcam") {
    const embed = (item.video && item.video[0]) || null;
    const id = embed ? ytId(embed) : null;
    if (!id) return { ok: false, kind: "iframe", error: "Vídeo indisponível" };
    showMedia("iframe");
    els.frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
    return { ok: true, kind: "iframe" };
  }

  const isHttpsPage = location.protocol === "https:";
  // Em páginas https o navegador bloqueia http: melhor pular direto
  let sources = (item.streams || []).slice();
  sources = sources.filter(u => !(isHttpsPage && u.startsWith("http:")));
  sources.sort((a, b) => Number(b.startsWith("https:")) - Number(a.startsWith("https:"))); // https primeiro
  if (!sources.length) return { ok: false, error: "Nenhum stream disponível" };

  let lastErr = null;
  for (const url of sources) {
    try {
      await openStream(url, mode, hooks);
      startWatchdog();
      return { ok: true, kind: mode === "radio" ? "audio" : "video", usedStream: url };
    } catch (e) {
      lastErr = e;
      hardStop();
    }
  }
  hardStop();
  showMedia("none");
  return { ok: false, error: (lastErr && lastErr.message) || "Falha na reprodução" };
}

export function stop() {
  hardStop();
  showMedia("none");
}

function hardStop() {
  stopWatchdog();
  if (st.hls) { try { st.hls.destroy(); } catch {} st.hls = null; }
  st.currentUrl = null;
  st.media = null;
  st.ccTracks = [];
  for (const m of [els.video, els.audio].filter(Boolean)) {
    try { m.pause(); m.removeAttribute("src"); m.load(); } catch {}
  }
  if (els.frame) els.frame.src = "about:blank";
}

// ---------------- legendas (CC) do stream, quando existir ----------------
export function subtitleTracks() {
  return (st.hls && st.ccTracks && st.ccTracks.length)
    ? st.ccTracks.map((t, i) => ({ i, name: t.name || t.lang || `Trilha ${i + 1}`, lang: t.lang || "" }))
    : [];
}

/** Ativa uma trilha (-1 desliga). Mostra no próprio vídeo (render nativo). */
export function setSubtitle(i) {
  if (!st.hls) return false;
  st.hls.subtitleTrack = i >= 0 ? i : -1;
  st.hls.subtitleDisplay = i >= 0;
  return true;
}

// ---------------- estatísticas (medidor de cache) ----------------
export function getStats() {
  const media = st.media;
  if (!media) return null;
  const stats = { ahead: bufferAhead(media), bwKbps: null, px: null, dropped: null };
  if (st.hls) {
    if (typeof st.hls.bandwidthEstimate === "number" && st.hls.bandwidthEstimate > 0) {
      stats.bwKbps = Math.round(st.hls.bandwidthEstimate / 1000);
    }
    const lv = st.hls.levels && st.hls.currentLevel >= 0 ? st.hls.levels[st.hls.currentLevel] : null;
    if (lv && lv.height) stats.px = lv.height;
  }
  try {
    const q = media.getVideoPlaybackQuality ? media.getVideoPlaybackQuality() : null;
    if (q) stats.dropped = q.droppedVideoFrames;
  } catch {}
  return stats;
}

export function setVolume(v) {
  for (const m of [els.video, els.audio].filter(Boolean)) m.volume = v;
}

export function toggleMute() {
  for (const m of [els.video, els.audio].filter(Boolean)) m.muted = !m.muted;
  const m = els.video || els.audio;
  return m ? m.muted : true;
}

// telão (tela ampliada)
export function toggleZen() {
  document.body.classList.toggle("zen");
  window.dispatchEvent(new Event("resize"));
}
export function exitZen() {
  document.body.classList.remove("zen");
  window.dispatchEvent(new Event("resize"));
}

export function showMedia(kind) {
  if (!els.video) init();
  els.video.classList.toggle("hidden", kind !== "video");
  els.audioPanel.classList.toggle("hidden", kind !== "audio");
  els.frame.classList.toggle("hidden", kind !== "iframe");
}

export function init() {
  els.video = el("video-el");
  els.audio = el("audio-el");
  els.frame = el("frame-el");
  els.audioPanel = el("audio-panel");
  if (!els.video) return;
  els.frame.src = "about:blank";
  showMedia("none");
}
