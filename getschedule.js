import admin from "firebase-admin";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import ical from "node-ical";
import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const db = admin.firestore();
const app = express();


app.get('/api/config', (req, res) => {
  res.json({ mapsApiKey: process.env.MAPS_API_KEY });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));
app.use(express.json());

const churches = JSON.parse(fs.readFileSync("./churchdata.json"));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });


app.get("/api/reviews/:id", async (req, res) => {
  const snapshot = await db
    .collection("churches")
    .doc(req.params.id)
    .collection("reviews")
    .orderBy("date", "desc")
    .get();

  const reviews = snapshot.docs.map(doc => doc.data());
  res.json(reviews);
});

app.post("/api/reviews/:id", async (req, res) => {
  const { text, author } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Review text required" });
  }

  await db
    .collection("churches")
    .doc(req.params.id)
    .collection("reviews")
    .add({
      text: text.trim(),
      author: author?.trim() || "Anonymous",
      date: new Date().toISOString()
    });

  res.json({ ok: true });
});

// GET AI overview of reviews for a church
app.get("/api/reviews/:id/overview", async (req, res) => {
  const reviews = loadReviews();
  const churchReviews = reviews[req.params.id] || [];
  const church = churches.find(c => c.id === req.params.id);

  if (!churchReviews.length) {
    return res.json({ overview: "No reviews yet for this parish." });
  }

  const reviewText = churchReviews
    .map((r, i) => `Review ${i + 1} (${r.author}): "${r.text}"`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Here are visitor reviews for ${church?.name || "this Orthodox church"}. 
Write a warm, 2-3 sentence summary of what people are saying. Be balanced and honest.

${reviewText}`
    }]
  });

  res.json({ overview: message.content[0].text });
});

// ICS schedule route
app.get("/api/schedule/:id", async (req, res) => {
  const church = churches.find(c => c.id === req.params.id);
  if (!church) return res.status(404).json({ error: "Church not found" });
  if (!church.ics) return res.status(404).json({ error: "No ICS feed" });

  try {
    const data = await ical.async.fromURL(church.ics);
    const now = new Date();
    const events = Object.values(data)
      .filter(ev => ev.type === "VEVENT" && new Date(ev.start) >= now)
      .map(ev => ({ summary: ev.summary, start: ev.start, end: ev.end, location: ev.location }))
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 20);
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load calendar" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});