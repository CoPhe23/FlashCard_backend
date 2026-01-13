import express from "express";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

dotenv.config();
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const isProd = process.env.NODE_ENV === "production";

function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
}

app.get("/", (req, res) => res.send("FlashCards API running"));

app.post("/api/auth/login", (req, res) => {
  const { key } = req.body;
  if (key !== process.env.AUTH_KEY) return res.status(401).json({ error: "Hibás kulcs!" });

  const token = jwt.sign({ access: true }, process.env.JWT_SECRET, { expiresIn: "2h" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "strict",
    maxAge: 2 * 60 * 60 * 1000
  });

  res.sendStatus(200);
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "strict"
  });
  res.sendStatus(200);
});

app.get("/api/auth/me", (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.json({ admin: false });
    jwt.verify(token, process.env.JWT_SECRET);
    res.json({ admin: true });
  } catch {
    res.json({ admin: false });
  }
});

app.get("/api/protected", requireAuth, (req, res) => {
  res.sendStatus(200);
});

import { db } from "./firebase.js";

app.get("/api/topics", async (req, res) => {
  const snap = await db.collection("topics").get();
  const out = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
  res.json(out);
});

app.post("/api/topics", requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Hiányzó name" });

  const trimmed = name.trim();
  if (!trimmed) return res.status(400).json({ error: "Üres name" });

  const id = trimmed.toLowerCase();

  const ref = db.collection("topics").doc(id);
  const exists = await ref.get();
  if (exists.exists) return res.status(409).json({ error: "Már létezik" });

  await ref.set({ name: trimmed });
  res.status(201).json({ id, name: trimmed });
});

app.get("/api/cards/:topic", async (req, res) => {
  const { topic } = req.params;

  const topicRef = db.collection("topics").doc(topic.toLowerCase());
  const cardsSnap = await topicRef.collection("cards").get();

  const cards = cardsSnap.docs.map(d => ({
    id: d.id,
    question: d.data().question,
    answer: d.data().answer
  }));

  res.json(cards);
});

app.post("/api/cards/:topic", requireAuth, async (req, res) => {
  const { topic } = req.params;
  const { question, answer } = req.body;

  if (!question || !answer) return res.status(400).json({ error: "Hiányzó adat" });

  const q = question.trim();
  const a = answer.trim();
  if (!q || !a) return res.status(400).json({ error: "Üres adat" });

  const topicId = topic.toLowerCase();
  const topicRef = db.collection("topics").doc(topicId);

  const tSnap = await topicRef.get();
  if (!tSnap.exists) {
    await topicRef.set({ name: topic });
  }

  const newRef = await topicRef.collection("cards").add({
    question: q,
    answer: a
  });

  res.status(201).json({ id: newRef.id, question: q, answer: a });
});


const port = process.env.PORT || 8000;
app.listen(port, () => console.log("server running on port:", port));

