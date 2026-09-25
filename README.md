# ⚡ Aryan SonyLiv Live Sports Hub (`aryan-sony`)

Auto-updating SonyLiv live matches & sports hub with embedded HLS video player, transparent streaming proxy, and category filters.

---

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   cd "c:\Users\rekha choudhary\Desktop\aryan-sony"
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open in Browser**:
   - Web App: [http://localhost:5050](http://localhost:5050)
   - API Feed: [http://localhost:5050/api/events](http://localhost:5050/api/events)
   - Proxy Stream: `http://localhost:5050/api/proxy?url=<M3U8_URL>`

---

## 🌟 Features

- **Auto-Syncing Match Data**: Fetches and auto-refreshes live/upcoming SonyLiv events every 60s.
- **Glass/Dark UI**: Modern responsive design with Tailwind CSS, category filters (Football, Cricket, Tennis, Golf, etc.), and real-time search.
- **Built-in HLS Video Player**: Adaptive bitrate streaming (1080p, 720p, 540p, 360p) with audio language badges.
- **Automatic Fallback Proxy**: If direct Akamai playback fails due to token/CORS restrictions, it automatically routes through `/api/proxy`.
- **Deep-Linking & Sharing**: Share any match with `?id=<contentId>` to launch the player directly.
