# FFmpegu

A simple, direct JavaScript wrapper for FFmpeg that works across all server-side JS runtimes (Node.js, Bun, Deno).

## Philosophy

**No magic, no validation** - just a clean interface to pass options directly to FFmpeg. This library provides full control over FFmpeg without abstractions or shortcuts.

## Features

- ✅ **Cross-Runtime Support**: Works on Node.js, Bun, and Deno
- ✅ **Stream Support**: Handle input/output streams seamlessly
- ✅ **Direct Option Passing**: Options passed directly to FFmpeg without parsing/validation
- ✅ **Immutable Commands**: Command objects are immutable once created
- ✅ **TypeScript Support**: Full TypeScript definitions included
- ✅ **Progress Tracking**: (TODO - coming soon)

## Requirements

- **FFmpeg/FFprobe**: Must be installed separately on your system
- **Node.js**: >= 20.0.0
- **Bun**: >= 1.2.16  
- **Deno**: >= 2.3.0

## Installation

```bash
npm install @ffmpegujs/ffmpegu
# or
pnpm add @ffmpegujs/ffmpegu
# or
yarn add @ffmpegujs/ffmpegu
```

## Quick Start

```typescript
import { defaultRunner, FFmpegCommand } from '@ffmpegujs/ffmpegu';

// Create a command
const command = new FFmpegCommand({
  input: 'input.mp4',
  output: 'output.mp4',
  outputOptions: ['-vcodec', 'libx264', '-acodec', 'aac']
});

// Execute it
const result = await defaultRunner.run(command);
if (result.success) {
  console.log('Success!');
} else {
  console.error('Failed:', result.stderr);
}
```

## API Reference

### FFmpegRunner

The main execution engine for FFmpeg commands.

```typescript
class FFmpegRunner {
  constructor(options?: {
    ffmpegPath?: string;    // Default: 'ffmpeg'
    ffprobePath?: string;   // Default: 'ffprobe'
  })
  
  async run(command: FFmpegCommand): Promise<ExecutionResult>
  async probe(input: string): Promise<ProbeResult>
  async validate(): Promise<boolean>
}
```

### FFmpegCommand

Immutable command configuration.

```typescript
class FFmpegCommand {
  constructor(options?: {
    input?: string | Readable;
    inputOptions?: string[];
    output?: string | Writable;
    outputOptions?: string[];
  })
  
  toArgs(): string[]
  get usesStdin(): boolean
  get usesStdout(): boolean
}
```

### Default Runner

A pre-configured runner using system PATH:

```typescript
import { defaultRunner } from '@ffmpegujs/ffmpegu';
// Ready to use immediately
```

## Examples

See [EXAMPLES.md](./EXAMPLES.md) for comprehensive usage examples.

## Architecture

### Two-Component Design

1. **Runner (Execution Engine)**
   - Immutable: Binary paths set at construction time
   - Configurable: Accept custom FFmpeg/FFprobe binary paths
   - Default Singleton: Provide ready-to-use instance with system PATH

2. **Command (Configuration)**
   - Immutable: Constructed once with all options
   - Object-based: Simple constructor parameter object (no fluent API)
   - Direct Mapping: Options map directly to FFmpeg arguments

## Contributing

This project is in active development. See [PLAN.md](./PLAN.md) for the development roadmap.

## License

MIT


## Assets
Test assets are royalty-free content from [https://pixabay.com/service/license-summary/](https://pixabay.com)
