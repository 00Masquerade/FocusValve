/* FocusValve — content script for Twitter (X) & Xiaohongshu (RED) */

// ───────────────────────────────────────
// Constants & Configuration
// ───────────────────────────────────────

const STORAGE_KEY = 'focus_valve_state';
const BLUR_CLASS = 'fv-blur';
const REVEAL_CLASS = 'fv-revealed';
const HOVER_DELAY_MS = 3000;
const OBSERVER_DEBOUNCE_MS = 80;

// ───────────────────────────────────────
// Platform selectors
// ───────────────────────────────────────

const PLATFORM_CONFIG = {
  twitter: {
    hostPattern: /twitter\.com|x\.com/,
    postSelector: 'article[data-testid="tweet"]',
    rootSelector: '[aria-label*="Timeline" i], [aria-label*="时间线" i], main[role="main"]',
    // Collect text from: tweet body, author display name, handle, hashtags
    textSelector: [
      'div[data-testid="tweetText"]',
      '[data-testid="User-Name"]',
    ],
  },
  red: {
    hostPattern: /xiaohongshu\.com/,
    postSelector: 'section.note-item',
    rootSelector: '.feeds-container, .explore-container, .note-container',
    // RED cards: title + description + author name + tags
    textSelector: [
      '.title',
      '.desc',
      '.note-text',
      '.author .name',
      '.username',
      '.tag',           // tag chips below the note
      '.note-tag',
      '.hash-tag',
      'a[href*="tag"]', // tag links
    ],
  }
};

function detectPlatform() {
  // Test hook — allows platform override in non-production environments
  if (typeof window.__fv_detectPlatform === 'function') {
    return window.__fv_detectPlatform();
  }
  const host = window.location.hostname;
  if (PLATFORM_CONFIG.twitter.hostPattern.test(host)) return PLATFORM_CONFIG.twitter;
  if (PLATFORM_CONFIG.red.hostPattern.test(host)) return PLATFORM_CONFIG.red;
  return null;
}

// ───────────────────────────────────────
// State
// ───────────────────────────────────────

let enabled = true;
let keywords = [];
// AI classification is handled by background.js (service worker).
// content.js does local exact-match pre-check, then sends to
// background for semantic matching via chrome.runtime.sendMessage.

// ───────────────────────────────────────
// Storage sync
// ───────────────────────────────────────

async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    enabled = result[STORAGE_KEY].enabled ?? true;
    keywords = (result[STORAGE_KEY].keywords ?? []).map(k => k.toLowerCase());
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes[STORAGE_KEY]) return;

  const oldVal = changes[STORAGE_KEY].oldValue;
  const newVal = changes[STORAGE_KEY].newValue;
  const oldKeywords = (oldVal?.keywords ?? []).map(k => k.toLowerCase());
  const newKeywords = (newVal?.keywords ?? []).map(k => k.toLowerCase());

  enabled = newVal?.enabled ?? true;
  keywords = newKeywords;

  // If tags were removed, re-evaluate all cached nodes so matching items
  // snap back to full visibility immediately (no AI re-run needed).
  const removed = oldKeywords.filter(k => !newKeywords.includes(k));
  const added = newKeywords.filter(k => !oldKeywords.includes(k));

  if (removed.length > 0 || added.length > 0 || enabled !== (oldVal?.enabled ?? true)) {
    reprocessAllVisiblePosts();
  }
});

// ───────────────────────────────────────
// Text extraction
// ───────────────────────────────────────

/**
 * Extract all readable text from a post element.
 * Uses platform-specific text selectors (array) with fallback to full innerText.
 * Includes author names, handles, hashtags, and post body.
 */
function extractText(postEl, platform) {
  const parts = [];
  // Collect text from targeted selectors (title, desc, tags, author, etc.)
  if (platform.textSelector && platform.textSelector.length) {
    for (const sel of platform.textSelector) {
      const els = postEl.querySelectorAll(sel);
      for (const el of els) {
        const t = (el.innerText || el.textContent || '').trim();
        if (t) parts.push(t);
      }
    }
  }
  // Always include the full element text as fallback.
  // Targeted selectors might miss body text in a different container.
  const full = (postEl.innerText || postEl.textContent || '').trim();
  if (full) parts.push(full);
  return parts.join(' ');
}

// ───────────────────────────────────────
// Layer 1: Exact / Regex match (local, no AI)
// ───────────────────────────────────────

/**
 * Heuristic keyword match — avoids both naive substring bleed (ad→Adobe)
 * and rigid \b boundary misses (#McLarenF1).
 *
 * Rule A: keyword contains a digit (f1, gpt4) → loose substring match.
 * Rule B: short pure alphabetic ≤3 chars (ad, win) → strict boundary:
 *         keyword must be preceded/followed by non-alphanumeric or start/end.
 * Rule C: everything else → substring match.
 */
function isKeywordMatch(kw, lower) {
  const clean = kw.trim();
  if (!clean) return false;
  if (/\d/.test(clean)) {
    return lower.includes(clean);                          // Rule A
  }
  if (clean.length <= 3 && /^[a-z]+$/.test(clean)) {
    const esc = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^a-z0-9])' + esc + '(?:$|[^a-z0-9])', 'i').test(lower); // Rule B
  }
  return lower.includes(clean);                            // Rule C
}

function exactMatch(text) {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const words = kw.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      // Multi-word: user typed multiple terms → use includes for all
      if (words.every(w => lower.includes(w))) return true;
    } else {
      // Single-word: use heuristic routing (digit→loose, short alpha→boundary, else→includes)
      if (isKeywordMatch(words[0], lower)) return true;
    }
  }
  return false;
}

// ───────────────────────────────────────
// Layer 2: Semantic matching delegated to background.js
// via chrome.runtime.sendMessage({action:'classify', text, keywords})
// ───────────────────────────────────────

// ───────────────────────────────────────
// Hover unlock (3s timer — state machine)
// ───────────────────────────────────────
// .fv-blur has pointer-events:auto so the element itself
// receives mouseenter/mouseleave. No overlay shield needed.
//
// Phase 1 (mouseenter): start 3s timer, store ID on el.dataset.fvTimer.
// Phase 2 (timer fire): remove BLUR_CLASS, set el.dataset.fvUnlocked="true".
// Phase 3 (mouseleave): clear timer, re-apply BLUR_CLASS, set fvUnlocked="false".
// ───────────────────────────────────────

const hoverDataMap = new WeakMap();

function setupHover(el) {
  if (hoverDataMap.has(el)) return;

  const onEnter = () => {
    // Already unlocked — nothing to do
    if (el.dataset.fvUnlocked === 'true') return;

    // Kill any dangling timer from a previous interrupted hover
    if (el.dataset.fvTimer) {
      clearTimeout(parseInt(el.dataset.fvTimer, 10));
      delete el.dataset.fvTimer;
    }

    // Start strict 3-second countdown — do NOT unblur yet
    const id = setTimeout(() => {
      el.classList.remove(BLUR_CLASS);
      el.dataset.fvUnlocked = 'true';
      delete el.dataset.fvTimer;
    }, HOVER_DELAY_MS);
    el.dataset.fvTimer = String(id);
  };

  const onLeave = () => {
    // Destroy any running countdown
    if (el.dataset.fvTimer) {
      clearTimeout(parseInt(el.dataset.fvTimer, 10));
      delete el.dataset.fvTimer;
    }
    // Force re-lock — snap back to blurred state
    el.classList.add(BLUR_CLASS);
    el.dataset.fvUnlocked = 'false';
  };

  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);

  hoverDataMap.set(el, { onEnter, onLeave });
}

function teardownHover(el) {
  const data = hoverDataMap.get(el);
  if (!data) return;

  if (el.dataset.fvTimer) {
    clearTimeout(parseInt(el.dataset.fvTimer, 10));
    delete el.dataset.fvTimer;
  }
  el.removeEventListener('mouseenter', data.onEnter);
  el.removeEventListener('mouseleave', data.onLeave);
  delete el.dataset.fvUnlocked;
  hoverDataMap.delete(el);
}

// ───────────────────────────────────────
// Phrase chunking — splits long text into semantic segments
// so short keywords aren't vector-diluted in 100-word posts.
// ───────────────────────────────────────

function splitIntoSegments(text) {
  if (!text) return [];
  // Split on newlines first
  const raw = text.split(/\n+/).filter(Boolean);
  const segments = [];
  for (const line of raw) {
    // Split on sentence boundaries
    const parts = line.split(/(?<=[.!?！？。])\s+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length >= 2) segments.push(trimmed);
    }
  }
  // If no segments found (single very long line), use the whole text
  return segments.length > 0 ? segments : [text.trim()];
}

// ───────────────────────────────────────
// Core: classify and apply to single post
// ───────────────────────────────────────

async function classifyPost(postEl, platform) {
  // Guard: skip if already being processed via async sendMessage
  if (postEl.dataset.fvStatus === 'checking') return;

  if (!enabled || keywords.length === 0) {
    postEl.classList.remove(BLUR_CLASS, REVEAL_CLASS);
    teardownHover(postEl);
    postEl.dataset.fvStatus = 'cleared';
    return;
  }

  const text = extractText(postEl, platform);
  if (!text || text.length < 2) {
    postEl.dataset.fvStatus = 'cleared';
    return;
  }

  // Layer 1: exact keyword match (local, instantaneous)
  if (exactMatch(text)) {
    postEl.classList.add(BLUR_CLASS);
    setupHover(postEl);
    postEl.dataset.fvStatus = 'blurred';
    return;
  }

  // Layer 2: semantic match via background service worker.
  // Split long text into semantic segments (by newline, sentence break,
  // or URL/handle boundaries) so short keywords aren't diluted in long posts.
  const segments = splitIntoSegments(text);

  postEl.dataset.fvStatus = 'checking';
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'classify',
      texts: segments,
      keywords: keywords,
    });
    // Verify element still exists and wasn't raced by another call
    if (!document.contains(postEl)) return;
    if (postEl.dataset.fvStatus !== 'checking') return;

    if (response && response.match) {
      postEl.classList.add(BLUR_CLASS);
      setupHover(postEl);
      postEl.dataset.fvStatus = 'blurred';
      return;
    }
  } catch (err) {
    // Background not ready — clear status to allow retry on next observer trigger
    if (document.contains(postEl) && postEl.dataset.fvStatus === 'checking') {
      delete postEl.dataset.fvStatus;
    }
    return;
  }

  // No match — ensure unblurred
  postEl.classList.remove(BLUR_CLASS, REVEAL_CLASS);
  teardownHover(postEl);
  postEl.dataset.fvStatus = 'cleared';
}

// ───────────────────────────────────────
// Processing batches
// ───────────────────────────────────────

let reprocessScheduled = false;

async function reprocessAllVisiblePosts() {
  const platform = detectPlatform();
  if (!platform) return;

  const posts = document.querySelectorAll(platform.postSelector);
  for (const postEl of posts) {
    // Clear stale status so posts get re-evaluated (e.g. after keyword changes)
    if (postEl.dataset.fvStatus !== 'checking') {
      delete postEl.dataset.fvStatus;
    }
    await classifyPost(postEl, platform);
  }
}

function scheduleReprocess() {
  if (reprocessScheduled) return;
  reprocessScheduled = true;
  requestAnimationFrame(async () => {
    await reprocessAllVisiblePosts();
    reprocessScheduled = false;
  });
}

// ───────────────────────────────────────
// MutationObserver — SPA stream listener
// ───────────────────────────────────────

let observer = null;
let observerDebounceTimer = null;
let pendingMutations = []; // accumulate during debounce window

async function processNewNodes(mutations) {
  const platform = detectPlatform();
  if (!platform) return;

  const seen = new Set();

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;

      if (node.matches && node.matches(platform.postSelector)) {
        if (!seen.has(node) && !node.dataset.fvStatus) {
          seen.add(node);
          await classifyPost(node, platform);
        }
      }

      if (node.querySelectorAll) {
        const descendants = node.querySelectorAll(platform.postSelector);
        for (const desc of descendants) {
          if (!seen.has(desc) && !desc.dataset.fvStatus) {
            seen.add(desc);
            await classifyPost(desc, platform);
          }
        }
      }
    }
  }
}

function startObserver() {
  const platform = detectPlatform();
  if (!platform) return;

  if (observer) observer.disconnect();

  const root = document.querySelector(platform.rootSelector) || document.body;

  observer = new MutationObserver((mutations) => {
    // Accumulate mutations during debounce window — avoids dropping
    // mutations from rapid SPA re-renders during scrolling.
    pendingMutations.push(...mutations);

    if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
    observerDebounceTimer = setTimeout(() => {
      const batch = pendingMutations;
      pendingMutations = [];
      observerDebounceTimer = null;
      processNewNodes(batch);
    }, OBSERVER_DEBOUNCE_MS);
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
  });
}

// ───────────────────────────────────────
// Periodic hover cleanup — remove stale listeners
// ───────────────────────────────────────

setInterval(() => {
  // Clean up hover listeners on elements no longer in the DOM
}, 60_000);

// ───────────────────────────────────────
// Init
// ───────────────────────────────────────

async function init() {
  await loadState();

  const platform = detectPlatform();
  if (!platform) return; // not a supported site

  console.log('[FocusValve] Initialized on', window.location.hostname,
    '— enabled:', enabled, 'keywords:', keywords.length);

  startObserver();

  // Process existing posts already on screen
  // Layer 1 (exact match) runs locally; Layer 2 delegates to background.js
  await reprocessAllVisiblePosts();
}

init();
