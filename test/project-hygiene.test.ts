import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type OpenApiOperation = { security?: Array<Record<string, unknown>>; responses?: Record<string, unknown> };
type OpenApiDocument = {
  openapi: string;
  security?: Array<Record<string, unknown>>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { securitySchemes: Record<string, unknown>; responses: Record<string, unknown>; schemas: Record<string, unknown> };
};

const rootBatScripts = [
  'scripts/prepare-deployment.bat',
  'scripts/fix-sqlite.bat',
  'scripts/check-docker.bat',
  'scripts/publish-docker-hub.bat'
];

describe('project hygiene', () => {
  it('runs project-level Windows scripts from the repository root', () => {
    for (const scriptPath of rootBatScripts) {
      const content = readFileSync(scriptPath, 'utf8');
      expect(content, scriptPath).toContain('cd /d "%~dp0.."');
    }
  });

  it('keeps Docker build lean by only copying build-essential files', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const dockerignore = readFileSync('.dockerignore', 'utf8');
    const copyScript = readFileSync('scripts/copy-admin-ui.mjs', 'utf8');

    expect(dockerfile).toContain('COPY src ./src');
    expect(dockerfile).toContain('COPY scripts ./scripts');
    expect(dockerfile).not.toContain('COPY test');
    expect(dockerfile).not.toContain('COPY docs');
    expect(dockerfile).not.toContain('COPY .github');
    expect(dockerfile).toContain('/_proxy/ready');
    expect(dockerignore).toContain('*.md');
    expect(dockerignore).toContain('!README.md');
    expect(copyScript).toContain('../docs/openapi.json');
    expect(copyScript).toContain('../dist/docs/openapi.json');
  });

  it('keeps local secret and legacy key files out of git', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

    expect(gitignore).toContain('exa_api_key*.txt');
    expect(gitignore).toContain('*.deprecated');
    expect(gitignore).toContain('*.old');
    expect(gitignore).toContain('*.backup');
    expect(packageJson.scripts['setup:env']).toBe('node scripts/setup-env.mjs');
    expect(packageJson.scripts['scan:secrets']).toBe('node scripts/scan-secrets.mjs');
    const scanner = readFileSync('scripts/scan-secrets.mjs', 'utf8');
    expect(scanner).toContain('Potential secret material found');
    expect(scanner).toContain("['ls-files', '--others', '--exclude-standard', '-z']");
    expect(readFileSync('scripts/setup-env.mjs', 'utf8')).toContain('randomBytes');
  });

  it('keeps GitHub-facing package metadata aligned with the public project', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      description?: string;
      repository?: { type?: string; url?: string };
      bugs?: { url?: string };
      homepage?: string;
      keywords?: string[];
    };

    expect(packageJson.description).toContain('Exa API reverse proxy');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/apaidedie/exa-reverse-proxy.git'
    });
    expect(packageJson.bugs?.url).toBe('https://github.com/apaidedie/exa-reverse-proxy/issues');
    expect(packageJson.homepage).toBe('https://github.com/apaidedie/exa-reverse-proxy#readme');
    expect(packageJson.keywords).toEqual(expect.arrayContaining([
      'exa',
      'reverse-proxy',
      'api-key-management',
      'failover',
      'observability',
      'docker',
      'prometheus',
      'admin-console'
    ]));
  });

  it('provides Docker volume backup and restore scripts for the SQLite state', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const backup = readFileSync('scripts/backup-state.mjs', 'utf8');
    const restore = readFileSync('scripts/restore-state.mjs', 'utf8');

    expect(packageJson.scripts['backup:docker']).toBe('node scripts/backup-state.mjs');
    expect(packageJson.scripts['restore:docker']).toBe('node scripts/restore-state.mjs');
    expect(backup).toContain("['compose', '-f', composeFile, 'stop', serviceName]");
    expect(backup).toContain('tar -czf -');
    expect(restore).toContain("['compose', '-f', composeFile, 'stop', serviceName]");
    expect(restore).toContain('tar -xzf - -C /data');
  });

  it('pins the developer runtime and automates CI plus Docker Hub publishing', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const readme = readFileSync('README.md', 'utf8');
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const codeql = readFileSync('.github/workflows/codeql.yml', 'utf8');
    const publish = readFileSync('.github/workflows/docker-publish.yml', 'utf8');
    const release = readFileSync('.github/workflows/release.yml', 'utf8');
    const dependabot = readFileSync('.github/dependabot.yml', 'utf8');

    expect(packageJson.scripts.verify).toBe('npm run scan:secrets && npm run lint && npm test && npm audit --audit-level=high && npm run build');
    expect(readme).toContain('为什么值得用');
    expect(readme).toContain('CI、CodeQL、Dependabot、OpenAPI 3.1 契约、Playwright E2E 和 `npm run verify`');
    expect(ci).toContain('node-version: 22.x');
    expect(ci).toContain('- main');
    expect(ci).toContain('- master');
    expect(ci).toContain('npm run verify');
    expect(ci).toContain('npx playwright install --with-deps chromium');
    expect(ci).toContain('npm run test:e2e');
    expect(ci).toContain('docker build -t exa-reverse-proxy:ci .');
    expect(readme).toContain('actions/workflows/codeql.yml/badge.svg');
    expect(codeql).toContain('security-events: write');
    expect(codeql).toContain('languages: javascript-typescript');
    expect(codeql).toContain('github/codeql-action/init@v3');
    expect(codeql).toContain('github/codeql-action/analyze@v3');
    expect(codeql).toContain('pull_request:');
    expect(codeql).toContain('- main');
    expect(codeql).toContain('- master');
    expect(codeql).toContain('cron:');
    expect(publish).toContain('al1ya/exa-reverse-proxy');
    expect(publish).toContain('default: 0.5.0');
    expect(publish).toContain('npm run verify');
    expect(publish).toContain('npm run test:e2e');
    expect(publish).toContain('platforms: linux/amd64,linux/arm64');
    expect(release).toContain('node-version: 22.x');
    expect(release).toContain('npm run verify');
    expect(release).toContain('npm run test:e2e');
    expect(release).toContain('softprops/action-gh-release@v2');
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('package-ecosystem: docker');
    expect(dependabot).toContain('timezone: Asia/Hong_Kong');
    expect(dependabot).toContain('production-dependencies');
    expect(dependabot).toContain('development-dependencies');
  });

  it('keeps a single deployment compose file ready for one-command VPS starts', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');

    expect(compose).toContain('image: al1ya/exa-reverse-proxy:latest');
    expect(compose).toContain('"127.0.0.1:8787:8787"');
    expect(compose).toContain('EXA_STATE_PATH: /data/exa-proxy.sqlite');
    expect(compose).toContain('./exa_proxy_data:/data');
    expect(compose).not.toContain('EXA_KEYS_FILE');
    expect(compose).not.toContain('exa_api_key.txt');
  });

  it('keeps user-facing docs aligned with the current verification state', () => {
    const docs = [
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      '.github/SECURITY.md',
      'docs/README.md',
      'docs/DEPLOYMENT.md',
      'docs/DEPLOYMENT_CHECKLIST.md'
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    const scripts = [
      'scripts/fix-sqlite.bat',
      'scripts/prepare-deployment.bat',
      'scripts/publish-docker-hub.bat'
    ].map((path) => readFileSync(path, 'utf8')).join('\n');

    expect(docs).not.toMatch(/(?:测试结果|测试通过|所有测试通过)[^\n]*\d+\/\d+/);
    expect(docs).not.toContain('5 个高危漏洞');
    expect(docs).not.toContain('98HfFe54T6qRi4Z3H');
    expect(docs).not.toContain('github.com/user/exa-reverse-proxy');
    expect(docs).not.toContain('Security And Operations');
    expect(docs).toContain('github.com/apaidedie/exa-reverse-proxy');
    expect(docs).toContain('/_proxy/live');
    expect(docs).toContain('/_proxy/ready');
    expect(docs).toContain('openapi.json');
    expect(docs).toContain('npm run setup:env');
    expect(scripts).not.toContain('Run: npm install');
    expect(scripts).not.toContain('docker compose build');
    expect(scripts).toContain('docker build -t exa-reverse-proxy:local .');
    expect(scripts).toContain('docker-compose.yml');
  });

  it('keeps the OpenAPI contract aligned with the management API surface', () => {
    const openapi = JSON.parse(readFileSync('docs/openapi.json', 'utf8')) as OpenApiDocument;
    const serialized = JSON.stringify(openapi);
    const requiredOperations = [
      ['GET', '/_proxy/live'],
      ['GET', '/_proxy/ready'],
      ['GET', '/_proxy/openapi.json'],
      ['POST', '/_proxy/session'],
      ['DELETE', '/_proxy/session'],
      ['GET', '/_proxy/health'],
      ['GET', '/_proxy/config-summary'],
      ['GET', '/_proxy/events'],
      ['GET', '/_proxy/keys'],
      ['POST', '/_proxy/keys'],
      ['PUT', '/_proxy/keys/{id}'],
      ['DELETE', '/_proxy/keys/{id}'],
      ['POST', '/_proxy/keys/{id}/test'],
      ['POST', '/_proxy/keys/{id}/disable'],
      ['POST', '/_proxy/keys/{id}/enable'],
      ['POST', '/_proxy/keys/{id}/reset-circuit'],
      ['POST', '/_proxy/keys/{id}/secret'],
      ['GET', '/_proxy/keys/{id}/failures'],
      ['POST', '/_proxy/keys/batch'],
      ['POST', '/_proxy/keys/import'],
      ['GET', '/_proxy/logs'],
      ['GET', '/_proxy/logs/trace/{requestId}'],
      ['GET', '/_proxy/logs/export'],
      ['POST', '/_proxy/logs/prune'],
      ['GET', '/_proxy/observability'],
      ['GET', '/_proxy/metrics'],
      ['GET', '/_proxy/audit'],
      ['GET', '/_proxy/audit/export'],
      ['POST', '/_proxy/alerts/webhook/test']
    ] as const;

    expect(openapi.openapi).toMatch(/^3\.1\./);
    expect(openapi.security?.length).toBeGreaterThan(0);
    expect(openapi.components.securitySchemes).toHaveProperty('AdminBearer');
    expect(openapi.components.securitySchemes).toHaveProperty('AdminSessionHeader');
    expect(openapi.components.responses).toHaveProperty('Json');
    expect(openapi.components.responses).toHaveProperty('Error');
    expect(openapi.components.schemas).toHaveProperty('ProxyError');
    expect(serialized).not.toMatch(/\b(?:sk|pk)-[A-Za-z0-9_-]{32,}\b/);

    for (const [method, path] of requiredOperations) {
      expect(openapi.paths[path]?.[method.toLowerCase()], `${method} ${path}`).toBeTruthy();
    }
    expect(openapi.paths['/_proxy/live'].get.security).toEqual([]);
    expect(openapi.paths['/_proxy/ready'].get.security).toEqual([]);
    expect(openapi.paths['/_proxy/openapi.json'].get.security).toEqual([]);

    const sourceRoutes = [
      'src/app.ts',
      'src/admin.ts',
      'src/admin/static.ts',
      'src/admin/keyActions.ts',
      'src/admin/webhook.ts'
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    for (const [method, path] of requiredOperations) {
      const fastifyPath = path.replaceAll('{id}', ':id').replaceAll('{requestId}', ':requestId');
      expect(sourceRoutes, `${method} ${fastifyPath} should exist in Fastify route registration`).toContain(`.${method.toLowerCase()}('${fastifyPath}'`);
    }
  });
});
