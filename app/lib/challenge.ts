import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PASS_HOURS } from "./challenge-info";

// The check page ("Checking your browser") that a blocker can show instead of
// a hard block. The visitor's browser must find a number that, hashed with a
// server-issued nonce, gives a SHA-256 hash starting with DIFFICULTY zero
// bits. That takes a real browser a second or two and stops scripts that do
// not run JavaScript. A solved check earns a pass for PASS_HOURS, tied to the
// shop and the visitor's IP. Both the check and the pass are signed with the
// app secret, so nothing is stored.

export const DIFFICULTY = 16;
export const CHALLENGE_TTL_MS = 5 * 60_000;
export { PASS_HOURS };
const PASS_TTL_MS = PASS_HOURS * 3_600_000;
// A browser gives up after this many tries (far beyond the ~65,000 needed on
// average), so a broken page never spins forever.
export const MAX_TRIES = 1 << 24;

export interface Challenge {
  nonce: string;
  difficulty: number;
  expires: number;
  signature: string;
}

function sign(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function challengeMessage(shopId: string, ip: string, c: Omit<Challenge, "signature">) {
  return `check|${shopId}|${ip}|${c.nonce}|${c.difficulty}|${c.expires}`;
}

export function issueChallenge(secret: string, shopId: string, ip: string, now = Date.now()): Challenge {
  const unsigned = {
    nonce: randomBytes(16).toString("hex"),
    difficulty: DIFFICULTY,
    expires: now + CHALLENGE_TTL_MS,
  };
  return { ...unsigned, signature: sign(secret, challengeMessage(shopId, ip, unsigned)) };
}

// The check travels back as one parameter: nonce.difficulty.expires.signature
export function encodeChallenge(challenge: Challenge): string {
  return [challenge.nonce, challenge.difficulty, challenge.expires, challenge.signature].join(".");
}

export function decodeChallenge(value: string): Challenge | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [nonce, difficulty, expires, signature] = parts;
  if (!/^[0-9a-f]{32}$/.test(nonce) || !/^\d{1,2}$/.test(difficulty) || !/^\d{1,15}$/.test(expires)) {
    return null;
  }
  return { nonce, difficulty: Number(difficulty), expires: Number(expires), signature };
}

export function leadingZeroBits(hash: Buffer): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

export function solutionHash(nonce: string, counter: number): Buffer {
  return createHash("sha256").update(`${nonce}:${counter}`).digest();
}

// True when the answer solves a check this server issued to this shop and IP
// and the check has not run out.
export function verifySolution(
  secret: string,
  shopId: string,
  ip: string,
  encoded: string,
  answer: string,
  now = Date.now(),
): boolean {
  const challenge = decodeChallenge(encoded);
  if (!challenge || !/^\d{1,10}$/.test(answer)) return false;
  const counter = Number(answer);
  if (counter > MAX_TRIES) return false;
  if (challenge.difficulty < DIFFICULTY || challenge.expires < now) return false;
  if (challenge.expires > now + CHALLENGE_TTL_MS) return false;
  if (!sameText(challenge.signature, sign(secret, challengeMessage(shopId, ip, challenge)))) return false;
  return leadingZeroBits(solutionHash(challenge.nonce, counter)) >= challenge.difficulty;
}

export function issuePass(secret: string, shopId: string, ip: string, now = Date.now()): string {
  const expires = now + PASS_TTL_MS;
  return `${expires}.${sign(secret, `pass|${shopId}|${ip}|${expires}`)}`;
}

export function validPass(secret: string, shopId: string, ip: string, pass: string, now = Date.now()) {
  const match = /^(\d{1,15})\.([\w-]{43})$/.exec(pass);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires < now || expires > now + PASS_TTL_MS) return false;
  return sameText(match[2], sign(secret, `pass|${shopId}|${ip}|${expires}`));
}
