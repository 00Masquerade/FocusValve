/* FocusValve — popup UI logic */

const STORAGE_KEY = 'focus_valve_state';

// ---------- DOM refs ----------
const masterToggle = document.getElementById('master-toggle');
const toggleLabel = document.getElementById('toggle-label');
const tagInput = document.getElementById('tag-input');
const btnAdd = document.getElementById('btn-add');
const tagsContainer = document.getElementById('tags-container');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// ---------- State ----------
let enabled = true;
let keywords = [];

// ---------- Persistence ----------
async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    enabled = result[STORAGE_KEY].enabled ?? true;
    keywords = result[STORAGE_KEY].keywords ?? [];
  }
  applyState();
}

async function saveState() {
  await chrome.storage.local.set({
    [STORAGE_KEY]: { enabled, keywords }
  });
}

// ---------- Rendering ----------
function applyState() {
  masterToggle.checked = enabled;
  toggleLabel.textContent = enabled ? 'On' : 'Off';
  statusDot.className = enabled ? 'status-dot' : 'status-dot disabled';
  statusText.textContent = enabled ? 'Active on this page' : 'Paused';
  renderTags();
}

function renderTags() {
  tagsContainer.innerHTML = '';
  for (const kw of keywords) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = kw;

    const delBtn = document.createElement('button');
    delBtn.className = 'tag-delete';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Remove "${kw}"`;
    delBtn.addEventListener('click', () => removeKeyword(kw));

    chip.appendChild(delBtn);
    tagsContainer.appendChild(chip);
  }
}

// ---------- Keyword management ----------
function addKeyword(raw) {
  // Collapse whitespace, strip, lowercase
  const cleaned = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  // Reject empty strings and whitespace-only inputs
  if (!cleaned || cleaned.length === 0) return;
  if (cleaned.length > 60) return;
  if (keywords.includes(cleaned)) return;

  keywords.push(cleaned);
  saveState();
  renderTags();
  tagInput.value = '';
  tagInput.focus();
}

function removeKeyword(kw) {
  keywords = keywords.filter(k => k !== kw);
  saveState();
  renderTags();
}

// ---------- Event handlers ----------
masterToggle.addEventListener('change', () => {
  enabled = masterToggle.checked;
  toggleLabel.textContent = enabled ? 'On' : 'Off';
  statusDot.className = enabled ? 'status-dot' : 'status-dot disabled';
  statusText.textContent = enabled ? 'Active on this page' : 'Paused';
  saveState();
});

btnAdd.addEventListener('click', () => {
  addKeyword(tagInput.value);
});

tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addKeyword(tagInput.value);
  }
});

// Handle comma separation as well for paste convenience
tagInput.addEventListener('input', () => {
  const val = tagInput.value;
  if (val.includes(',')) {
    const parts = val.split(',');
    for (let i = 0; i < parts.length - 1; i++) {
      addKeyword(parts[i]);
    }
    tagInput.value = parts[parts.length - 1];
  }
});

// ---------- Init ----------
loadState();
