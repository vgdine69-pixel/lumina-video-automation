import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("automation.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    niche TEXT NOT NULL,
    is_connected BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER DEFAULT 1,
    topic TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    script TEXT,
    audio_url TEXT,
    thumbnail_url TEXT,
    video_url TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_tags TEXT,
    seo_hashtags TEXT,
    thumbnail_idea TEXT,
    voice_character TEXT,
    viral_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(channel_id) REFERENCES channels(id)
  );
`);

// Seed initial channels if empty
const channelCount = db.prepare("SELECT COUNT(*) as count FROM channels").get() as { count: number };
if (channelCount.count === 0) {
  db.prepare("INSERT INTO channels (name, niche) VALUES (?, ?)").run("Kids Masterpieces", "Cinematic 3D Kids Stories & Education");
  db.prepare("INSERT INTO channels (name, niche) VALUES (?, ?)").run("Divine Tamil", "Sacred Tamil Gods, Astrology & Third Eye Wisdom");
  db.prepare("INSERT INTO channels (name, niche) VALUES (?, ?)").run("Global Discovery", "High-End Documentary & Science");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/channels", (req, res) => {
    const channels = db.prepare("SELECT * FROM channels").all();
    res.json(channels);
  });

  app.get("/api/topics", (req, res) => {
    const { channel_id } = req.query;
    let query = "SELECT * FROM topics";
    const params = [];
    if (channel_id) {
      query += " WHERE channel_id = ?";
      params.push(channel_id);
    }
    query += " ORDER BY created_at DESC";
    const topics = db.prepare(query).all(...params);
    res.json(topics);
  });

  // Scheduled Automation Logic (6am, 11am, 4pm, 8pm)
  const UPLOAD_HOURS = [6, 11, 16, 20];
  let lastProcessedHour = -1;

  setInterval(() => {
    const now = new Date();
    const currentHour = now.getHours();
    
    if (UPLOAD_HOURS.includes(currentHour) && currentHour !== lastProcessedHour) {
      console.log(`[Automation] Triggering scheduled upload for ${currentHour}:00`);
      lastProcessedHour = currentHour;
      
      // In a real server-side automation, we would trigger the generation here.
      // Since Gemini calls must be frontend, we'll flag a "priority" topic 
      // for the frontend Auto-Pilot to pick up immediately.
      db.prepare("INSERT INTO topics (topic, category, status) VALUES (?, ?, ?)").run(
        `Scheduled Video for ${now.toLocaleTimeString()}`, 
        "Brain Boosting", 
        "pending"
      );
    }
  }, 60000); // Check every minute

  app.get("/api/auth/google/url", (req, res) => {
    // In a real app, this would be the Google OAuth URL
    // For this demo, we'll redirect to our own callback to show the flow
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
    const mockAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=MOCK_ID&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload`;
    
    // Actually, since we want the popup to work, we'll just return a URL that 
    // eventually hits our callback.
    res.json({ url: redirectUri });
  });

  app.post("/api/topics", (req, res) => {
    const { topic, category, channel_id, voice_character } = req.body;
    const info = db.prepare("INSERT INTO topics (topic, category, channel_id, voice_character) VALUES (?, ?, ?, ?)").run(topic, category, channel_id || 1, voice_character || 'Zephyr');
    res.json({ id: info.lastInsertRowid, topic, category, channel_id: channel_id || 1, status: 'pending', voice_character: voice_character || 'Zephyr' });
  });

  app.patch("/api/topics/:id", (req, res) => {
    const { id } = req.params;
    const { status, script, video_url, audio_url, thumbnail_url, seo_title, seo_description, seo_tags, seo_hashtags, thumbnail_idea, voice_character, viral_score } = req.body;
    
    const updates = [];
    const params = [];
    
    if (status) { updates.push("status = ?"); params.push(status); }
    if (script) { updates.push("script = ?"); params.push(script); }
    if (video_url) { updates.push("video_url = ?"); params.push(video_url); }
    if (audio_url) { updates.push("audio_url = ?"); params.push(audio_url); }
    if (thumbnail_url) { updates.push("thumbnail_url = ?"); params.push(thumbnail_url); }
    if (seo_title) { updates.push("seo_title = ?"); params.push(seo_title); }
    if (seo_description) { updates.push("seo_description = ?"); params.push(seo_description); }
    if (seo_tags) { updates.push("seo_tags = ?"); params.push(seo_tags); }
    if (seo_hashtags) { updates.push("seo_hashtags = ?"); params.push(seo_hashtags); }
    if (thumbnail_idea) { updates.push("thumbnail_idea = ?"); params.push(thumbnail_idea); }
    if (voice_character) { updates.push("voice_character = ?"); params.push(voice_character); }
    if (viral_score !== undefined) { updates.push("viral_score = ?"); params.push(viral_score); }
    
    params.push(id);
    
    if (updates.length > 0) {
      db.prepare(`UPDATE topics SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    }
    
    res.json({ success: true });
  });

  // OAuth Callback Placeholder
  app.get("/auth/callback", (req, res) => {
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
