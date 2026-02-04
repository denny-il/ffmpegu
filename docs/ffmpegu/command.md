# Commands

Commands represent an FFmpeg invocation.

## API

- `ffmpegu.command({ global?, inputs?, outputs? })`

`inputs` and `outputs` are arrays of `FFmpeguInput`/`FFmpeguOutput`. `global` is an `FFmpeguOptions` bundle.

## Example

```ts
const command = ffmpegu.command({
  global: ffmpegu.options.custom("-y"),
  inputs: [ffmpegu.input.fromFile("./input.mp4")],
  outputs: [
    ffmpegu.output.toFile(
      "./output.mp4",
      ffmpegu.options.concat(
        ffmpegu.options.videoCodec("libx264"),
        ffmpegu.options.crf(23)
      )
    )
  ]
})
```

## Notes

- Commands are single-use. Create a new command for each run.
