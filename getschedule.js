import 'dotenv/config';
import admin from "firebase-admin";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import ical from "node-ical";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const churches = JSON.parse(fs.readFileSync("./churchdata.json"));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.get('/api/config', (req, res) => {
  res.json({ mapsApiKey: process.env.MAPS_API_KEY });
});

app.get("/api/debug-firebase", async (req, res) => {
  try {
    const SA = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    res.json({ 
      project_id: SA.project_id,
      client_email: SA.client_email
    });
  } catch(err) {
    res.json({ error: err.message });
  }
});

app.post("/api/reviews/:id", async (req, res) => {
  const { text, author } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Review text required" });
  }
  try {
    console.log("Writing to project:", serviceAccount.project_id);
    const ref = await db
      .collection("churches")
      .doc(req.params.id)
      .collection("reviews")
      .add({
        text: text.trim(),
        author: author?.trim() || "Anonymous",
        date: new Date().toISOString()
      });
    console.log("Success! Doc ID:", ref.id);
    res.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("FIREBASE ERROR:", err.code, err.message);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/reviews/:id", async (req, res) => {
  const { text, author } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Review text required" });
  }
  try {
    console.log("PROJECT:", serviceAccount.project_id);
    console.log("Church ID:", req.params.id);
    const ref = await db
      .collection("churches")
      .doc(req.params.id)
      .collection("reviews")
      .add({
        text: text.trim(),
        author: author?.trim() || "Anonymous",
        date: new Date().toISOString()
      });
    console.log("Written with ID:", ref.id);
    res.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("Firebase write error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reviews/:id/overview", async (req, res) => {
  try {
    const church = churches.find(c => c.id === req.params.id);
    const snapshot = await db
      .collection("churches")
      .doc(req.params.id)
      .collection("reviews")
      .orderBy("date", "desc")
      .get();
    const churchReviews = snapshot.docs.map(doc => doc.data());
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    res.status(500).json({ error: "Failed to load calendar" });
  }
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});//cache bust Mon May 11 19:09:02 EDT 2026
