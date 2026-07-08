#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function usage() {
  return [
    'Usage: npm run setup:env -- [--output .env] [--force]',
    '',
    'Generates a deployment .env file from .env.example with strong random values for:',
    '  EXA_KEYS_ENCRYPTION_SECRET',
    '  EXA_PROXY_TOKENS',
    '  EXA_ADMIN_TOKENS'
  ].join('\n');
}

function parseArgs(argv) {
  const options = { output: '.env', force: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--output' || arg === '-o') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a file path`);
      options.output = value;
      i += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function token(prefix) {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}

function replaceRequired(template, name, value) {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  if (!pattern.test(template)) throw new Error(`Missing ${name} in .env.example`);
  return template.replace(pattern, `${name}=${value}`);
}

function generateEnv(template) {
  let result = template;
  result = replaceRequired(result, 'EXA_KEYS_ENCRYPTION_SECRET', randomBytes(32).toString('hex'));
  result = replaceRequired(result, 'EXA_PROXY_TOKENS', token('proxy'));
  result = replaceRequired(result, 'EXA_ADMIN_TOKENS', token('admin'));
  return result;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }

  const outputPath = resolve(process.cwd(), options.output);
  if (existsSync(outputPath) && !options.force) {
    throw new Error(`${options.output} already exists. Re-run with --force to overwrite it.`);
  }

  const template = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
  const generated = generateEnv(template);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, generated, { flag: options.force ? 'w' : 'wx' });

  console.log(`Generated ${options.output} with strong random proxy/admin tokens.`);
  console.log('Review optional settings, then start with: docker compose up -d');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error(usage());
  process.exit(1);
}
