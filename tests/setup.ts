import { vi } from "vitest";
// Vitest runs in Node, outside Next's RSC compiler. Only the import guard is
// stubbed; authentication, DB, Storage and repositories stay real in integration.
vi.mock("server-only", () => ({}));
