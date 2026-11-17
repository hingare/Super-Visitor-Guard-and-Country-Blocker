import { describe, expect, it } from "vitest";
import {
  DIFFICULTY,
  decodeChallenge,
  encodeChallenge,
  issueChallenge,
  issuePass,
  leadingZeroBits,
  solutionHash,
  validPass,
  verifySolution,
} from "../app/lib/challenge";
import { parseHandlingForm } from "../app/lib/block-handling";
import { storefrontAction } from "../app/lib/storefront";

const SECRET = "test-secret";
const NOW = Date.UTC(2026, 10, 17, 12);

function solve(nonce: string, difficulty: number) {
  for (let n = 0; ; n++) if (leadingZeroBits(solutionHash(nonce, n)) >= difficulty) return n;
}

describe("browser check", () => {
  it("counts leading zero bits", () => {
    expect(leadingZeroBits(Buffer.from([0x80]))).toBe(0);
    expect(leadingZeroBits(Buffer.from([0x01]))).toBe(7);
    expect(leadingZeroBits(Buffer.from([0x00, 0x00, 0x20]))).toBe(18);
    expect(leadingZeroBits(Buffer.from([0, 0]))).toBe(16);
  });

  it("round-trips a check through its parameter form", () => {
    const challenge = issueChallenge(SECRET, "shop1", "203.0.113.5", NOW);
    expect(challenge.difficulty).toBe(DIFFICULTY);
    expect(decodeChallenge(encodeChallenge(challenge))).toEqual(challenge);
    expect(decodeChallenge("a.b.c")).toBeNull();
    expect(decodeChallenge("zz.16.1.sig")).toBeNull();
  });

  it("accepts a right answer only for the same shop, IP and time", () => {
    const challenge = issueChallenge(SECRET, "shop1", "203.0.113.5", NOW);
    const encoded = encodeChallenge(challenge);
    const answer = String(solve(challenge.nonce, challenge.difficulty));

    expect(verifySolution(SECRET, "shop1", "203.0.113.5", encoded, answer, NOW + 1000)).toBe(true);
    expect(verifySolution(SECRET, "shop1", "203.0.113.6", encoded, answer, NOW + 1000)).toBe(false);
    expect(verifySolution(SECRET, "shop2", "203.0.113.5", encoded, answer, NOW + 1000)).toBe(false);
    expect(verifySolution("other", "shop1", "203.0.113.5", encoded, answer, NOW + 1000)).toBe(false);
    expect(verifySolution(SECRET, "shop1", "203.0.113.5", encoded, answer, NOW + 6 * 60_000)).toBe(false);
    expect(verifySolution(SECRET, "shop1", "203.0.113.5", encoded, "x1", NOW)).toBe(false);
  });

  it("rejects a wrong answer and a lowered difficulty", () => {
    const challenge = issueChallenge(SECRET, "shop1", "203.0.113.5", NOW);
    let wrong = 0;
    while (leadingZeroBits(solutionHash(challenge.nonce, wrong)) >= challenge.difficulty) wrong++;
    expect(verifySolution(SECRET, "shop1", "203.0.113.5", encodeChallenge(challenge), String(wrong), NOW)).toBe(false);

    const easy = { ...challenge, difficulty: 1 };
    const easyAnswer = String(solve(challenge.nonce, 1));
    expect(verifySolution(SECRET, "shop1", "203.0.113.5", encodeChallenge(easy), easyAnswer, NOW)).toBe(false);
  });

  it("issues a pass that holds for a day on the same IP", () => {
    const pass = issuePass(SECRET, "shop1", "203.0.113.5", NOW);
    expect(validPass(SECRET, "shop1", "203.0.113.5", pass, NOW + 3_600_000)).toBe(true);
    expect(validPass(SECRET, "shop1", "203.0.113.9", pass, NOW)).toBe(false);
    expect(validPass(SECRET, "shop2", "203.0.113.5", pass, NOW)).toBe(false);
    expect(validPass(SECRET, "shop1", "203.0.113.5", pass, NOW + 25 * 3_600_000)).toBe(false);
    expect(validPass(SECRET, "shop1", "203.0.113.5", "", NOW)).toBe(false);
    const [expires, signature] = pass.split(".");
    expect(validPass(SECRET, "shop1", "203.0.113.5", `${Number(expires) + 1}.${signature}`, NOW)).toBe(false);
  });

  it("is a handling option the blockers can save and send", () => {
    const form = new FormData();
    form.set("handling", "CHALLENGE");
    expect(parseHandlingForm(form)).toEqual({ ok: true, value: { handling: "CHALLENGE" } });
    const action = storefrontAction({
      handling: "CHALLENGE",
      header: "Access Denied",
      message: "No",
      redirectUrl: null,
      templateId: null,
      sectionSelector: null,
    });
    expect(action).toMatchObject({ type: "CHALLENGE", header: "Access Denied", message: "No" });
  });
});
