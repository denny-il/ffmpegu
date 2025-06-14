import { describe, expect, it } from "vitest";
import { defaultRunner, FFmpegCommand, FFmpegRunner } from "../../src/index.js";

describe("Index exports", () => {
	it("should export FFmpegCommand class", () => {
		expect(FFmpegCommand).toBeDefined();
		expect(typeof FFmpegCommand).toBe("function");

		const command = new FFmpegCommand();
		expect(command).toBeInstanceOf(FFmpegCommand);
	});

	it("should export FFmpegRunner class", () => {
		expect(FFmpegRunner).toBeDefined();
		expect(typeof FFmpegRunner).toBe("function");

		const runner = new FFmpegRunner();
		expect(runner).toBeInstanceOf(FFmpegRunner);
	});

	it("should export defaultRunner instance", () => {
		expect(defaultRunner).toBeDefined();
		expect(defaultRunner).toBeInstanceOf(FFmpegRunner);
		expect(defaultRunner.ffmpegPath).toBe("ffmpeg");
		expect(defaultRunner.ffprobePath).toBe("ffprobe");
	});

	it("should ensure defaultRunner is using default paths", () => {
		// The default runner should use system PATH
		expect(defaultRunner.ffmpegPath).toBe("ffmpeg");
		expect(defaultRunner.ffprobePath).toBe("ffprobe");
	});
});
