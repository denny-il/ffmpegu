import type {
  FFmpegCommandOptions,
  FFmpegInput,
  FFmpegOutput,
} from "./types.js";

/**
 * Immutable FFmpeg command configuration
 *
 * Represents a complete FFmpeg command with input, output, and options.
 * Once constructed, the command cannot be modified.
 */
export class FFmpegCommand {
	public readonly input?: FFmpegInput;
	public readonly inputOptions: readonly string[];
	public readonly output?: FFmpegOutput;
	public readonly outputOptions: readonly string[];

	constructor(options: FFmpegCommandOptions = {}) {
		this.input = options.input;
		this.inputOptions = Object.freeze(options.inputOptions ?? []);
		this.output = options.output;
		this.outputOptions = Object.freeze(options.outputOptions ?? []);
	}

	/**
	 * Convert the command to FFmpeg arguments array
	 * This method handles the conversion of streams to appropriate FFmpeg arguments
	 */
	toArgs(): string[] {
		const args: string[] = [];

		// Add input options first (before -i)
		args.push(...this.inputOptions);

		// Add input
		if (this.input !== undefined) {
			if (typeof this.input === "string") {
				args.push("-i", this.input);
			} else {
				// For streams, use pipe:0 (stdin)
				args.push("-i", "pipe:0");
			}
		}

		// Add output options
		args.push(...this.outputOptions);

		// Add output
		if (this.output !== undefined) {
			if (typeof this.output === "string") {
				args.push(this.output);
			} else {
				// For streams, use pipe:1 (stdout)
				args.push("pipe:1");
			}
		}

		return args;
	}

	/**
	 * Check if this command uses stdin for input
	 */
	get usesStdin(): boolean {
		return this.input !== undefined && typeof this.input !== "string";
	}

	/**
	 * Check if this command uses stdout for output
	 */
	get usesStdout(): boolean {
		return this.output !== undefined && typeof this.output !== "string";
	}
}
