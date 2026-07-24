#!/usr/bin/env node
// Generates a WashSuite license key and registers its hash in Supabase.
//
// The plaintext key is only ever shown once, right here in the terminal --
// only its SHA-256 hash is stored, matching what validate-license checks
// against. Copy it to the customer immediately; it can't be retrieved again.
//
// Usage:
//   node scripts/gen-license.mjs --email owner@example.com [--plan standard] [--activations 1] [--count 1] [--dry-run]
//
// Requires SUPABASE_SERVICE_ROLE_KEY (never the anon/publishable key -- the
// licenses table has no RLS policies, so only the service role can write to
// it). Put it in a git-ignored `.env.local` file (see .env.local.example) or
// export it in your shell. Never commit this key or ship it in the app.

import { readFileSync, existsSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
loadDotEnvLocal(join(ROOT, ".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://hxgjduszmszydrkvdesf.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Crockford-ish alphabet with ambiguous characters (0/O, 1/I) removed, so a
// key read aloud or hand-typed at a laundry counter doesn't get miskeyed.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function loadDotEnvLocal(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { plan: "standard", activations: 1, count: 1, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.split(/=(.*)/s);
    const takeValue = () => inlineValue ?? argv[++i];
    switch (flag) {
      case "--email":
        args.email = takeValue();
        break;
      case "--plan":
        args.plan = takeValue();
        break;
      case "--activations":
        args.activations = Number(takeValue());
        break;
      case "--count":
        args.count = Number(takeValue());
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        console.error(`Unknown argument: ${flag}`);
        process.exit(1);
    }
  }
  return args;
}

function segment(length = 5) {
  let out = "";
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function generateKey() {
  return `WASH-${segment()}-${segment()}-${segment()}-${segment()}`;
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

async function insertLicense({ url, serviceRoleKey, hash, prefix, email, plan, activations }) {
  const res = await fetch(`${url}/rest/v1/licenses`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      license_key_hash: hash,
      license_key_prefix: prefix,
      customer_email: email ?? null,
      plan,
      max_activations: activations,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${body}`);
  }
  const [row] = await res.json();
  return row;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      "Usage: node scripts/gen-license.mjs --email owner@example.com [--plan standard] [--activations 1] [--count 1] [--dry-run]",
    );
    return;
  }

  if (!args.dryRun && !SERVICE_ROLE_KEY) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local (see .env.local.example) or export it in your shell.",
    );
    process.exit(1);
  }

  if (!Number.isInteger(args.activations) || args.activations < 1) {
    console.error("--activations must be a positive integer.");
    process.exit(1);
  }
  if (!Number.isInteger(args.count) || args.count < 1) {
    console.error("--count must be a positive integer.");
    process.exit(1);
  }

  for (let i = 0; i < args.count; i++) {
    const key = generateKey();
    const hash = sha256Hex(key);
    const prefix = key.slice(0, 9); // "WASH-XXXXX" -> shown to the customer/support, not secret

    if (args.dryRun) {
      console.log(`[dry run] ${key}  (hash ${hash.slice(0, 12)}…, plan=${args.plan}, activations=${args.activations})`);
      continue;
    }

    const row = await insertLicense({
      url: SUPABASE_URL,
      serviceRoleKey: SERVICE_ROLE_KEY,
      hash,
      prefix,
      email: args.email,
      plan: args.plan,
      activations: args.activations,
    });

    console.log("License created -- copy this now, it will not be shown again:");
    console.log(`  ${key}`);
    console.log(`  id: ${row.id}  plan: ${row.plan}  max_activations: ${row.max_activations}${args.email ? `  email: ${args.email}` : ""}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
