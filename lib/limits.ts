import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * Usage limits for the public site, so one person can't use up the shared
 * Groq quota or tie up the server rendering videos.
 *
 * Every number can be changed with an environment variable (in .env.local
 * locally, or the host's dashboard in production); the defaults below apply
 * when a variable isn't set.
 *
 * Counters live in this server's memory: no database needed, but they reset
 * when the server restarts. Fine for a single server; move them to Redis if
 * you ever run several.
 */

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const LIMITS = {
  /** Longest video (or audio) accepted, in seconds. */
  maxVideoSeconds: envNumber("MAX_VIDEO_SECONDS", 60),
  /** Largest upload accepted, in MB. */
  maxUploadMb: envNumber("MAX_UPLOAD_MB", 150),
  /** Subtitle generations per person per day. */
  dailyVideos: envNumber("DAILY_VIDEO_LIMIT", 10),
  /** "Burn into video" renders per person per day. */
  dailyRenders: envNumber("DAILY_RENDER_LIMIT", 10),
  /**
   * Per-IP backstop for people who clear cookies. Kept high because mobile
   * networks put many different people behind one shared IP address.
   */
  ipDaily: envNumber("IP_DAILY_LIMIT", 50),
  /**
   * Total minutes of audio sent to Groq per day, across everyone. Keep it
   * under Groq's own daily limit (about 480 minutes on the free tier) so users
   * get a friendly message instead of an API error.
   */
  globalDailyAudioMinutes: envNumber("GLOBAL_DAILY_AUDIO_MINUTES", 450),
  /** Days roll over at midnight in this time zone. */
  timeZone: process.env.LIMITS_TIMEZONE || "Asia/Kathmandu",
};

// Groq bills every request as at least 10 seconds of audio.
const GROQ_MIN_BILLED_SECONDS = 10;
// Phones often record "1:00" as 60.4s; don't reject those.
const DURATION_GRACE_SECONDS = 1;

export type Action = "video" | "render";

type Store = { day: string; counts: Map<string, number> };

// Kept on globalThis so counters survive hot reloads in `next dev`.
const globalStore = globalThis as unknown as { __usageStore?: Store };

function today() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: LIMITS.timeZone }).format(new Date());
}

function store(): Map<string, number> {
  const day = today();
  if (!globalStore.__usageStore || globalStore.__usageStore.day !== day) {
    globalStore.__usageStore = { day, counts: new Map() };
  }
  return globalStore.__usageStore.counts;
}

const get = (key: string) => store().get(key) ?? 0;
const add = (key: string, amount: number) => store().set(key, Math.max(0, get(key) + amount));

const USER_COOKIE = "sg_uid";

export type Visitor = { userId: string; ip: string };

/**
 * Identifies the visitor by a long-lived cookie (set on first visit), with
 * their IP address as a backstop.
 */
export async function getVisitor(req: NextRequest): Promise<Visitor> {
  const jar = await cookies();
  let userId = jar.get(USER_COOKIE)?.value;
  if (!userId || !/^[\w-]{10,64}$/.test(userId)) {
    userId = randomUUID();
    jar.set(USER_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return { userId, ip };
}

function limitFor(action: Action) {
  return action === "video" ? LIMITS.dailyVideos : LIMITS.dailyRenders;
}

export function getUsage({ userId }: Visitor) {
  const videosUsed = get(`video:user:${userId}`);
  const rendersUsed = get(`render:user:${userId}`);
  return {
    limits: {
      maxVideoSeconds: LIMITS.maxVideoSeconds,
      maxUploadMb: LIMITS.maxUploadMb,
      dailyVideos: LIMITS.dailyVideos,
      dailyRenders: LIMITS.dailyRenders,
    },
    videosLeft: Math.max(0, LIMITS.dailyVideos - videosUsed),
    rendersLeft: Math.max(0, LIMITS.dailyRenders - rendersUsed),
  };
}

export class LimitError extends Error {
  constructor(message: string, public status = 429) {
    super(message);
  }
}

/** Rejects uploads that are too big before any work is done. */
export function checkUploadSize(bytes: number) {
  if (bytes > LIMITS.maxUploadMb * 1024 * 1024) {
    throw new LimitError(
      `This file is ${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB. The limit is ${LIMITS.maxUploadMb} MB. Try exporting it at 1080p.`,
      413
    );
  }
}

export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Rejects videos longer than the limit. */
export function checkDuration(seconds: number) {
  if (seconds > LIMITS.maxVideoSeconds + DURATION_GRACE_SECONDS) {
    throw new LimitError(
      `This video is ${formatDuration(seconds)} long. The limit is ${formatDuration(LIMITS.maxVideoSeconds)}. Please trim it and try again.`,
      413
    );
  }
}

/**
 * Checks and records one use of `action`. Returns a function that gives the
 * use back, for when processing fails, so people aren't charged for errors.
 */
export function reserve(action: Action, visitor: Visitor, audioSeconds = 0): () => void {
  const userKey = `${action}:user:${visitor.userId}`;
  const ipKey = `${action}:ip:${visitor.ip}`;
  const audioKey = "audio:global";
  const billed = action === "video" ? Math.max(audioSeconds, GROQ_MIN_BILLED_SECONDS) : 0;

  if (get(userKey) >= limitFor(action)) {
    throw new LimitError(
      action === "video"
        ? `You've used all ${LIMITS.dailyVideos} videos for today. Come back tomorrow!`
        : `You've used all ${LIMITS.dailyRenders} video renders for today. Come back tomorrow!`
    );
  }
  if (get(ipKey) >= LIMITS.ipDaily) {
    throw new LimitError("Too many requests from your network today. Please try again tomorrow.");
  }
  if (billed && get(audioKey) + billed > LIMITS.globalDailyAudioMinutes * 60) {
    throw new LimitError("We've reached today's limit for everyone. Please try again tomorrow.", 503);
  }

  add(userKey, 1);
  add(ipKey, 1);
  if (billed) add(audioKey, billed);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    add(userKey, -1);
    add(ipKey, -1);
    if (billed) add(audioKey, -billed);
  };
}
