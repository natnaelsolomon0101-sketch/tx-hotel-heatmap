import test from "node:test";
import assert from "node:assert/strict";

import { CODE_TTL_MS, checkChallenge, newCode, signChallenge } from "./verify";

const SECRET = "test-secret";
const T0 = 1_800_000_000_000;

test("newCode is always six digits", () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), /^\d{6}$/);
});

test("correct code, same email (any case), inside the window passes", () => {
  const token = signChallenge("Jane@Company.com", "042917", SECRET, T0);
  assert.deepEqual(
    checkChallenge("jane@company.com ", "042917", token, SECRET, T0 + 60_000),
    { ok: true }
  );
});

test("wrong code fails", () => {
  const token = signChallenge("jane@company.com", "042917", SECRET, T0);
  assert.deepEqual(
    checkChallenge("jane@company.com", "042918", token, SECRET, T0),
    { ok: false, reason: "code" }
  );
});

test("token for another email fails", () => {
  const token = signChallenge("jane@company.com", "042917", SECRET, T0);
  assert.deepEqual(
    checkChallenge("bob@company.com", "042917", token, SECRET, T0),
    { ok: false, reason: "email" }
  );
});

test("expired token fails", () => {
  const token = signChallenge("jane@company.com", "042917", SECRET, T0);
  assert.deepEqual(
    checkChallenge(
      "jane@company.com",
      "042917",
      token,
      SECRET,
      T0 + CODE_TTL_MS + 1
    ),
    { ok: false, reason: "expired" }
  );
});

test("token signed with another secret fails", () => {
  const token = signChallenge("jane@company.com", "042917", "other", T0);
  assert.equal(
    checkChallenge("jane@company.com", "042917", token, SECRET, T0).ok,
    false
  );
});

test("garbage input is rejected as malformed", () => {
  for (const [code, token] of [
    ["042917", ""],
    ["042917", "abc"],
    ["042917", "a.b.c"],
    ["42917", "x.y"],
    ["abcdef", "x.y"],
    ["042917", "bm90anNvbg.sig"],
  ]) {
    const r = checkChallenge("jane@company.com", code, token, SECRET, T0);
    assert.equal(r.ok, false, `${code} / ${token}`);
  }
});
