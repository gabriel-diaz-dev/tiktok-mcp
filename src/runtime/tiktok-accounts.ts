import { listAccounts } from "./store.js";

export function listByOwner(_owner: string, tag?: string) {
  return listAccounts(tag);
}
