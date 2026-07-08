#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const riskyFilePatterns = [
  /^\.env(?:\.|$)/,
  /^exa_api_key.*\.txt$/i,
  /^secrets\.(json|ya?ml|txt)$/i,
  /\.(pem|key|p12|pfx)$/i,
  /\.(deprecated|old)$/i
];

const riskyContentPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/,
  /\b(?:sk|pk)-[A-Za-z0-9_-]{32,}\b/
];

function gitFiles(args) {
  const output = execFileSync('git', args, { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function candidateFiles() {
  return [...new Set([
    ...gitFiles(['ls-files', '-z']),
    ...gitFiles(['ls-files', '--others', '--exclude-standard', '-z'])
  ])];
}

const findings = [];

for (const file of candidateFiles()) {
  const name = basename(file);
  if (name === '.env.example') continue;

  if (riskyFilePatterns.some((pattern) => pattern.test(name))) {
    findings.push(`${file}: risky filename is present in tracked or unignored files`);
    continue;
  }

  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const pattern of riskyContentPatterns) {
    if (pattern.test(content)) {
      findings.push(`${file}: content matches ${pattern}`);
      break;
    }
  }
}

if (findings.length > 0) {
  console.error('Potential secret material found:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('No secret material found in tracked or unignored files.');
