// ===== DOM ELEMENTS =====
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const clearBtn = document.getElementById('clearBtn');
const errorMsg = document.getElementById('errorMsg');
const errorText = document.getElementById('errorText');
const videoCard = document.getElementById('videoCard');
const progressCard = document.getElementById('progressCard');
const progressFill = document.getElementById('progressFill');
const formatsGrid = document.getElementById('formatsGrid');

const btnText = fetchBtn.querySelector('.btn-text');
const btnLoader = fetchBtn.querySelector('.btn-loader');

let currentVideoData = null;
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3880' : '';

// ===== FETCH VIDEO INFO =====
fetchBtn.addEventListener('click', fetchVideoInfo);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideoInfo();
});

clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  urlInput.focus();
  hideError();
  hideVideoCard();
});

async function fetchVideoInfo() {
  const url = urlInput.value.trim();

  if (!url) {
    showError('Please paste a YouTube URL first.');
    return;
  }

  if (!isValidYouTubeURL(url)) {
    showError('That does not look like a valid YouTube URL. Please check and try again.');
    return;
  }

  setLoading(true);
  hideError();
  hideVideoCard();

  try {
    const response = await fetch(`${API_BASE}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch video info.');
    }

    currentVideoData = { ...data, url };
    renderVideoInfo(data);
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      showError('Cannot reach backend server. Start app and open http://localhost:3880');
    } else {
      showError(err.message || 'Something went wrong. Please try again.');
    }
  } finally {
    setLoading(false);
  }
}

// ===== RENDER VIDEO INFO =====
function renderVideoInfo(data) {
  document.getElementById('thumbnail').src = data.thumbnail;
  document.getElementById('videoTitle').textContent = data.title;
  document.getElementById('videoAuthor').textContent = data.author;
  document.getElementById('videoViews').textContent = data.views;
  document.getElementById('duration').textContent = data.duration;

  formatsGrid.innerHTML = '';

  if (!data.formats || data.formats.length === 0) {
    formatsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 20px; font-size: 14px;">
        <i class="fas fa-exclamation-triangle" style="color: var(--red); margin-right: 8px;"></i>
        No downloadable formats found for this video.
      </div>`;
  } else {
    data.formats.forEach((fmt, index) => {
      const isAudio = fmt.type === 'audio' || fmt.quality.toLowerCase().includes('audio') || fmt.container === 'mp3';
      const card = document.createElement('div');
      card.className = 'format-card fade-in-up';
      card.style.animationDelay = `${index * 0.05}s`;
      card.innerHTML = `
        <i class="fas fa-arrow-down format-download-icon"></i>
        <div class="format-quality">${fmt.quality}</div>
        <div class="format-type ${isAudio ? 'audio' : 'video'}">
          ${isAudio ? 'Audio' : 'Video'}
        </div>
        <div class="format-size">
          <i class="fas fa-hdd" style="margin-right:4px; opacity:0.5;"></i>
          ${fmt.size}
        </div>
      `;
      card.addEventListener('click', () => startDownload(fmt));
      formatsGrid.appendChild(card);
    });
  }

  videoCard.classList.remove('hidden');
  videoCard.classList.add('fade-in-up');

  setTimeout(() => {
    videoCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ===== START DOWNLOAD =====
async function startDownload(fmt) {
  if (!currentVideoData) return;

  const { url, title } = currentVideoData;
  const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&itag=${encodeURIComponent(fmt.itag)}&type=${encodeURIComponent(fmt.type || '')}&title=${encodeURIComponent(title)}`;

  progressCard.classList.remove('hidden');
  progressCard.classList.add('fade-in-up');
  progressFill.style.width = '0%';

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      let message = 'Download failed. Please try again.';
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        // Ignore JSON parse issues for non-JSON failures.
      }
      throw new Error(message);
    }

    const totalBytes = Number(response.headers.get('Content-Length')) || 0;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Download stream is not supported in this browser.');

    const chunks = [];
    let loadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loadedBytes += value.length;

      if (totalBytes > 0) {
        const progress = Math.min(100, (loadedBytes / totalBytes) * 100);
        progressFill.style.width = `${progress}%`;
      }
    }

    progressFill.style.width = '100%';

    const blob = new Blob(chunks, {
      type: response.headers.get('Content-Type') || 'application/octet-stream',
    });
    const filename = getFilenameFromHeaders(response.headers.get('Content-Disposition'), title, fmt);
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    showError(err.message || 'Download failed.');
  } finally {
    setTimeout(() => {
      progressCard.classList.add('hidden');
      progressFill.style.width = '0%';
    }, 800);
  }
}

// ===== HELPERS =====
function isValidYouTubeURL(url) {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
  ];
  return patterns.some((p) => p.test(url));
}

function setLoading(loading) {
  fetchBtn.disabled = loading;
  if (loading) {
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
  } else {
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

function hideVideoCard() {
  videoCard.classList.add('hidden');
  progressCard.classList.add('hidden');
  currentVideoData = null;
}

function getFilenameFromHeaders(contentDisposition, fallbackTitle, fmt) {
  const match = contentDisposition && contentDisposition.match(/filename="([^"]+)"/i);
  if (match && match[1]) return match[1];

  const ext = fmt?.type === 'audio' ? 'mp3' : 'mp4';
  const safeTitle = String(fallbackTitle || 'video').replace(/[^a-z0-9\s\-_]/gi, '').trim() || 'video';
  return `${safeTitle}.${ext}`;
}

// ===== PASTE FROM CLIPBOARD =====
urlInput.addEventListener('paste', () => {
  setTimeout(() => {
    if (urlInput.value.trim()) {
      hideError();
    }
  }, 50);
});

// ===== AUTO-FOCUS =====
window.addEventListener('load', () => {
  urlInput.focus();
});
