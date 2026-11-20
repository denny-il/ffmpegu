# Changelog

Notable changes to ffmpegu, newest first. Versions follow [semantic versioning](https://semver.org); while the package is `0.x`, a minor release can contain breaking changes.

Releases before 0.6.0 are described in the [GitHub releases](https://github.com/denny-il/ffmpegu/releases).

## 0.6.0 (unreleased)

The public API now has one name per concept. Builders, helpers, and their types live in three namespaces, `Options`, `Filter`, and `Time`, and commands run through the `FFmpeg` and `FFprobe` services. This release is breaking and ships no compatibility aliases.

### Migrating from 0.5

| 0.5 | 0.6 |
| --- | --- |
| `Options.create(...)`, `options.custom(...)`, `Options.merge(...)`, `Options.concat(...)` | `Options.make(...)` |
| `options.crf(23)`, `options.hls({...})`, … | `Options.crf(23)`, `Options.hls({...})`, … |
| `filters.scale(...)`, `filters.chain(...)`, `filters.graph(...)`, `filters.label(...)` | `Filter.scale(...)`, `Filter.chain(...)`, `Filter.graph(...)`, `Filter.label(...)` |
| `filters.custom(name, options, inputs, outputs)` | `Filter.make(name, options, { inputs, outputs })` |
| `filters.builder().chain(a).chain(b).build()` | `Filter.graph(Filter.chain(a), Filter.chain(b))` |
| `time.seconds(d)`, `time.timestamp(d)` | `Time.seconds(d)`, `Time.timestamp(d)` |
| `run(command)`, `stream(command)` | `FFmpeg.run(command)`, `FFmpeg.stream(command)` |
| `probe(input)`, `probeWith(input, options)`, `probeWith(input, options, schema)` | `FFprobe.probe(input)`, `FFprobe.probeWith(input, options)`, `FFprobe.probeWith(input, options, schema)` |
| `Command.create({...})` | `Command.make({...})` |
| `Command.toArgs(command)` | `command.toArgs()` |
| `FFmpeguCommand`, `FFmpeguInput`, `FFmpeguOutput` | `Command`, `Input`, `Output` |
| `FFmpeguOptions` (the bundle class and type) | `Options.Options` |
| `FFmpeguSimpleFilter`, `FFmpeguFilterChain`, `FFmpeguFilterGraph`, `FFmpeguFilterLabelRef` (as types) | `Filter.Filter`, `Filter.Chain`, `Filter.Graph`, `Filter.Label` |
| `FFmpeguSimpleFilter.create(name, options, inputs, outputs)`, `new FFmpeguSimpleFilter(name, options, inputs, outputs)` | `Filter.make(name, options, { inputs, outputs })` |
| `FFmpeguFilterChain.create(...)`, `FFmpeguFilterGraph.create(...)`, `FFmpeguFilterLabelRef.create(...)` | `Filter.chain(...)`, `Filter.graph(...)`, `Filter.label(...)` |
| `FFmpeguStreamReference`, `FFmpeguStreamTrackReference` | `StreamReference`, `StreamTrackReference` |
| `FFmpeguCommandOptions`, `FFmpeguAnyInput`, `FFmpeguInputSource`, `FFmpeguOutputDestination` | `CommandOptions`, `AnyInput`, `InputSource`, `OutputDestination` |
| `FFmpegOptions`, `FFprobeOptions` (layer settings) | `FFmpegConfig`, `FFprobeConfig` |
| `options.profileVideo(...)`, `options.profileAudio(...)` | `Options.videoProfile(...)`, `Options.audioProfile(...)` |
| `import ffmpegu from "ffmpegu"`, `import { ffmpegu } from "ffmpegu"` | `Command`, `Input`, `Output`, `Options`, `Filter`, `Time`; the `ffmpegu` object is gone, as a default and as a named export |

A typical command before and after:

```ts
// 0.5
import { Command, Input, Options, Output, filters, options, run } from "ffmpegu"

const input = Input.fromFile("input.mov")
const command = Command.make({
  global: options.overwrite(),
  inputs: [input],
  outputs: [
    Output.toFile(
      "output.mp4",
      Options.create(
        { map: input.video },
        options.videoFilter(filters.chain(filters.scale({ w: -2, h: 720 }))),
        options.videoCodec("libx264"),
        options.crf(23)
      )
    )
  ]
})
const program = run(command)
```

```ts
// 0.6
import { Command, FFmpeg, Filter, Input, Options, Output } from "ffmpegu"

const input = Input.fromFile("input.mov")
const command = Command.make({
  global: Options.overwrite(),
  inputs: [input],
  outputs: [
    Output.toFile(
      "output.mp4",
      { map: input.video },
      Options.videoFilter(Filter.scale({ w: -2, h: 720 })),
      Options.videoCodec("libx264"),
      { crf: 23 }
    )
  ]
})
const program = FFmpeg.run(command)
```

### Breaking changes

- **Namespaces.** `Options`, `Filter`, and `Time` replace the `options`, `filters`, and `time` objects and the separate `Options` class. Each holds its constructor, helpers, and types.
- **One constructor per builder.** `Options.make` replaces `create`, `custom`, `merge`, and `concat`; bundles nest, so one call builds, extends, and concatenates. `Filter.make` replaces `filters.custom` and takes labels as `{ inputs, outputs }`, like the typed helpers.
- **Runners on the services.** `FFmpeg.run`, `FFmpeg.stream`, `FFprobe.probe`, and `FFprobe.probeWith` replace the bare `run`, `stream`, `probe`, and `probeWith` exports. The service interfaces are unchanged.
- **Removed.** The `FFmpegu*` class and type names, the `ffmpegu` object (default and named export), `Command.create`, the static `Command.toArgs`, the static `create` factories of the filter classes, and the filter builder (`filters.builder()`, `FFmpeguFilterBuilder`).
- **Renamed.** `FFmpegOptions` and `FFprobeOptions` are `FFmpegConfig` and `FFprobeConfig`; `profileVideo` and `profileAudio` are `videoProfile` and `audioProfile`.
- **Bundle entries.** A stream reference, label, or filter is an option value, not an entry of its own: `Options.make(input.video)` is now a type error. Write `{ map: input.video }` or `Options.map(input.video)`.
- **Nested bundles are flattened.** `Options.make(a, b).args` holds copies of the entries of `a` and `b`, not the bundles themselves. Rendering is unchanged. A subclass of the bundle is not flattened: it stays nested and renders through its own `getArgs`.
- **Filter options.** `Options.videoFilter` and `Options.audioFilter` take a filter, a chain, or a raw string, optionally followed by more filters. They no longer accept a boolean or number, so `Options.videoFilter(enabled && chain)` does not compile; pass `undefined` to the output instead: `Output.toFile(path, enabled ? Options.videoFilter(chain) : undefined)`. As a callback, wrap them: `filters.map((filter) => Options.videoFilter(filter))`.
- **Stream types.** `streamType` on a stream reference is `"v"`, `"a"`, `"s"`, or `"d"` instead of `"VIDEO"`, `"AUDIO"`, `"SUBTITLE"`, or `"DATA"`.

### Added

- **Option forms wherever options are taken.** `Input.fromFile`, `Input.fromStream`, `Output.toFile`, `Output.toSink`, and `Output.toStream` accept any number of bundles, records, tuples, and strings, and skip `undefined`. `global`, `withGlobal`, and `FFprobe.probeWith` accept one form. `Options.make` is only needed to name a bundle or to pass several forms where one is taken.
- **Labels without wrappers.** A filter's `inputs` accept names and stream references, and its `outputs` accept names. `Filter.label` is only needed for a label that is also passed to `-map`.
- **Shorter graphs and chains.** `Filter.graph` accepts filters as chains of one, and `Options.videoFilter` and `Options.audioFilter` accept several filters and render them as a chain.
- **Importable types.** The helper types can now be imported from the package: `Options.Arg`, `Options.VideoCodec`, `Options.AudioCodec`, `Options.Format`, `Options.TimeValue`, `Options.HlsOptions`, `Options.DashOptions`, `Filter.Labels`, `Filter.ScaleOptions` and the other helper option types, `Time.TimeObject`, and `Time.DurationValue`. In 0.5 they appeared in exported signatures but could not be named.
- **`Argument`.** The base class of bundles, filters, stream references, and time adapters is exported, for values of your own that render themselves when the command compiles.
- **`Command.make()`** works without an argument, as a starting point for `withInput` and `withOutput`.

### Fixed

- A record entry set to `undefined`, such as `{ crf: undefined }`, is omitted. It used to render `-crf undefined`.
- An argument that renders several filters, passed to `Options.videoFilter` or `Options.audioFilter`, is joined into one chain. It used to spill into separate argv tokens, which FFmpeg read as output files. A bundle passed there must therefore hold filters only; give other options, such as `Options.noAudio()`, to the output.
