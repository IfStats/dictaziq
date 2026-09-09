import assert from "node:assert/strict";

import {
  canonicalJson,
  canonicalSha256,
} from "../src/lib/predictions/market-evidence-persistence";

function main() {
  const first = {
    b: 2,

    a: {
      z: true,
      x: "test",
    },

    list: [
      3,
      2,
      1,
    ],
  };

  const second = {
    list: [
      3,
      2,
      1,
    ],

    a: {
      x: "test",
      z: true,
    },

    b: 2,
  };

  assert.equal(
    canonicalJson(
      first,
    ),
    canonicalJson(
      second,
    ),
  );

  assert.equal(
    canonicalSha256(
      first,
    ),
    canonicalSha256(
      second,
    ),
  );

  assert.notEqual(
    canonicalSha256({
      list: [
        1,
        2,
        3,
      ],
    }),
    canonicalSha256({
      list: [
        3,
        2,
        1,
      ],
    }),
  );

  assert.throws(
    () =>
      canonicalJson({
        invalid:
          Number.NaN,
      }),
  );

  console.log(
    "PASS: object key order does not affect canonical JSON.",
  );

  console.log(
    "PASS: canonical SHA-256 is deterministic.",
  );

  console.log(
    "PASS: array ordering remains evidence-significant.",
  );

  console.log(
    "PASS: non-finite numeric evidence is rejected.",
  );
}

main();