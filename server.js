const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const { randomUUID } = require('crypto');
const youtubedl = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = Number(process.env.PORT) || 3880;
const YTDLP_COOKIES_PATH = process.env.YTDLP_COOKIES_PATH;
const YTDLP_PROXY_URL = process.env.YTDLP_PROXY_URL;
const YTDLP_EXTRACTOR_ARGS = process.env.YTDLP_EXTRACTOR_ARGS;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isValidYouTubeURL(rawUrl) {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return 'N/A';
  return `${(Number(bytes) / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds) {
  const total = Number(seconds) || 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickVideoFormats(formats) {
  const filtered = (formats || [])
    .filter((f) => f.vcodec !== 'none' && Number(f.height) > 0 && Number(f.height) <= 1080)
    .sort((a, b) => {
      const h = (Number(b.height) || 0) - (Number(a.height) || 0);
      if (h !== 0) return h;

      // Prefer mp4 if same resolution.
      if (a.ext === 'mp4' && b.ext !== 'mp4') return -1;
      if (a.ext !== 'mp4' && b.ext === 'mp4') return 1;
      return 0;
    });

  const seen = new Set();
  const unique = [];

  for (const f of filtered) {
    const key = `${f.height}-${f.ext}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
    if (unique.length >= 10) break;
  }

  return unique.map((f) => ({
    itag: String(f.format_id),
    type: 'video',
    quality: `${f.height}p${Number(f.fps) > 30 ? ` ${Math.round(Number(f.fps))}fps` : ''}`,
    container: f.ext || 'mp4',
    size: formatBytes(f.filesize || f.filesize_approx),
  }));
}

function pickAudioFormat(formats) {
  const bestAudio = (formats || [])
    .filter((f) => f.vcodec === 'none' && f.acodec !== 'none')
    .sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0))[0];

  return {
    itag: 'mp3',
    type: 'audio',
    quality: `MP3${bestAudio?.abr ? ` (${Math.round(Number(bestAudio.abr))}kbps source)` : ''}`,
    container: 'mp3',
    size: formatBytes(bestAudio?.filesize || bestAudio?.filesize_approx),
  };
}

function makeTempFile(ext) {
  return path.join(os.tmpdir(), `yt-${Date.now()}-${randomUUID()}.${ext}`);
}

function getYtDlpBaseOptions() {
  const options = {
    noWarnings: true,
    noCheckCertificates: true,
  };

  if (YTDLP_COOKIES_PATH) {
    options.cookies = YTDLP_COOKIES_PATH;
  }

  if (YTDLP_PROXY_URL) {
    options.proxy = YTDLP_PROXY_URL;
  }

  if (YTDLP_EXTRACTOR_ARGS) {
    options.extractorArgs = YTDLP_EXTRACTOR_ARGS;
  }

  return options;
}

function getFriendlyYtDlpError(err) {
  const raw = String(err?.message || err || '');

  if (/sign in to confirm you(?:'|’)re not a bot/i.test(raw) || /\bHTTP Error 429\b/i.test(raw)) {
    return 'YouTube is blocking this server right now. This is common on cloud hosts like Railway. To make production work, add fresh YouTube cookies or route requests through a trusted proxy/VPS.';
  }

  if (/video unavailable/i.test(raw)) {
    return 'This video is unavailable or cannot be accessed from the server region.';
  }

  if (/unsupported url/i.test(raw)) {
    return 'The provided URL is not supported.';
  }

  return 'Failed to fetch video info. Please check the URL and try again.';
}

function runYtDlpToFile(url, flags) {
  return new Promise((resolve, reject) => {
    const subprocess = youtubedl.exec(url, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    subprocess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    subprocess.on('error', reject);
    subprocess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });
  });
}

async function streamAndCleanup(filePath, res) {
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await fsp.unlink(filePath).catch(() => {});
  };

  try {
    const stat = await fsp.stat(filePath);
    if (!res.getHeader('Content-Length')) {
      res.setHeader('Content-Length', stat.size);
    }

    const stream = fs.createReadStream(filePath);
    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
      res.on('close', resolve);
      stream.pipe(res);
    });
  } finally {
    await cleanup();
  }
}

// Get video info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  if (!url || !isValidYouTubeURL(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      ...getYtDlpBaseOptions(),
    });

    const formats = Array.isArray(info.formats) ? info.formats : [];

    res.json({
      title: info.title || 'YouTube Video',
      thumbnail: info.thumbnail || '',
      duration: formatDuration(info.duration || 0),
      author: info.uploader || info.channel || 'Unknown',
      views: Number(info.view_count || 0).toLocaleString(),
      formats: [...pickVideoFormats(formats), pickAudioFormat(formats)],
    });
  } catch (err) {
    console.error('INFO_ERROR:', err.message || err);
    res.status(500).json({ error: getFriendlyYtDlpError(err) });
  }
});

// Download video/audio
app.get('/api/download', async (req, res) => {
  const { url, itag, title, type } = req.query;

  if (!url || !isValidYouTubeURL(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  const cleanTitle = String(title || 'video').replace(/[^a-z0-9\s\-_]/gi, '').trim() || 'video';

  try {
    if (String(type) === 'audio' || String(itag) === 'mp3') {
      const outFile = makeTempFile('mp3');

      await runYtDlpToFile(url, {
        ...getYtDlpBaseOptions(),
        format: 'bestaudio/best',
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '0',
        ffmpegLocation: ffmpegPath,
        output: outFile,
      });

      res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle}.mp3"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      await streamAndCleanup(outFile, res);
      return;
    }

    // Video path: try selected resolution + best audio and merge into mp4.
    const selected = String(itag || '').trim();
    if (!selected) {
      return res.status(400).json({ error: 'Format not found' });
    }

    const outFile = makeTempFile('mp4');
    await runYtDlpToFile(url, {
      ...getYtDlpBaseOptions(),
      format: `${selected}+bestaudio[ext=m4a]/${selected}+bestaudio/${selected}`,
      mergeOutputFormat: 'mp4',
      ffmpegLocation: ffmpegPath,
      output: outFile,
    });

    res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');
    await streamAndCleanup(outFile, res);
  } catch (err) {
    console.error('DOWNLOAD_ERROR:', err.message || err);
    res.status(500).json({ error: getFriendlyYtDlpError(err) });
  }
});

app.listen(PORT, () => {
  console.log(`YT Downloader running at http://localhost:${PORT}`);
});
