import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

// #739 — how many e2e workers to run: half the CPUs this process may use, the
// same share as Playwright's default, at least 1.
//
// Playwright's default counts os.cpus(), which in a container is every core on
// the host, not the container's CPU limit. A 2-CPU job on an 8-core host got 4
// workers, so 4 browsers shared 2 CPUs and the WebKit tests ran out of time.
//
// availableParallelism() follows the cgroup limit only from libuv 1.49 (late
// Node 22). package.json allows Node 20, so this also reads the cgroup v2 limit
// itself and takes the smaller of the two.

// cgroupCpus reads a cgroup v2 cpu.max line ("200000 100000" = 2 CPUs, or
// "max 100000" = no limit). It returns the CPU count, or null for no limit or
// a line it cannot read.
export function cgroupCpus(cpuMax: string | null): number | null {
  if (!cpuMax) return null;
  const [quota, period] = cpuMax.trim().split(/\s+/);
  const q = Number(quota);
  const p = Number(period);
  if (quota === 'max' || !Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return null;
  return q / p;
}

export function workersFor(parallelism: number, cpuMax: string | null): number {
  const limit = cgroupCpus(cpuMax);
  const cpus = limit === null ? parallelism : Math.min(parallelism, limit);
  return Math.max(1, Math.floor(cpus / 2));
}

function readCpuMax(): string | null {
  try {
    return readFileSync('/sys/fs/cgroup/cpu.max', 'utf8');
  } catch {
    return null; // not Linux, or cgroup v1: no limit we can read
  }
}

export function e2eWorkers(): number {
  return workersFor(availableParallelism(), readCpuMax());
}
