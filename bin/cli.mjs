#!/usr/bin/env node

// Quick informal command-line interface for rdapper
// Usage:
//   npx rdapper example.com
//   echo "example.com" | npx rdapper

import { createInterface } from "node:readline";
import { lookup } from "../dist/index.mjs";

async function main() {
  if (process.argv.length > 2) {
    // URL(s) specified in the command arguments
    console.log(
      JSON.stringify(
        await lookup(process.argv[process.argv.length - 1]),
        null,
        2,
      ),
    );
  } else {
    // No domain passed as argument, read from each line of stdin
    const rlInterface = createInterface({
      input: process.stdin,
    });
    rlInterface.on("line", async (line) => {
      console.log(JSON.stringify(await lookup(line), null, 2));
    });
  }
}

main();
