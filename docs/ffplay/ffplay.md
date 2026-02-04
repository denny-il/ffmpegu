---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: FFplay Documentation
Source: https://ffmpeg.org/ffplay.html
---

# ffplay Documentation

- [1 Synopsis](#1-synopsis)
- [2 Description](#2-description)
- [3 Options](#3-options)
  - [3.1 Stream specifiers](#31-stream-specifiers)
  - [3.2 Generic options](#32-generic-options)
  - [3.3 AVOptions](#33-avoptions)
  - [3.4 Main options](#34-main-options)
  - [3.5 Advanced options](#35-advanced-options)
  - [3.6 While playing](#36-while-playing)

## 1 Synopsis

ffplay [`options`] [`input_url`]

## 2 Description

FFplay is a very simple and portable media player using the FFmpeg libraries and the SDL library. It is mostly used as a testbed for the various FFmpeg APIs.

## 3 Options

All the numerical options, if not specified otherwise, accept a string representing a number as input, which may be followed by one of the SI unit prefixes, for example: ’K’, ’M’, or ’G’.

If ’i’ is appended to the SI unit prefix, the complete prefix will be interpreted as a unit prefix for binary multiples, which are based on powers of 1024 instead of powers of 1000. Appending ’B’ to the SI unit prefix multiplies the value by 8. This allows using, for example: ’KB’, ’MiB’, ’G’ and ’B’ as number suffixes.

Options which do not take arguments are boolean options, and set the corresponding value to true. They can be set to false by prefixing the option name with "no". For example using "-nofoo" will set the boolean option with name "foo" to false.

Options that take arguments support a special syntax where the argument given on the command line is interpreted as a path to the file from which the actual argument value is loaded. To use this feature, add a forward slash ’/’ immediately before the option name (after the leading dash). E.g.

```
ffmpeg -i INPUT -/filter:v filter.script OUTPUT
```

will load a filtergraph description from the file named `filter.script`.

### 3.1 Stream specifiers

Some options are applied per-stream, e.g. bitrate or codec. Stream specifiers are used to precisely specify which stream(s) a given option belongs to.

A stream specifier is a string generally appended to the option name and separated from it by a colon. E.g. `-codec:a:1 ac3` contains the `a:1` stream specifier, which matches the second audio stream. Therefore, it would select the ac3 codec for the second audio stream.

A stream specifier can match several streams, so that the option is applied to all of them. E.g. the stream specifier in `-b:a 128k` matches all audio streams.

An empty stream specifier matches all streams. For example, `-codec copy` or `-codec: copy` would copy all the streams without reencoding.

Possible forms of stream specifiers are:

*   **`stream_index`**: Matches the stream with this index. E.g. `-threads:1 4` would set the thread count for the second stream to 4. If `stream_index` is used as an additional stream specifier, then it selects stream number `stream_index` from the matching streams. Stream numbering is based on the order of the streams as detected by libavformat except when a stream group specifier or program ID is also specified.
*   **`stream_type[:additional_stream_specifier]`**: `stream_type` is one of following: ’v’ or ’V’ for video, ’a’ for audio, ’s’ for subtitle, ’d’ for data, and ’t’ for attachments. ’v’ matches all video streams, ’V’ only matches video streams which are not attached pictures, video thumbnails or cover arts.
*   **`g:group_specifier[:additional_stream_specifier]`**: Matches streams which are in the group with the specifier `group_specifier`.
    *   **`group_index`**: Match the stream with this group index.
    *   **`#group_id` or `i:group_id`**: Match the stream with this group id.
*   **`p:program_id[:additional_stream_specifier]`**: Matches streams which are in the program with the id `program_id`.
*   **`#stream_id` or `i:stream_id`**: Match the stream by stream id (e.g. PID in MPEG-TS container).
*   **`m:key[:value]`**: Matches streams with the metadata tag `key` having the specified value. If `value` is not given, matches streams that contain the given tag with any value.
*   **`disp:dispositions[:additional_stream_specifier]`**: Matches streams with the given disposition(s). `dispositions` is a list of one or more dispositions joined with ’+’.
*   **`u`**: Matches streams with usable configuration; the codec must be defined and essential information such as video dimension or audio sample rate must be present.

### 3.2 Generic options

These options are shared amongst the ff* tools.

*   **`-L, -license`**: Show license.
*   **`-h, -?, -help, --help [arg]`**: Show help. An optional parameter may be specified to print help about a specific item.
    *   **`long`**: Print advanced tool options in addition to the basic tool options.
    *   **`full`**: Print complete list of options.
    *   **`decoder=decoder_name`**: Print detailed information about the named decoder.
    *   **`encoder=encoder_name`**: Print detailed information about the named encoder.
    *   **`demuxer=demuxer_name`**: Print detailed information about the named demuxer.
    *   **`muxer=muxer_name`**: Print detailed information about the named muxer.
    *   **`filter=filter_name`**: Print detailed information about the named filter.
    *   **`bsf=bitstream_filter_name`**: Print detailed information about the named bitstream filter.
    *   **`protocol=protocol_name`**: Print detailed information about the named protocol.
*   **`-version`**: Show version.
*   **`-buildconf`**: Show the build configuration, one option per line.
*   **`-formats`**: Show available formats (including devices).
*   **`-demuxers`**: Show available demuxers.
*   **`-muxers`**: Show available muxers.
*   **`-devices`**: Show available devices.
*   **`-codecs`**: Show all codecs known to libavcodec.
*   **`-decoders`**: Show available decoders.
*   **`-encoders`**: Show all available encoders.
*   **`-bsfs`**: Show available bitstream filters.
*   **`-protocols`**: Show available protocols.
*   **`-filters`**: Show available libavfilter filters.
*   **`-pix_fmts`**: Show available pixel formats.
*   **`-sample_fmts`**: Show available sample formats.
*   **`-layouts`**: Show channel names and standard channel layouts.
*   **`-dispositions`**: Show stream dispositions.
*   **`-colors`**: Show recognized color names.
*   **`-sources device[,opt1=val1[,opt2=val2]...]`**: Show autodetected sources of the input device.
*   **`-sinks device[,opt1=val1[,opt2=val2]...]`**: Show autodetected sinks of the output device.
*   **`-loglevel [flags+]loglevel | -v [flags+]loglevel`**: Set logging level and flags used by the library.
    *   **`repeat`**: Repeated log output should not be compressed.
    *   **`level`**: Add a `[level]` prefix to each message line.
    *   **`time`**: Prefix log lines with time information.
    *   **`datetime`**: Prefix log lines with date and time information.
    *   **Log levels**: `quiet (-8)`, `panic (0)`, `fatal (8)`, `error (16)`, `warning (24)`, `info (32)`, `verbose (40)`, `debug (48)`, `trace (56)`.
*   **`-report`**: Dump full command line and log output to a file named `program-YYYYMMDD-HHMMSS.log`.
*   **`-hide_banner`**: Suppress printing banner.
*   **`-cpuflags flags (global)`**: Allows setting and clearing cpu flags.
*   **`-cpucount count (global)`**: Override detection of CPU count.
*   **`-max_alloc bytes`**: Set the maximum size limit for allocating a block on the heap.

### 3.3 AVOptions

These options are provided directly by the libavformat, libavdevice and libavcodec libraries.

*   **`generic`**: These options can be set for any container, codec or device.
*   **`private`**: These options are specific to the given container, device or codec.

Example: `ffmpeg -i input.flac -id3v2_version 3 out.mp3`

### 3.4 Main options

*   **`-x width`**: Force displayed width.
*   **`-y height`**: Force displayed height.
*   **`-fs`**: Start in fullscreen mode.
*   **`-an`**: Disable audio.
*   **`-vn`**: Disable video.
*   **`-sn`**: Disable subtitles.
*   **`-ss pos`**: Seek to `pos`. `pos` must be a time duration specification.
*   **`-t duration`**: Play `duration` seconds of audio/video.
*   **`-bytes`**: Seek by bytes.
*   **`-seek_interval`**: Set custom interval, in seconds, for seeking using left/right keys. Default is 10 seconds.
*   **`-nodisp`**: Disable graphical display.
*   **`-noborder`**: Borderless window.
*   **`-alwaysontop`**: Window always on top.
*   **`-volume`**: Set the startup volume (0-100).
*   **`-f fmt`**: Force format.
*   **`-window_title title`**: Set window title.
*   **`-left title`**: Set the x position for the left of the window.
*   **`-top title`**: Set the y position for the top of the window.
*   **`-loop number`**: Loops movie playback <number> times. 0 means forever.
*   **`-showmode mode`**: Set the show mode to use:
    *   `0, video`: show video
    *   `1, waves`: show audio waves
    *   `2, rdft`: show audio frequency band using RDFT
*   **`-vf filtergraph`**: Create the filtergraph specified by `filtergraph` and use it to filter the video stream.
*   **`-af filtergraph`**: `filtergraph` is a description of the filtergraph to apply to the input audio.
*   **`-i input_url`**: Read `input_url`.

### 3.5 Advanced options

*   **`-stats`**: Print several playback statistics.
*   **`-fast`**: Non-spec-compliant optimizations.
*   **`-genpts`**: Generate pts.
*   **`-sync type`**: Set the master clock to audio (`audio`), video (`video`) or external (`ext`). Default is audio.
*   **`-ast audio_stream_specifier`**: Select the desired audio stream using the given stream specifier.
*   **`-vst video_stream_specifier`**: Select the desired video stream using the given stream specifier.
*   **`-sst subtitle_stream_specifier`**: Select the desired subtitle stream using the given stream specifier.
*   **`-autoexit`**: Exit when video is done playing.
*   **`-exitonkeydown`**: Exit if any key is pressed.
*   **`-exitonmousedown`**: Exit if any mouse button is pressed.
*   **`-codec:media_specifier codec_name`**: Force a specific decoder implementation.
*   **`-acodec codec_name`**: Force a specific audio decoder.
*   **`-vcodec codec_name`**: Force a specific video decoder.
*   **`-scodec codec_name`**: Force a specific subtitle decoder.
*   **`-autorotate`**: Automatically rotate the video according to file metadata.
*   **`-framedrop`**: Drop video frames if video is out of sync.
*   **`-infbuf`**: Do not limit the input buffer size.
*   **`-filter_threads nb_threads`**: Defines how many threads are used to process a filter pipeline.
*   **`-enable_vulkan`**: Use vulkan renderer rather than SDL builtin renderer.
*   **`-vulkan_params`**: Vulkan configuration using a list of key=value pairs.
*   **`-hwaccel`**: Use HW accelerated decoding.

### 3.6 While playing

*   **`q, ESC`**: Quit.
*   **`f`**: Toggle full screen.
*   **`p, SPC`**: Pause.
*   **`m`**: Toggle mute.
*   **`9, 0`**: Decrease and increase volume respectively.
*   **`/, *`**: Decrease and increase volume respectively.
*   **`a`**: Cycle audio channel in the current program.
*   **`v`**: Cycle video channel.
*   **`t`**: Cycle subtitle channel in the current program.
*   **`c`**: Cycle program.
*   **`w`**: Cycle video filters or show modes.
*   **`s`**: Step to the next frame.
*   **`left/right`**: Seek backward/forward 10 seconds.
*   **`down/up`**: Seek backward/forward 1 minute.
*   **`page down/page up`**: Seek to the previous/next chapter, or backward/forward 10 minutes.
*   **`right mouse click`**: Seek to percentage in file corresponding to fraction of width.
*   **`left mouse double-click`**: Toggle full screen.