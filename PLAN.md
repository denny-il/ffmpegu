# FFmpegu - FFmpeg Wrapper for JS Runtimes

## Project Overview

A simple, direct JavaScript wrapper for FFmpeg that works across all server-side JS runtimes (Node.js, Bun, Deno). Philosophy: **No magic, no validation** - just a clean interface to pass options directly to FFmpeg.

## Target Audience
- **Developers** building server-side applications that need video/audio processing
- Users who want full control over FFmpeg without abstractions or "shortcuts"

## Core Requirements

### Runtime Support
- ✅ Node.js
- ✅ Bun  
- ✅ Deno
- ❌ Browser (not in scope for v1)

### FFmpeg Integration
- **Local Installation Required**: Users must install FFmpeg/FFprobe separately
- **No Bundling**: This is purely a JS wrapper, no binaries included
- **Direct Passthrough**: Options passed directly to FFmpeg without parsing/validation

## Architecture

### Two-Component Design

#### 1. Runner (Execution Engine)
- **Immutable**: Binary paths set at construction time
- **Configurable**: Accept custom FFmpeg/FFprobe binary paths
- **Default Singleton**: Provide ready-to-use instance with system PATH

#### 2. Command (Configuration)
- **Immutable**: Constructed once with all options
- **Object-based**: Simple constructor parameter object (no fluent API)
- **Direct Mapping**: Options map directly to FFmpeg arguments

### API Design

```javascript
// Import default runner (singleton)
import { defaultRunner, FFmpegRunner, FFmpegCommand } from 'ffmpegu';

// Custom runner with specific binary paths
const customRunner = new FFmpegRunner({
  ffmpegPath: '/usr/local/bin/ffmpeg',
  ffprobePath: '/usr/local/bin/ffprobe'
});

// Command construction
const command = new FFmpegCommand({
  input: 'video.mp4',
  inputOptions: ['-ss', '00:01:00'],
  output: 'output.mp4', 
  outputOptions: ['-t', '10', '-vcodec', 'libx264']
});

// Execution
await defaultRunner.run(command);
```

## Core Features (v1)

### ✅ Must Have
1. **Direct Option Passing**: `inputOptions: string[]`, `outputOptions: string[]`
2. **Streaming Support**: Input/output stream handling
3. **Progress Tracking**: Parse FFmpeg progress output
4. **Error Handling**: Proper error catching and reporting
5. **Multi-Runtime Support**: Works on Node.js, Bun, Deno

### ❌ Explicitly NOT in v1
- Option validation
- FFmpeg command shortcuts/helpers
- Built-in presets
- Complex abstraction layers
- Browser support

## Implementation Details

### Runner Class
```javascript
class FFmpegRunner {
  constructor(options?: {
    ffmpegPath?: string;
    ffprobePath?: string;
  })
  
  async run(command: FFmpegCommand): Promise<ExecutionResult>
  async probe(input: string): Promise<ProbeResult>
  async validate(): Promise<boolean>
}
```

### Command Class
```javascript
class FFmpegCommand {
  constructor(options: {
    input?: string;
    inputOptions?: string[];
    output?: string;
    outputOptions?: string[];
  })
}
```

### Default Runner
- Singleton instance using system PATH
- Auto-detection of FFmpeg/FFprobe binaries
- Fallback error handling when binaries not found

## Technical Considerations

### Streaming Support
- Support for stdin/stdout streams
- Pipe handling for different runtimes
- Stream error propagation

### Progress Tracking
- Parse FFmpeg stderr progress output
- Emit progress events with time/percentage info
- Optional progress callback support

### Error Handling
- FFmpeg exit code handling
- Binary not found errors
- Invalid file path errors
- Process crash recovery

### Cross-Runtime Compatibility
- Abstract child process creation
- Handle runtime-specific stream differences
- Unified error handling across runtimes

## Development Phases

### Phase 1: Core Foundation
- [ ] Basic Runner and Command classes
- [ ] Node.js implementation
- [ ] Simple input/output file handling
- [ ] Basic error handling

### Phase 2: Streaming & Progress
- [ ] Stream input/output support
- [ ] Progress tracking implementation
- [ ] Enhanced error handling

### Phase 3: Multi-Runtime
- [ ] Bun runtime support
- [ ] Deno runtime support
- [ ] Runtime detection and abstraction

### Phase 4: Polish & Testing
- [ ] Comprehensive test suite (Vitest)
- [ ] TypeScript definitions
- [ ] Documentation and examples
- [ ] Performance optimization

## Success Criteria

1. **Simple API**: Developers can use it without reading extensive docs
2. **Reliable**: Proper error handling and edge case coverage
3. **Performant**: Minimal overhead over direct FFmpeg usage
4. **Portable**: Works consistently across Node.js, Bun, and Deno
5. **Maintainable**: Clean, testable codebase

## Non-Goals (for v1)

- FFmpeg installation/management
- Command validation or sanitization
- Built-in video processing presets
- Browser/WASM support
- Complex streaming pipelines
- GUI or visual tools

## Testing Strategy

### Framework Choice
- **Vitest** for all runtimes (Node.js, Bun, Deno)
- Single test setup, runs consistently across platforms
- Focus on cross-runtime compatibility validation

### Test Structure
```
tests/
├── unit/            # Unit tests for individual components
├── integration/     # Integration tests with actual FFmpeg
└── fixtures/        # Test media files and data
```

### Cross-Runtime Validation
- CI pipeline runs same Vitest suite on all three runtimes
- Focus on behavior consistency across platforms
- Integration tests with actual FFmpeg commands for real-world validation
