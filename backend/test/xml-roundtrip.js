// test/xml-roundtrip.js — verify XML import/export for both XCTU shapes.
//
// We support two real-world XCTU schemas:
//   1) Modern "data export" with <data><packets_list><packet name="..."><payload>...</payload>
//   2) Older "xbee_profile" with <xbee_profile><command_set><command format="..."><name><frame>
//
// Export always emits shape 1. Import accepts either.
import { commandsToXml, xmlToCommands, roundTrip } from "../src/xml-io.js";

const assert = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
};

// ---------- Shape 1: data / packets_list / packet ----------
const sample = [
  {
    id: "a",
    name: "Discover card",
    payload: "F1060000000000000000F2F8",
    format: "hex",
    description: "",
  },
  {
    id: "b",
    name: "Enable escrow",
    payload: "F1C00101000000000000F2B4",
    format: "hex",
    description: "",
  },
  {
    id: "c",
    name: "ASCII command",
    payload: "AT\n",
    format: "ascii",
    description: "attention",
  },
  {
    id: "d",
    name: "Multi-line",
    payload: "line1\nline2",
    format: "ascii",
    description: "newline preserved",
  },
];

console.log("--- commandsToXml (data shape) ---");
const xml = commandsToXml({
  name: "Test",
  description: "unit",
  commands: sample,
});
console.log(xml);
assert(xml.includes("<?xml"), "xml should declare xml version");
assert(xml.includes("<data>"), "xml should use <data> root");
assert(xml.includes("<packets_list>"), "xml should contain packets_list");
assert(xml.includes("<loop>false</loop>"), "xml should contain loop=false");
assert(/<packet[\s>]/.test(xml), "xml should contain packet blocks");
assert(
  xml.includes("F1060000000000000000F2F8"),
  "packet payload should appear verbatim",
);

console.log("\n--- xmlToCommands (data shape round-trip) ---");
const back = xmlToCommands(xml);
console.log(JSON.stringify(back, null, 2));
assert(back.length === 4, "round-trip count mismatch");
assert(back[0].name === "Discover card", "name round-trip");
assert(
  back[0].payload === "F1060000000000000000F2F8",
  "hex payload round-trip",
);
assert(back[0].format === "hex", "hex format inferred correctly");
assert(back[2].payload === "AT\n", "ascii payload round-trip");
assert(back[2].format === "ascii", "ascii format inferred correctly");
assert(
  back[3].payload === "line1\nline2",
  "newline preserved across round-trip",
);

console.log("\n--- import the actual real-world commands-xctu.xml ---");
const fs = await import("node:fs");
const realPath = new URL("../../commands-xctu.xml", import.meta.url).pathname;
const realXml = fs.readFileSync(realPath, "utf8");
const realCmds = xmlToCommands(realXml);
console.log(`parsed ${realCmds.length} commands`);
assert(realCmds.length > 0, "real XCTU file should yield commands");
assert(
  realCmds[0].name && realCmds[0].payload,
  "real commands must have name and payload",
);
assert(
  realCmds.every((c) => c.format === "hex"),
  "real XCTU packets are all hex",
);

// ---------- Shape 2: xbee_profile / command_set / command ----------
const xbeeXml = `<?xml version="1.0" encoding="UTF-8"?>
<xbee_profile>
  <name>Legacy</name>
  <description></description>
  <command_set>
    <command format="ascii">
      <name>AT</name>
      <frame>AT</frame>
      <description>attention</description>
    </command>
    <command format="hex">
      <name>XBee frame</name>
      <frame>7E0011</frame>
      <description></description>
    </command>
  </command_set>
</xbee_profile>`;

console.log("\n--- xmlToCommands (xbee_profile shape) ---");
const xbeeBack = xmlToCommands(xbeeXml);
console.log(JSON.stringify(xbeeBack, null, 2));
assert(xbeeBack.length === 2, "xbee shape count");
assert(xbeeBack[0].name === "AT", "xbee name");
assert(xbeeBack[0].format === "ascii", "xbee ascii format");
assert(xbeeBack[1].format === "hex", "xbee hex format");
assert(xbeeBack[1].payload === "7E0011", "xbee hex payload");

// Element-form format (alternative spelling some XCTU exports use)
const xbeeXmlElementFormat = `<?xml version="1.0"?>
<xbee_profile>
  <command_set>
    <command>
      <name>From-element-format</name>
      <frame>4142</frame>
      <format>hex</format>
    </command>
  </command_set>
</xbee_profile>`;
const elemFormatCmds = xmlToCommands(xbeeXmlElementFormat);
assert(elemFormatCmds[0].format === "hex", "element-format hex recognised");
assert(elemFormatCmds[0].payload === "4142", "element-format payload");

// ---------- roundTrip helper ----------
console.log("\n--- roundTrip helper ---");
const { xml: xml2, commands } = roundTrip({
  name: "X",
  description: "d",
  commands: sample,
});
assert(commands.length === 4, "roundTrip: count");
assert(xml2.includes("<data>"), "roundTrip: root");

// ---------- error handling ----------
console.log("\n--- error handling ---");
try {
  xmlToCommands("<not_xbee/>");
  console.error("FAIL: should reject non-XCTU xml");
  process.exit(1);
} catch (e) {
  assert(
    /<data> or <xbee_profile>/.test(e.message),
    `error should mention both roots, got: ${e.message}`,
  );
}

try {
  xmlToCommands("<data><loop>false</loop></data>");
  console.error("FAIL: should reject data without packets_list");
  process.exit(1);
} catch (e) {
  assert(
    /packets_list/.test(e.message),
    `error should mention packets_list, got: ${e.message}`,
  );
}

console.log("\nALL XML TESTS PASSED ✓");
