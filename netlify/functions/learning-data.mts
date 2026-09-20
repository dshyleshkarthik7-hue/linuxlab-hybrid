import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "linuxlab";
const COLLECTION = "learner_state";
let clientPromise: Promise<MongoClient> | null = null;

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function user(request: Request) {
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);
  if (!headers.has("authorization") && !headers.has("cookie")) return null;
  try {
    const response = await fetch(new URL("/.netlify/identity/user", request.url), { headers, cache: "no-store" });
    if (!response.ok) return null;
    const value = await response.json() as { id?: unknown; email?: unknown };
    return typeof value.id === "string" && value.id ? { id: value.id, email: typeof value.email === "string" ? value.email : "" } : null;
  } catch { return null; }
}

async function collection() {
  if (!URI) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    const client = new MongoClient(URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    clientPromise = client.connect().catch(error => { clientPromise = null; throw error; });
  }
  const client = await clientPromise;
  return client.db(DB_NAME).collection(COLLECTION);
}

function normalize(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid learning state");
  const x = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => String(v ?? "").slice(0, max);
  const arr = (v: unknown, max: number) => Array.isArray(v) ? v.slice(0, max) : [];
  const quiz = x.quiz && typeof x.quiz === "object" ? x.quiz as Record<string, unknown> : {};
  return {
    version: 2,
    name: text(x.name, 80),
    points: Math.max(0, Math.min(1000000, Number(x.points) || 0)),
    tutorials: arr(x.tutorials, 500),
    challenges: arr(x.challenges, 200),
    quiz: { attempts: Math.max(0, Number(quiz.attempts) || 0), bestScore: Math.max(0, Number(quiz.bestScore) || 0), bestTotal: Math.max(0, Number(quiz.bestTotal) || 0), passed: Boolean(quiz.passed), lastAt: quiz.lastAt ? text(quiz.lastAt, 64) : null },
    sessions: arr(x.sessions, 30),
    certificates: arr(x.certificates, 20),
    updatedAt: new Date().toISOString()
  };
}

export default async (request: Request) => {
  if (request.method !== "GET" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const current = await user(request);
  if (!current) return json({ error: "Sign in to save learning progress." }, 401);
  try {
    const db = await collection();
    const states = db;
    if (request.method === "GET") {
      const record = await states.findOne({ _id: current.id });
      return json({ state: record?.state ?? null });
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 200_000) return json({ error: "Learning state is too large." }, 413);
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { state?: unknown };
    const state = normalize(body.state);
    await states.updateOne({ _id: current.id }, { $set: { state, user: { email: current.email }, updatedAt: new Date() } }, { upsert: true });
    return json({ ok: true, state });
  } catch (error) {
    console.error("MongoDB learning-data error", error instanceof Error ? error.message : String(error));
    return json({ error: "Learning data service is temporarily unavailable." }, 503);
  }
};

export const config = { path: "/api/learning-data" };
