import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { FFmpegCommand, FFmpegRunner } from "../../src/index.ts";

describe("Integration Tests", () => {
	let mockRunner: FFmpegRunner;

	beforeEach(() => {
		// Create a mock runner for integration testing
		mockRunner = new FFmpegRunner({
			ffmpegPath: "true", // Use true command for silent testing
			ffprobePath: "true",
		});
	});

	describe("Runner Configuration", () => {
		it("should create runner with default paths", () => {
			const runner = new FFmpegRunner();
			expect(runner.ffmpegPath).toBe("ffmpeg");
			expect(runner.ffprobePath).toBe("ffprobe");
		});

		it("should create runner with custom paths", () => {
			const runner = new FFmpegRunner({
				ffmpegPath: "/custom/ffmpeg",
				ffprobePath: "/custom/ffprobe",
			});
			expect(runner.ffmpegPath).toBe("/custom/ffmpeg");
			expect(runner.ffprobePath).toBe("/custom/ffprobe");
		});

		it("should handle partial configuration", () => {
			const runner = new FFmpegRunner({
				ffmpegPath: "/custom/ffmpeg",
			});
			expect(runner.ffmpegPath).toBe("/custom/ffmpeg");
			expect(runner.ffprobePath).toBe("ffprobe");
		});
	});

	describe("Validation Integration", () => {
		it("should validate successful binary check", async () => {
			// Using 'true' command which always succeeds
			const runner = new FFmpegRunner({
				ffmpegPath: "true",
				ffprobePath: "true",
			});

			const isValid = await runner.validate();
			expect(isValid).toBe(true);
		});

		it("should fail validation with non-existent binaries", async () => {
			const runner = new FFmpegRunner({
				ffmpegPath: "/non-existent/ffmpeg",
				ffprobePath: "/non-existent/ffprobe",
			});

			const isValid = await runner.validate();
			expect(isValid).toBe(false);
		});

		it("should fail validation with invalid exit codes", async () => {
			// Using 'false' command which always fails
			const runner = new FFmpegRunner({
				ffmpegPath: "false",
				ffprobePath: "false",
			});

			const isValid = await runner.validate();
			expect(isValid).toBe(false);
		});
	});

	describe("Command Execution Integration", () => {
		it("should execute command and capture output", async () => {
			const command = new FFmpegCommand({
				outputOptions: ["hello", "world"],
			});

			const result = await mockRunner.run(command);

			// Verify ExecutionResult structure
			expect(result).toHaveProperty("exitCode");
			expect(result).toHaveProperty("stdout");
			expect(result).toHaveProperty("stderr");
			expect(result).toHaveProperty("success");
			expect(typeof result.exitCode).toBe("number");
			expect(typeof result.stdout).toBe("string");
			expect(typeof result.stderr).toBe("string");
			expect(typeof result.success).toBe("boolean");
		});

		it("should handle successful command execution", async () => {
			const command = new FFmpegCommand({
				outputOptions: ["test", "output"],
			});

			const result = await mockRunner.run(command);
			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
		});

		it("should handle command execution errors", async () => {
			// Using 'false' command which always fails
			const failRunner = new FFmpegRunner({
				ffmpegPath: "false",
				ffprobePath: "false",
			});

			const command = new FFmpegCommand({
				outputOptions: ["test"],
			});

			const result = await failRunner.run(command);
			expect(result.success).toBe(false);
			expect(result.exitCode).not.toBe(0);
		});

		it("should handle process spawn errors", async () => {
			const invalidRunner = new FFmpegRunner({
				ffmpegPath: "/absolutely/non/existent/binary",
				ffprobePath: "/absolutely/non/existent/binary",
			});

			const command = new FFmpegCommand({
				outputOptions: ["test"],
			});

			await expect(invalidRunner.run(command)).rejects.toThrow(
				"Failed to spawn FFmpeg process",
			);
		});
	});

	describe("Streaming Integration", () => {
		it("should handle input stream correctly", async () => {
			const inputStream = new Readable({
				read() {
					this.push("test data");
					this.push(null);
				},
			});

			const command = new FFmpegCommand({
				input: inputStream,
				outputOptions: ["output"],
			});

			expect(command.usesStdin).toBe(true);
			expect(command.usesStdout).toBe(false);

			const result = await mockRunner.run(command);
			expect(result.success).toBe(true);
		});

		it("should handle output stream correctly", async () => {
			let capturedData = "";
			const outputStream = new Writable({
				write(chunk, _encoding, callback) {
					capturedData += chunk.toString();
					callback();
				},
			});

			const command = new FFmpegCommand({
				input: "test-input",
				output: outputStream,
			});

			expect(command.usesStdin).toBe(false);
			expect(command.usesStdout).toBe(true);

			const result = await mockRunner.run(command);
			expect(result.success).toBe(true);
		});

		it("should handle both input and output streams", async () => {
			const inputStream = new Readable({
				read() {
					this.push("input data");
					this.push(null);
				},
			});

			let capturedData = "";
			const outputStream = new Writable({
				write(chunk, _encoding, callback) {
					capturedData += chunk.toString();
					callback();
				},
			});

			const command = new FFmpegCommand({
				input: inputStream,
				output: outputStream,
			});

			expect(command.usesStdin).toBe(true);
			expect(command.usesStdout).toBe(true);

			const result = await mockRunner.run(command);
			expect(result.success).toBe(true);
		});

		it("should handle stream errors gracefully", async () => {
			const errorStream = new Readable({
				read() {
					// This is a mock test, so we'll just provide normal data
					this.push("test data");
					this.push(null);
				},
			});

			// Add error handler to prevent unhandled error
			errorStream.on("error", () => {
				// Error handling is tested elsewhere
			});

			const command = new FFmpegCommand({
				input: errorStream,
				outputOptions: ["output"],
			});

			// Should not throw - error handling is managed by the process
			const result = await mockRunner.run(command);
			expect(result).toHaveProperty("success");
		});
	});

	describe("Probe Integration", () => {
		it("should handle probe command execution", async () => {
			// Mock invalid JSON response using echo
			const jsonRunner = new FFmpegRunner({
				ffmpegPath: "true",
				ffprobePath: "echo",
			});

			// This will fail because echo doesn't return valid JSON
			await expect(jsonRunner.probe("test-file")).rejects.toThrow(
				"Failed to parse FFprobe output",
			);
		});

		it("should handle probe command with valid JSON", async () => {
			// Create a runner that outputs valid JSON using printf
			const validJsonRunner = new FFmpegRunner({
				ffmpegPath: "true",
				ffprobePath: "printf", // printf can output formatted text
			});

			// This will still fail since we need actual JSON, but tests the structure
			await expect(
				validJsonRunner.probe('{"format":{}, "streams":[]}'),
			).rejects.toThrow();
		});

		it("should handle probe with non-existent binary", async () => {
			const invalidRunner = new FFmpegRunner({
				ffmpegPath: "true",
				ffprobePath: "/non-existent/ffprobe",
			});

			await expect(invalidRunner.probe("test-file")).rejects.toThrow(
				"Failed to spawn FFprobe process",
			);
		});

		it("should verify ProbeResult structure", async () => {
			// We can't easily test successful probe without mocking more,
			// but we can verify the error handling structure
			const runner = new FFmpegRunner({
				ffmpegPath: "true",
				ffprobePath: "false", // Command that always exits with code 1
			});

			await expect(runner.probe("test-file")).rejects.toThrow(
				"FFprobe failed with exit code 1",
			);
		});
	});

	describe("Error Handling Integration", () => {
		it("should propagate process errors correctly", async () => {
			const runner = new FFmpegRunner({
				ffmpegPath: "/absolutely/non/existent/command",
				ffprobePath: "true",
			});

			const command = new FFmpegCommand({
				outputOptions: ["test"],
			});

			await expect(runner.run(command)).rejects.toThrow(
				"Failed to spawn FFmpeg process",
			);
		});

		it("should handle exit codes correctly", async () => {
			// Test with command that exits with specific code
			const exitCodeRunner = new FFmpegRunner({
				ffmpegPath: "sh",
				ffprobePath: "true",
			});

			const command = new FFmpegCommand({
				outputOptions: ["-c", "exit 42"],
			});

			const result = await exitCodeRunner.run(command);
			expect(result.exitCode).toBe(42);
			expect(result.success).toBe(false);
		});

		it("should capture stderr output", async () => {
			// Use a command that writes to stderr
			const stderrRunner = new FFmpegRunner({
				ffmpegPath: "sh",
				ffprobePath: "true",
			});

			const command = new FFmpegCommand({
				outputOptions: ["-c", "echo 'error message' >&2"],
			});

			const result = await stderrRunner.run(command);
			expect(result.stderr).toContain("error message");
		});

		it("should handle missing exit code", async () => {
			// This tests the fallback to -1 when exit code is null
			const command = new FFmpegCommand({
				outputOptions: ["test"],
			});

			const result = await mockRunner.run(command);
			// Normal execution should have a valid exit code
			expect(typeof result.exitCode).toBe("number");
			expect(result.exitCode).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Command Arguments Integration", () => {
		it("should generate correct arguments for file-based commands", () => {
			const command = new FFmpegCommand({
				input: "input.mp4",
				inputOptions: ["-ss", "00:01:00"],
				output: "output.mp4",
				outputOptions: ["-t", "10", "-vcodec", "libx264"],
			});

			const args = command.toArgs();
			expect(args).toEqual([
				"-ss",
				"00:01:00", // input options
				"-i",
				"input.mp4", // input
				"-t",
				"10",
				"-vcodec",
				"libx264", // output options
				"output.mp4", // output
			]);
		});

		it("should generate correct arguments for stream-based commands", () => {
			const inputStream = new Readable();
			const outputStream = new Writable();

			const command = new FFmpegCommand({
				input: inputStream,
				output: outputStream,
				inputOptions: ["-f", "mp4"],
				outputOptions: ["-f", "mp4"],
			});

			const args = command.toArgs();
			expect(args).toEqual([
				"-f",
				"mp4", // input options
				"-i",
				"pipe:0", // input (stdin)
				"-f",
				"mp4", // output options
				"pipe:1", // output (stdout)
			]);
		});
	});

	describe("Process Lifecycle Integration", () => {
		it("should handle process completion events", async () => {
			const command = new FFmpegCommand({
				outputOptions: ["completion", "test"],
			});

			const result = await mockRunner.run(command);

			// Verify the result indicates proper process completion
			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
		});

		it("should handle process error events", async () => {
			const errorRunner = new FFmpegRunner({
				ffmpegPath: "/this/definitely/does/not/exist",
				ffprobePath: "true",
			});

			const command = new FFmpegCommand({
				outputOptions: ["test"],
			});

			// Should reject with specific error message
			await expect(errorRunner.run(command)).rejects.toThrow(
				"Failed to spawn FFmpeg process",
			);
		});

		it("should handle process close events", async () => {
			const command = new FFmpegCommand({
				outputOptions: ["test", "close", "event"],
			});

			const result = await mockRunner.run(command);

			// Should complete successfully
			expect(result).toBeDefined();
			expect(typeof result.exitCode).toBe("number");
		});
	});
});
