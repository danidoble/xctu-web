// test/parser-manager.test.js — validate parser construction + error paths.
import assert from "node:assert/strict";
import {
  ParserManager,
  DEFAULT_PARSER_CONFIG,
  PARSER_TYPES,
} from "../src/parser-manager.js";
import { DelimiterParser } from "@serialport/parser-delimiter";
import { ByteLengthParser } from "@serialport/parser-byte-length";
import { ReadlineParser } from "@serialport/parser-readline";
import { RegexParser } from "@serialport/parser-regex";
import { InterByteTimeoutParser } from "@serialport/parser-inter-byte-timeout";

// Stub portManager — only isOpen() is touched during build().
const pm = { isOpen: () => true };
const mgr = new ParserManager(pm);

// Defaults
assert.equal(DEFAULT_PARSER_CONFIG.type, "none");
assert.deepEqual(PARSER_TYPES, [
  "none",
  "byte-length",
  "delimiter",
  "readline",
  "regex",
  "inter-byte-timeout",
]);

// none -> null
assert.equal(mgr.build({ type: "none" }), null);

// byte-length
const bl = mgr.build({ type: "byte-length", length: 8 });
assert.ok(bl instanceof ByteLengthParser);

// delimiter (escape sequences)
const d1 = mgr.build({
  type: "delimiter",
  delimiter: "\\n",
  delimiterAsHex: false,
});
assert.ok(d1 instanceof DelimiterParser);

// delimiter (hex)
const d2 = mgr.build({
  type: "delimiter",
  delimiter: "AA 55",
  delimiterAsHex: true,
});
assert.ok(d2 instanceof DelimiterParser);

// delimiter (bad hex -> error)
assert.throws(
  () =>
    mgr.build({ type: "delimiter", delimiter: "AA5", delimiterAsHex: true }),
  /even number/,
);

// readline
const rl = mgr.build({ type: "readline", delimiterReadline: "\r\n" });
assert.ok(rl instanceof ReadlineParser);

// regex
const rx = mgr.build({ type: "regex", regex: "\\r?\\n" });
assert.ok(rx instanceof RegexParser);

// inter-byte-timeout
const ibt = mgr.build({ type: "inter-byte-timeout", interval: 250 });
assert.ok(ibt instanceof InterByteTimeoutParser);

// bad length
assert.throws(
  () => mgr.build({ type: "byte-length", length: 0 }),
  /positive integer/,
);

// bad interval
assert.throws(
  () => mgr.build({ type: "inter-byte-timeout", interval: 0 }),
  /positive number/,
);

// unknown type
assert.throws(() => mgr.build({ type: "made-up" }), /unknown parser type/);

// apply() requires open port
const mgr2 = new ParserManager({ isOpen: () => false });
assert.throws(() => mgr2.apply({ type: "byte-length", length: 4 }), /not open/);

console.log("ALL PARSER TESTS PASSED ✓");
