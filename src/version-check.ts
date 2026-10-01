import { readFileSync } from 'node:fs';

const REPO_RELEASES_URL = 'https://api.github.com/repos/apaidedie/exa-gate/releases/latest';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 3000;
const CHECK_TIMEOUT_MS = 5000;

export type VersionStatus = {
  current: string;
  latest: string | null;
  upToDate: boolean | null;
  checkedAt: number | null;
  checkError: string | null;
};

// package.json sits next to src/ in dev and two levels up from dist/src in the image.
function readAppVersion(): string {
  for (const candidate of ['../package.json', '../../package.json']) {
    try {
      const parsed = JSON.parse(readFileSync(new URL(candidate, import.meta.url), 'utf8')) as { version?: string };
      if (typeof parsed.version === 'string' && parsed.version) return parsed.version;
    } catch {
      // Try the next candidate layout.
    }
  }
  return '0.0.0';
}

export function normalizeReleaseTag(tag: string): string {
  return tag.replace(/^v/i, '').trim();
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((part) => Number(part) || 0);
  const pb = b.split(/[.-]/).map((part) => Number(part) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type VersionChecker = {
  status: () => VersionStatus;
  checkNow: () => Promise<void>;
  start: () => void;
  stop: () => void;
};

export function createVersionChecker(options: { enabled?: boolean } = {}): VersionChecker {
  const status: VersionStatus = {
    current: readAppVersion(),
    latest: null,
    upToDate: null,
    checkedAt: null,
    checkError: null
  };
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<void> | null = null;

  async function checkNow(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const response = await fetch(REPO_RELEASES_URL, {
          headers: { 'user-agent': 'exa-gate-version-check', accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
        });
        if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
        const payload = (await response.json()) as { tag_name?: string };
        if (!payload.tag_name) throw new Error('GitHub API response missing tag_name');
        status.latest = normalizeReleaseTag(payload.tag_name);
        status.upToDate = compareVersions(status.current, status.latest) >= 0;
        status.checkedAt = Date.now();
        status.checkError = null;
      } catch (error) {
        status.checkError = error instanceof Error ? error.message : String(error);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function start(): void {
    if (options.enabled === false || timer) return;
    const initial = setTimeout(() => {
      void checkNow();
    }, INITIAL_DELAY_MS);
    initial.unref?.();
    timer = setInterval(() => {
      void checkNow();
    }, CHECK_INTERVAL_MS);
    timer.unref?.();
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { status: () => ({ ...status }), checkNow, start, stop };
}
