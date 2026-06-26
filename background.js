/**
 * FocusValve — Service Worker (ES Module)
 *
 * Hosts the Transformers.js pipeline and handles classification requests
 * from content scripts. One pipeline instance shared across all tabs.
 *
 * Protocol:
 *   Content → BG: { action: "classify", text: string, keywords: string[] }
 *   BG → Content: { match: boolean }
 */
'use strict';

// ── Service Worker polyfills ──
// MV3 service workers lack DOM APIs that ONNX runtime internally calls
// during WASM backend initialization (even with numThreads=1).

if (typeof btoa === 'undefined') {
  self.btoa = function (str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const bytes = new TextEncoder().encode(str);
    let result = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b1 = bytes[i], b2 = bytes[i + 1] || 0, b3 = bytes[i + 2] || 0;
      result += chars[b1 >> 2] + chars[((b1 & 3) << 4) | (b2 >> 4)];
      result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
      result += i + 2 < bytes.length ? chars[b3 & 63] : '=';
    }
    return result;
  };
}

if (typeof URL.createObjectURL === 'undefined') {
  // ONNX runtime calls this during WASM backend init to set up worker blobs.
  // With numThreads=1 no workers are spawned — return a dummy URL.
  URL.createObjectURL = () => 'data:application/javascript,';
  URL.revokeObjectURL = () => {};
}

// ── Constants ──
const SIMILARITY_THRESHOLD = 0.78;
const STORAGE_KEY = 'focus_valve_state';

// ── State ──
let pipelineHandle = null;
let pipelineLoading = false;

// Embedding caches survive until the service worker is terminated
// (MV3 workers are ephemeral, but this is fine — lazy rebuild)
const textCache = new Map();   // textHash → Float32Array
const kwCache = new Map();     // keyword → Float32Array

// ── Helpers ──
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return String(hash);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, dot));
}

/**
 * Heuristic keyword match — avoids both naive substring bleed and rigid \b misses.
 * Rule A: contains digit → loose includes.  Rule B: short alpha ≤3 → strict boundary.
 * Rule C: else → includes.
 */
function isKeywordMatch(kw, lower) {
  const clean = kw.trim();
  if (!clean) return false;
  if (/\d/.test(clean)) {
    return lower.includes(clean);
  }
  if (clean.length <= 3 && /^[a-z]+$/.test(clean)) {
    const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^a-z0-9])' + esc + '(?:$|[^a-z0-9])', 'i').test(lower);
  }
  return lower.includes(clean);
}

function exactMatch(text, keywords) {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const words = kw.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      if (words.every(w => lower.includes(w))) return true;
    } else {
      if (isKeywordMatch(words[0], lower)) return true;
    }
  }
  return false;
}

// ── Pipeline ──
async function loadPipeline() {
  if (pipelineHandle) return pipelineHandle;

  if (pipelineLoading) {
    let tries = 0;
    while (pipelineLoading && tries < 300) {
      await new Promise(r => setTimeout(r, 100));
      tries++;
    }
    return pipelineHandle;
  }

  pipelineLoading = true;
  try {
    const url = chrome.runtime.getURL('lib/transformers.min.js');
    console.log('[FV:BG] Fetching bundle...');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);

    let code = await resp.text();
    // Append export so dynamic import() can capture __webpack_exports__
    code += ';\nexport default typeof __webpack_exports__ !== "undefined" ? __webpack_exports__ : null;\n';

    // Service Workers lack URL.createObjectURL — use base64 data URL instead
    const dataUrl = 'data:application/javascript;base64,' + btoa(code);
    const mod = await import(dataUrl);

    const exports = mod.default;
    if (!exports || !exports.pipeline) throw new Error('exports missing pipeline');

    exports.env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/');
    exports.env.localModelPath = chrome.runtime.getURL('models/');
    exports.env.allowRemoteModels = false;
    exports.env.allowLocalModels = true;

    // Service Workers cannot spawn Web Workers — enforce single-thread
    exports.env.backends.onnx.wasm.numThreads = 1;

    console.log('[FV:BG] Creating pipeline...');
    const t0 = performance.now();
    pipelineHandle = await exports.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
    console.log('[FV:BG] Pipeline ready in', (performance.now() - t0).toFixed(0), 'ms');
  } catch (err) {
    console.error('[FV:BG] Pipeline load failed:', err.message);
    pipelineHandle = null;
  } finally {
    pipelineLoading = false;
  }
  return pipelineHandle;
}

async function encodeText(text) {
  if (!text || text.length < 2) return null;
  try {
    const pipe = await loadPipeline();
    if (!pipe) return null;
    const result = await pipe(text, { pooling: 'mean', normalize: true });
    return new Float32Array(result.data);
  } catch (err) {
    console.debug('[FV:BG] encode error:', err.message);
    return null;
  }
}

// ── Core classification ──
async function classify(texts, keywords) {
  // Layer 1: exact match on the full combined text
  const fullText = texts.join(' ');
  if (exactMatch(fullText, keywords)) return true;

  // Layer 2: semantic embedding match with phrase chunking.
  // Each segment is embedded separately; if ANY segment crosses the
  // threshold, the whole post is matched (max-pooling).
  const pipe = await loadPipeline();
  if (!pipe) return false;

  // Cache keyword embeddings
  for (const kw of keywords) {
    if (!kwCache.has(kw)) {
      const kwEmb = await encodeText(kw);
      if (kwEmb) kwCache.set(kw, kwEmb);
    }
  }

  let globalBest = 0;
  let globalBestKw = '';
  let globalBestText = '';

  for (const seg of texts) {
    if (!seg || seg.length < 2) continue;

    const segHash = hashText(seg);
    let segEmb = textCache.get(segHash);
    if (!segEmb) {
      segEmb = await encodeText(seg);
      if (segEmb) textCache.set(segHash, segEmb);
    }
    if (!segEmb) continue;

    for (const kw of keywords) {
      const kwEmb = kwCache.get(kw);
      if (!kwEmb) continue;

      const sim = cosineSimilarity(segEmb, kwEmb);
      if (sim > globalBest) {
        globalBest = sim;
        globalBestKw = kw;
        globalBestText = seg;
      }

      if (sim >= SIMILARITY_THRESHOLD) {
        console.debug('[FV:BG] Semantic match (segment):',
          JSON.stringify(seg.slice(0, 60)),
          '~', JSON.stringify(kw), `(${sim.toFixed(3)})`);
        return true;
      }
    }
  }

  // Log near-misses
  if (globalBest > 0.25 && globalBest < SIMILARITY_THRESHOLD) {
    console.debug('[FV:BG] Below threshold:',
      JSON.stringify(globalBestText.slice(0, 60)),
      'vs', JSON.stringify(globalBestKw), `(${globalBest.toFixed(3)})`);
  }
  return false;
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'classify') {
    const { texts, keywords } = msg;
    if (!texts || !texts.length || !keywords) {
      sendResponse({ match: false });
      return true;
    }
    classify(texts, keywords).then(match => sendResponse({ match }));
    return true;
  }
});

// ── Pre-warm on install ──
chrome.runtime.onInstalled.addListener(() => {
  console.log('[FV:BG] Installed. Pipeline will load on first classify request.');
});
