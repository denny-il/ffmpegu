# ffmpegu

Typed, composable FFmpeg command builder and runner for Javascript runtimes.

## Highlights

- Fluent, type-safe construction of FFmpeg commands via `ffmpegu.command()`.
- First-class helpers for inputs/outputs, stream mapping, and filters.
- Built-in runners for FFmpeg and FFprobe with structured results.

## Install

```bash
pnpm add ffmpegu
```

## Quick start

See the quick start in the docs: [docs/README.md](docs/README.md)

## Documentation

- Start here: [docs/README.md](docs/README.md)
- API overview: [docs/ffmpegu/overview.md](docs/ffmpegu/overview.md)
- Options: [docs/ffmpegu/options.md](docs/ffmpegu/options.md)
- Inputs & outputs: [docs/ffmpegu/inputs-outputs.md](docs/ffmpegu/inputs-outputs.md)
- Filters: [docs/ffmpegu/filters.md](docs/ffmpegu/filters.md)
- Runners: [docs/ffmpegu/runners.md](docs/ffmpegu/runners.md)
- FFprobe: [docs/ffmpegu/ffprobe.md](docs/ffmpegu/ffprobe.md)

## Requirements

- Node.js/Bun/Deno
- OS: macOS or Linux
- FFmpeg and FFprobe installed and available on your PATH (or provide the path to the binary when creating a runner)
