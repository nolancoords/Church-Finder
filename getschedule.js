import 'dotenv/config';
import admin from "firebase-admin";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import ical from "node-ical";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import NodeCache from 'node-cache';
import rateLimit from "express-rate-limit";



const myCache        = new NodeCache({ stdTTL: 3600});
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app            = express();
const __filename     = fileURLToPath(import.meta.url);
const __dirname      = path.dirname(__filename);
const anthropic      = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });


app.use(express.json());
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db             = admin.firestore();
let churchCache       = null;

function getChurches() {
  if (!churchCache) {
    churchCache = JSON.parse(fs.readFileSync("./churchdata.json", "utf-8"));
  }
  return churchCache;
}

app.get('/api/config', (req, res) => {
  res.json({ mapsApiKey: process.env.MAPS_API_KEY });
});

app.get("/api/reviews/:id", async (req, res) => {
  try {
    const snapshot = await db
      .collection("churches")
      .doc(req.params.id)
      .collection("reviews")
      .orderBy("date", "desc")
      .get();

    const reviews = snapshot.docs.map(doc => doc.data());
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/reviews/:id", async (req, res) => {
  const { text, author } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Review text required" });
  }

  try {
    const ref = await db
      .collection("churches")
      .doc(req.params.id)
      .collection("reviews")
      .add({
        text: text.trim(),
        author: author?.trim() || "Anonymous",
        date: new Date().toISOString()
      });

    res.json({ ok: true, id: ref.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/reviews/:id/overview", async (req, res) => {
  const cacheKey  = `overview_${req.params.id}`;
  const cached    = myCache.get(cacheKey);
  if (cached) return res.json({ overview: cached });

  try {
    const churches = getChurches();
    const church   = churches.find(c => c.id === req.params.id);

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

    const overview    = message.content[0].text;
    myCache.set(cacheKey, overview);       // ← cache before responding
    res.json({ overview });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/schedule/:id", async (req, res) => {
  const churches = getChurches(); 
  const church = churches.find(c => c.id === req.params.id);

  if (!church) return res.status(404).json({ error: "Church not found" });
  if (!church.ics) return res.status(404).json({ error: "No ICS feed" });

  const cacheKey  = `schedule_${req.params.id}`;
  const cache     = myCache.get(cacheKey)
  if (cache) return res.json(cache);
    try {
    const data    = await ical.async.fromURL(church.ics);
    const now     = new Date();
    const events  = Object.values(data)
      .filter(ev => ev.type === "VEVENT" && new Date(ev.start) >= now)
      .map(ev => ({
        summary: ev.summary,
        start: ev.start,
        end: ev.end,
        location: ev.location
      }))
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 20);
    myCache.set(cacheKey, events);

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Failed to load calendar" });
  }
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

setInterval(async () => {
  const churches = getChurches();
  for (const church of churches) {
    if (church.ics) {
      try {
        const data = await ical.async.fromURL(church.ics);
        const now = new Date();
        const events = Object.values(data)       // ← was missing this assignment
          .filter(ev => ev.type === "VEVENT" && new Date(ev.start) >= now)
          .map(ev => ({
            summary: ev.summary,
            start: ev.start,
            end: ev.end,
            location: ev.location,
          }))
          .sort((a, b) => new Date(a.start) - new Date(b.start))
          .slice(0, 20);
        myCache.set(`schedule_${church.id}`, events);
      } catch (e) {
        console.error(`Failed background sync for ${church.id}`);
      }
    }
  }
}, 15 * 60 * 1000);





const VERSE_POOL = [
  { book: "JOHN",         chapter: 3,  verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
  { book: "PSALMS",       chapter: 23, verse: 1,  text: "The Lord is my shepherd; I shall not want." },
  { book: "PSALMS",       chapter: 23, verse: 4,  text: "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me." },
  { book: "PSALMS",       chapter: 46, verse: 1,  text: "God is our refuge and strength, a very present help in trouble." },
  { book: "PROVERBS",     chapter: 3,  verse: 5,  text: "Trust in the Lord with all thine heart; and lean not unto thine own understanding." },
  { book: "PROVERBS",     chapter: 3,  verse: 6,  text: "In all thy ways acknowledge him, and he shall direct thy paths." },
  { book: "ROMANS",       chapter: 8,  verse: 28, text: "And we know that all things work together for good to them that love God." },
  { book: "ROMANS",       chapter: 8,  verse: 31, text: "If God be for us, who can be against us?" },
  { book: "ROMANS",       chapter: 10, verse: 9,  text: "That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved." },
  { book: "ROMANS",       chapter: 12, verse: 2,  text: "And be not conformed to this world: but be ye transformed by the renewing of your mind." },
  { book: "MATTHEW",      chapter: 5,  verse: 9,  text: "Blessed are the peacemakers: for they shall be called the children of God." },
  { book: "MATTHEW",      chapter: 5,  verse: 14, text: "Ye are the light of the world. A city that is set on an hill cannot be hid." },
  { book: "MATTHEW",      chapter: 6,  verse: 33, text: "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you." },
  { book: "MATTHEW",      chapter: 11, verse: 28, text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." },
  { book: "ISAIAH",       chapter: 40, verse: 31, text: "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles." },
  { book: "ISAIAH",       chapter: 41, verse: 10, text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God." },
  { book: "JOSHUA",       chapter: 1,  verse: 9,  text: "Be strong and of a good courage; be not afraid, neither be thou dismayed: for the Lord thy God is with thee." },
  { book: "GALATIANS",    chapter: 5,  verse: 22, text: "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith." },
  { book: "PHILIPPIANS",  chapter: 4,  verse: 13, text: "I can do all things through Christ which strengtheneth me." },
  { book: "PHILIPPIANS",  chapter: 4,  verse: 6,  text: "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God." },
  { book: "HEBREWS",      chapter: 11, verse: 1,  text: "Now faith is the substance of things hoped for, the evidence of things not seen." },
  { book: "JAMES",        chapter: 1,  verse: 5,  text: "If any of you lack wisdom, let him ask of God, that giveth to all men liberally." },
  { book: "JAMES",        chapter: 1,  verse: 2,  text: "My brethren, count it all joy when ye fall into divers temptations." },
];

let verseCache = { date: null, verse: null };

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyVerse() {
  const today = todayUTC();
  if (verseCache.date !== today) {
    // Seed with date so it's consistent all day
    const seed = today.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const index = seed % VERSE_POOL.length;
    verseCache = { date: today, verse: { ...VERSE_POOL[index], date: today } };
  }
  return verseCache.verse;
}

app.get("/api/verse", (req, res) => {
  const force = req.query.refresh === '1';
  if (force) {
    const index = Math.floor(Math.random() * VERSE_POOL.length);
    return res.json({ ...VERSE_POOL[index], date: todayUTC() });
  }
  res.json(getDailyVerse());
});



const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests/min
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);