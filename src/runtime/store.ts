import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type AccountStatus = "connecting" | "active" | "logged_out" | "restricted";

export interface LocalAccount {
  id: string;
  country?: string;
  tag?: string;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
  last_connected_at?: string;
  last_error?: string;
}

export type OperationStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface LocalOperation {
  id: string;
  name: string;
  account_id?: string;
  status: OperationStatus;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  error_code?: string;
  created_at: string;
  updated_at: string;
}

export interface StoredMetric {
  account_id: string;
  video_id: string;
  caption: string | null;
  video_url: string | null;
  posted_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  privacy: string | null;
  sampled_at: string;
}

interface ActionRecord {
  account_id: string;
  operation: string;
  acted_at: number;
}

interface LocalState {
  version: 1;
  accounts: LocalAccount[];
  operations: LocalOperation[];
  metrics: StoredMetric[];
  actions: ActionRecord[];
}

const EMPTY_STATE: LocalState = { version: 1, accounts: [], operations: [], metrics: [], actions: [] };

export function dataDir(): string {
  const configured = process.env.TIKTOK_MCP_DATA_DIR;
  return configured ? resolve(configured) : join(homedir(), ".tiktok-mcp");
}

export function profileDir(accountId: string): string {
  const safe = accountId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  if (!safe) throw new Error("account_id must contain a letter, number, dot, dash, or underscore");
  const dir = join(dataDir(), "profiles", safe);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function statePath(): string {
  mkdirSync(dataDir(), { recursive: true });
  return join(dataDir(), "state.json");
}

function readState(): LocalState {
  const path = statePath();
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LocalState>;
  return {
    version: 1,
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    operations: Array.isArray(parsed.operations) ? parsed.operations : [],
    metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  };
}

function writeState(state: LocalState): void {
  const path = statePath();
  const next = `${path}.${process.pid}.next`;
  writeFileSync(next, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(next, path);
}

function update(mutator: (state: LocalState) => void): void {
  const state = readState();
  mutator(state);
  writeState(state);
}

export function upsertAccount(input: Pick<LocalAccount, "id" | "status"> & Partial<LocalAccount>): LocalAccount {
  let output!: LocalAccount;
  update((state) => {
    const now = new Date().toISOString();
    const existing = state.accounts.find((account) => account.id === input.id);
    if (existing) {
      Object.assign(existing, input, { updated_at: now });
      output = { ...existing };
    } else {
      const created: LocalAccount = { ...input, created_at: now, updated_at: now };
      state.accounts.push(created);
      output = { ...created };
    }
  });
  return output;
}

export function getAccount(id: string): LocalAccount | undefined {
  return readState().accounts.find((account) => account.id === id);
}

export function listAccounts(tag?: string): LocalAccount[] {
  return readState().accounts.filter((account) => !tag || account.tag === tag);
}

export function putOperation(operation: LocalOperation): void {
  update((state) => {
    const index = state.operations.findIndex((item) => item.id === operation.id);
    if (index >= 0) state.operations[index] = operation;
    else state.operations.push(operation);
    if (state.operations.length > 2_000) state.operations.splice(0, state.operations.length - 2_000);
  });
}

export function getOperation(id: string): LocalOperation | undefined {
  return readState().operations.find((operation) => operation.id === id);
}

export function listOperations(): LocalOperation[] {
  return readState().operations;
}

export function readMetrics(): StoredMetric[] {
  return readState().metrics;
}

export function appendMetrics(rows: StoredMetric[]): void {
  if (!rows.length) return;
  update((state) => {
    state.metrics.push(...rows);
    if (state.metrics.length > 50_000) state.metrics.splice(0, state.metrics.length - 50_000);
  });
}

export function readActions(accountId: string): ActionRecord[] {
  return readState().actions.filter((row) => row.account_id === accountId);
}

export function appendAction(accountId: string, operation: string): void {
  update((state) => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    state.actions = state.actions.filter((row) => row.acted_at >= cutoff);
    state.actions.push({ account_id: accountId, operation, acted_at: Date.now() });
  });
}
