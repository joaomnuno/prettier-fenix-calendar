// bun.lock is JSONC: strip comments and trailing commas before parsing.
import { readFile } from "node:fs/promises";

const text = await readFile(process.argv[2], "utf8");
const stripped = text
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/,(\s*[}\]])/g, "$1");
const lock = JSON.parse(stripped);

const entry = lock.packages?.vinext;
if (!Array.isArray(entry)) {
  throw new Error("bun.lock does not contain a vinext package entry");
}
const descriptor = entry[0];
const integrity = entry.at(-1);
if (typeof descriptor !== "string" || !/^sha\d+-/.test(String(integrity))) {
  throw new Error("bun.lock does not contain an integrity-pinned vinext tarball");
}
const at = descriptor.lastIndexOf("@");
const name = descriptor.slice(0, at);
const version = descriptor.slice(at + 1);
if (name !== "vinext" || !version) {
  throw new Error(`unexpected vinext descriptor: ${descriptor}`);
}
console.log(`/${name}/-/${name}-${version}.tgz`);
console.log(integrity);
