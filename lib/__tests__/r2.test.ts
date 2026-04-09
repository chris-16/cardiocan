import { describe, it, expect } from "vitest";
import { buildVideoKey } from "@/lib/r2";

describe("buildVideoKey", () => {
  it("builds correct key for webm video", () => {
    const key = buildVideoKey("dog-123", "meas-456", "video/webm");
    expect(key).toBe("videos/dog-123/meas-456.webm");
  });

  it("builds correct key for mp4 video", () => {
    const key = buildVideoKey("dog-123", "meas-456", "video/mp4");
    expect(key).toBe("videos/dog-123/meas-456.mp4");
  });

  it("builds correct key for quicktime video", () => {
    const key = buildVideoKey("dog-123", "meas-456", "video/quicktime");
    expect(key).toBe("videos/dog-123/meas-456.mov");
  });

  it("defaults to webm for unknown content type", () => {
    const key = buildVideoKey("dog-123", "meas-456", "video/x-unknown");
    expect(key).toBe("videos/dog-123/meas-456.webm");
  });
});
