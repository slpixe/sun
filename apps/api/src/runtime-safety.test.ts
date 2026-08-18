import { describe, expect, it, vi } from "vitest";

import {
  createTimeoutFetch,
  parseCorsAllowedOrigins,
  type FetchLike,
} from "./runtime-safety.js";

describe("runtime safety", () => {
  it("allows unrestricted development CORS when no origins are configured", () => {
    expect(parseCorsAllowedOrigins(undefined, { required: false })).toBeUndefined();
  });

  it("requires explicit production CORS origins", () => {
    expect(() =>
      parseCorsAllowedOrigins(undefined, { required: true }),
    ).toThrow("CORS_ALLOWED_ORIGINS is required in production");
  });

  it("parses, validates, and deduplicates exact origins", () => {
    expect(
      parseCorsAllowedOrigins(
        "https://sun.slpixe.com, http://localhost:3000,https://sun.slpixe.com",
        { required: true },
      ),
    ).toEqual(["https://sun.slpixe.com", "http://localhost:3000"]);
    expect(() =>
      parseCorsAllowedOrigins("https://sun.slpixe.com/path", { required: true }),
    ).toThrow("exact HTTP(S) origin");
  });

  it("aborts an upstream fetch after the configured timeout", async () => {
    const waitingFetch = vi.fn<FetchLike>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const timeoutFetch = createTimeoutFetch(5, waitingFetch);

    await expect(timeoutFetch("https://example.test")).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(waitingFetch).toHaveBeenCalledOnce();
  });

  it("preserves an earlier caller abort signal", async () => {
    const waitingFetch = vi.fn<FetchLike>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(init.signal.reason);
          }
        }),
    );
    const timeoutFetch = createTimeoutFetch(10_000, waitingFetch);
    const controller = new AbortController();
    controller.abort(new Error("caller aborted"));

    await expect(
      timeoutFetch("https://example.test", { signal: controller.signal }),
    ).rejects.toThrow("caller aborted");
  });
});
