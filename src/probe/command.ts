export class FFmpeguProbeCommand {
  readonly input: string

  constructor(input: string) {
    this.input = input
  }

  static fromFile(filePath: string) {
    return new FFmpeguProbeCommand(filePath)
  }

  async compile(): Promise<string[]> {
    return [
      "-hide_banner",
      "-of",
      "json",
      "-show_format",
      "-show_streams",
      "-i",
      this.input
    ]
  }
}
