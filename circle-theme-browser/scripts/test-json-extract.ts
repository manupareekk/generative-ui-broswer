/**
 * Run: npx tsx scripts/test-json-extract.ts
 */
import assert from "node:assert/strict";
import { extractJsonObject, sliceFirstBalancedJson } from "../server/src/jsonExtract.js";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log("ok:", name);
  } catch (e) {
    console.error("FAIL:", name, e);
    process.exit(1);
  }
}

run("nested object", () => {
  const o = extractJsonObject('prefix {"a":{"b":2},"c":true} suffix') as { a: { b: number }; c: boolean };
  assert.equal(o.a.b, 2);
  assert.equal(o.c, true);
});

run("brace inside string does not close early", () => {
  const o = extractJsonObject(`x {"k":"a}b","n":1} y`) as { k: string; n: number };
  assert.equal(o.k, "a}b");
  assert.equal(o.n, 1);
});

run("escaped quote in string", () => {
  const o = extractJsonObject(String.raw`{"q":"say \"hi\"","z":0}`) as { q: string; z: number };
  assert.equal(o.q, 'say "hi"');
  assert.equal(o.z, 0);
});

run("first object wins when two concatenated", () => {
  const o = extractJsonObject('{"a":1}{"b":2}') as { a?: number; b?: number };
  assert.equal(o.a, 1);
  assert.equal((o as { b?: number }).b, undefined);
});

run("markdown fence", () => {
  const o = extractJsonObject("```json\n{\"x\":3}\n```") as { x: number };
  assert.equal(o.x, 3);
});

run("truncated json throws", () => {
  assert.throws(() => extractJsonObject('{"a":'), /Incomplete|Invalid/);
});

run("sliceFirstBalancedJson null on truncated", () => {
  assert.equal(sliceFirstBalancedJson('{"a":'), null);
});

console.log("all json extract tests passed");
