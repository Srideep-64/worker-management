import { api } from "../api/client.js";

let cachedUsers = null;
let pendingRequest = null;

export function getCachedUsers() {
  return cachedUsers;
}

export async function fetchUsers({ refresh = false } = {}) {
  // Reuse cached data unless refresh was explicitly requested.
  if (!refresh && cachedUsers !== null) {
    return cachedUsers;
  }

  // Prevent duplicate simultaneous requests.
  if (pendingRequest) {
    return pendingRequest;
  }

  pendingRequest = (async () => {
    const response = await api.get("/users");
    cachedUsers = response.users ?? [];
    return cachedUsers;
  })();

  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}