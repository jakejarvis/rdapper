#!/usr/bin/env node

// Quick informal command-line interface for rdapper
// Usage:
//   npx rdapper example.com [example.org ...]
//   echo "example.com" | npx rdapper
// Exits with 1 when any lookup fails.

import { createInterface } from "node:readline";
import { lookup } from "../dist/index.mjs";

/** Domains from the arguments, or else one per non-blank line of stdin. */
async function* domains() {
  const args = process.argv.slice(2);
  if (args.length) {
    yield* args;
    return;
  }
  for await (const line of createInterface({ input: process.stdin })) {
    if (line.trim()) yield line;
  }
}

async function main() {
  // One at a time, so output follows input order and registries aren't flooded
  for await (const domain of domains()) {
    if (domain.startsWith("-")) {
      console.error(`Unknown option: ${domain}`);
      process.exitCode = 2;
      return;
    }
    const result = await lookup(domain);
    if (!result.ok) process.exitCode = 1;
    console.log(JSON.stringify(result, null, 2));
  }
}

void main();
