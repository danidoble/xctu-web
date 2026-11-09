// xml-io.js — import/export XCTU-compatible XML for command sets.
//
// Two real-world XCTU shapes exist in the wild. We support both:
//
//   A) XCTU "data export" (most common):
//        <data>
//          <loop>false</loop>
//          <repeat_times>1</repeat_times>
//          <repeat_period>500</repeat_period>
//          <packets_list>
//            <packet name="...">
//              <payload>F1060000...</payload>
//            </packet>
//            ...
//          </packets_list>
//        </data>
//
//   B) XCTU "profile / xbee_profile" (older variant):
//        <xbee_profile>
//          <name>...</name>
//          <description>...</description>
//          <command_set>
//            <command format="ascii|hex">
//              <name>AT</name>
//              <frame>AT</frame>
//              <description>attention</description>
//            </command>
//            ...
//          </command_set>
//        </xbee_profile>
//
// We always EMIT shape A on export (since that's the file the user just gave us
// and they want it back). On import we accept either shape and normalise into
// our internal Command[] structure. roundTrip() is exercised in
// test/xml-roundtrip.js.

import { XMLParser, XMLBuilder } from "fast-xml-parser";

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  // Whitespace inside <frame>/<payload> is meaningful (e.g. trailing \r).
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
};

const BUILDER_OPTIONS = {
  ignoreAttributes: false,
  format: true,
  indentBy: "  ",
  suppressEmptyNode: false,
};

// Normalised internal command shape.
// { id, name, payload, format: 'ascii'|'hex', description }

function listFromDataShape(obj) {
  const list = obj?.data?.packets_list?.packet;
  if (!list) return null;
  const arr = Array.isArray(list) ? list : [list];
  return arr.map((p, i) => ({
    id: p["@_id"] || `imported-${i}-${Date.now()}`,
    name: String(p["@_name"] ?? p.name ?? `Packet ${i + 1}`),
    payload: String(p.payload ?? p.frame ?? ""),
    // Heuristic: payloads that look like pure hex strings (even length, only
    // 0-9a-f) are tagged as hex. Anything else is treated as ASCII.
    format:
      /^[0-9a-fA-F]+$/.test(String(p.payload ?? p.frame ?? "")) &&
      String(p.payload ?? p.frame ?? "").length % 2 === 0
        ? "hex"
        : "ascii",
    description: String(p.description ?? ""),
  }));
}

function listFromXbeeProfileShape(obj) {
  const cs = obj?.xbee_profile?.command_set;
  if (!cs) return null;
  const list = cs.command;
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  return arr.map((c, i) => {
    const formatAttr = c["@_format"];
    const formatElem = c.format;
    const format =
      (formatAttr ?? formatElem ?? "ascii") === "hex" ? "hex" : "ascii";
    return {
      id: c["@_id"] || `imported-${i}-${Date.now()}`,
      name: String(c.name || `Command ${i + 1}`),
      payload: String(c.frame ?? c.payload ?? ""),
      format,
      description: String(c.description || ""),
    };
  });
}

export function xmlToCommands(xmlString) {
  const parser = new XMLParser(PARSER_OPTIONS);
  const obj = parser.parse(xmlString);

  if (!obj || (obj.data === undefined && obj.xbee_profile === undefined)) {
    throw new Error("not an XCTU file: expected root <data> or <xbee_profile>");
  }

  // Try the modern XCTU "data" shape first.
  const dataList = listFromDataShape(obj);
  if (dataList !== null) return dataList;

  // Fall back to the older xbee_profile shape.
  const xbeeList = listFromXbeeProfileShape(obj);
  if (xbeeList !== null) return xbeeList;

  throw new Error(
    "XCTU file: recognised root, but no <packets_list> or <command_set> child found",
  );
}

// Export in the modern XCTU shape — this matches what the user typically
// drops back into XCTU and round-trips cleanly.
export function commandsToXml({
  name = "XCTU Profile",
  description = "",
  commands = [],
}) {
  const xmlObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    data: {
      loop: "false",
      repeat_times: "1",
      repeat_period: "500",
      packets_list: {
        packet: commands.map((c) => ({
          "@_name": c.name,
          payload: c.payload,
        })),
      },
    },
  };

  const builder = new XMLBuilder(BUILDER_OPTIONS);
  return builder.build(xmlObj);
}

export function roundTrip({ name, description, commands }) {
  const xml = commandsToXml({ name, description, commands });
  const back = xmlToCommands(xml);
  return { xml, commands: back };
}
