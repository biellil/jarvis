import { describe, it, expect } from "vitest";
import { float32ToWav } from "./wav-encoder.js";

describe("float32ToWav", () => {
  it("produces a buffer with RIFF/WAVE/fmt/data headers", () => {
    const buf = float32ToWav(new Float32Array([0, 0.5, -0.5]), 16000);
    expect(buf.slice(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.slice(8, 12).toString("ascii")).toBe("WAVE");
    expect(buf.slice(12, 16).toString("ascii")).toBe("fmt ");
    expect(buf.slice(36, 40).toString("ascii")).toBe("data");
  });

  it("encodes sample rate at offset 24 (little endian)", () => {
    const buf = float32ToWav(new Float32Array([0]), 22050);
    expect(buf.readUInt32LE(24)).toBe(22050);
  });

  it("sets channels=1 and bitsPerSample=16", () => {
    const buf = float32ToWav(new Float32Array([0]), 16000);
    expect(buf.readUInt16LE(22)).toBe(1); // channels
    expect(buf.readUInt16LE(34)).toBe(16); // bitsPerSample
    expect(buf.readUInt16LE(20)).toBe(1); // PCM format
  });

  it("has length === 44 + samples.length * 2", () => {
    const samples = new Float32Array(100);
    const buf = float32ToWav(samples, 16000);
    expect(buf.length).toBe(44 + 200);
  });

  it("clips samples outside [-1, 1]", () => {
    const buf = float32ToWav(new Float32Array([1.5, -1.5]), 16000);
    expect(buf.readInt16LE(44)).toBe(32767);
    expect(buf.readInt16LE(46)).toBe(-32768);
  });

  it("encodes data size at offset 40", () => {
    const buf = float32ToWav(new Float32Array(10), 16000);
    expect(buf.readUInt32LE(40)).toBe(20);
  });
});
