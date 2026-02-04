---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: FFmpeg Documentation
Source: https://ffmpeg.org/ffmpeg.html
---

# ffmpeg Documentation

- [1 Synopsis](#1-synopsis)
- [2 Description](#2-description)
- [3 Detailed description](#3-detailed-description)
  - [3.1 Streamcopy](#31-streamcopy)
  - [3.2 Transcoding](#32-transcoding)
  - [3.3 Filtering](#33-filtering)
  - [3.4 Loopback decoders](#34-loopback-decoders)
- [4 Stream selection](#4-stream-selection)
  - [4.1 Description](#41-description)
  - [4.2 Examples](#42-examples)
- [5 Options](#5-options)
  - [5.1 Stream specifiers](#51-stream-specifiers)
  - [5.2 Generic options](#52-generic-options)
  - [5.3 AVOptions](#53-avoptions)
  - [5.4 Main options](#54-main-options)
  - [5.5 Video Options](#55-video-options)
  - [5.6 Advanced Video options](#56-advanced-video-options)
  - [5.7 Audio Options](#57-audio-options)
  - [5.8 Advanced Audio options](#58-advanced-audio-options)
  - [5.9 Subtitle options](#59-subtitle-options)
  - [5.10 Advanced Subtitle options](#510-advanced-subtitle-options)
  - [5.11 Advanced options](#511-advanced-options)
  - [5.12 Preset files](#512-preset-files)
  - [5.13 vstats file format](#513-vstats-file-format)
- [6 Examples](#6-examples)

## 1 Synopsis

`ffmpeg [global_options] {[input_file_options] -i input_url} ... {[output_file_options] output_url} ...`

## 2 Description

`ffmpeg` is a universal media converter. It can read a wide variety of inputs - including live grabbing/recording devices - filter, and transcode them into a plethora of output formats.

`ffmpeg` reads from an arbitrary number of inputs (which can be regular files, pipes, network streams, grabbing devices, etc.), specified by the `-i` option, and writes to an arbitrary number of outputs, which are specified by a plain output url. Anything found on the command line which cannot be interpreted as an option is considered to be an output url.

Each input or output can, in principle, contain any number of elementary streams of different types (video/audio/subtitle/attachment/data), though the allowed stream counts and/or types may be limited by the container format. Selecting which streams from which inputs will go into which output is either done automatically or with the `-map` option.

To refer to inputs/outputs in options, you must use their indices (0-based). E.g. the first input is `0`, the second is `1`, etc. Similarly, streams within an input/output are referred to by their indices. E.g. `2:3` refers to the fourth stream in the third input or output.

As a general rule, options are applied to the next specified file. Therefore, order is important, and you can have the same option on the command line multiple times. Each occurrence is then applied to the next input or output file. Exceptions from this rule are the global options (e.g. verbosity level), which should be specified first.

Do not mix input and output files – first specify all input files, then all output files. Also do not mix options which belong to different files. All options apply ONLY to the next input or output file and are reset between files.

### Basic Examples

*   **Convert an input media file to a different format:**
    ```bash
    ffmpeg -i input.avi output.mp4
    ```

*   **Set the video bitrate of the output file to 64 kbit/s:**
    ```bash
    ffmpeg -i input.avi -b:v 64k -bufsize 64k output.mp4
    ```

*   **Force the frame rate of the output file to 24 fps:**
    ```bash
    ffmpeg -i input.avi -r 24 output.mp4
    ```

*   **Force the frame rate of the input file to 1 fps and output to 24 fps:**
    ```bash
    ffmpeg -r 1 -i input.m2v -r 24 output.mp4
    ```

## 3 Detailed description

`ffmpeg` builds a transcoding pipeline out of the components listed below. The program’s operation consists of input data chunks flowing from sources down pipes towards sinks, transformed by components along the way.

### Components

*   **Demuxers**: Read an input source to extract global properties (metadata, chapters) and elementary streams.
    ```text
    ┌──────────┬───────────────────────┐
    │ demuxer  │                       │ packets for stream 0
    ╞══════════╡ elementary stream 0   ├───────────────────────►
    │          │                       │
    │  global  ├───────────────────────┤
    │properties│                       │ packets for stream 1
    │   and    │ elementary stream 1   ├───────────────────────►
    │ metadata │                       │
    │          ├───────────────────────┤
    │          │                       │
    │          │     ...........       │
    │          │                       │
    │          ├───────────────────────┤
    │          │                       │ packets for stream N
    │          │ elementary stream N   ├───────────────────────►
    │          │                       │
    └──────────┴───────────────────────┘
         ▲
         │ read from file, network stream, etc.
    ```

*   **Decoders**: Receive encoded packets and decode them into raw frames (pixels for video, PCM for audio).
    ```text
              ┌─────────┐
     packets  │         │ raw frames
    ─────────►│ decoder ├────────────►
              │         │
              └─────────┘
    ```

*   **Filtergraphs**: Process raw frames.
    *   **Simple filtergraphs**: One input and one output of the same type.
    ```text
                 ┌────────────────────────┐
                 │  simple filtergraph    │
     frames from ╞════════════════════════╡ frames for
     a decoder   │  ┌───────┐  ┌───────┐  │ an encoder
    ────────────►├─►│ yadif ├─►│ scale ├─►├────────────►
                 │  └───────┘  └───────┘  │
                 └────────────────────────┘
    ```
    *   **Complex filtergraphs**: Standalone with multiple inputs/outputs.

*   **Encoders**: Receive raw frames and encode them into packets.
    ```text
                 ┌─────────┐
     raw frames  │         │ packets
    ────────────►│ encoder ├─────────►
                 │         │
                 └─────────┘
    ```

*   **Muxers**: Receive encoded packets, interleave them, and write to the output.
    ```text
                           ┌──────────────────────┬───────────┐
     packets for stream 0  │                      │   muxer   │
    ──────────────────────►│  elementary stream 0 ╞═══════════╡
                           │                      │           │
                           ├──────────────────────┤  global   │
     packets for stream 1  │                      │properties │
    ──────────────────────►│  elementary stream 1 │   and     │
                           │                      │ metadata  │
                           ├──────────────────────┤           │
                           │                      │           │
                           │     ...........      │           │
                           │                      │           │
                           ├──────────────────────┤           │
     packets for stream N  │                      │           │
    ──────────────────────►│  elementary stream N │           │
                           │                      │           │
                           └──────────────────────┴─────┬─────┘
                                                        │
                                         write to file, │
                                                        ▼
    ```

### 3.1 Streamcopy

Streamcopy copies packets without decoding, filtering, or encoding. It is fast and lossless but does not allow filtering.

**Example:**
```bash
ffmpeg -i INPUT.mkv -map 0:1 -c copy OUTPUT.mp4
```

### 3.2 Transcoding

Transcoding decodes a stream and encodes it again. It is used for filtering or changing codecs.

**Example:**
```bash
ffmpeg -i INPUT.mkv -map 0:v -map 0:a -c:v libx264 -c:a copy OUTPUT.mp4
```

### 3.3 Filtering

#### 3.3.1 Simple filtergraphs
Configured with per-stream `-filter` option (aliases `-vf` and `-af`).

#### 3.3.2 Complex filtergraphs
Configured with the global `-filter_complex` option. Used for tasks like overlaying video or mixing audio.

### 3.4 Loopback decoders

Loopback decoders decode the output from an encoder to feed it back into a complex filtergraph using the `-dec` directive.

**Example:**
```bash
ffmpeg -i INPUT                                        \
  -map 0:v:0 -c:v libx264 -crf 45 -f null -            \
  -threads 3 -dec 0:0                                  \
  -filter_complex '[0:v][dec:0]hstack[stack]'          \
  -map '[stack]' -c:v ffv1 OUTPUT
```

## 4 Stream selection

### 4.1 Description

#### 4.1.1 Automatic stream selection
In the absence of `-map`, `ffmpeg` selects:
*   **Video**: Highest resolution.
*   **Audio**: Most channels.
*   **Subtitles**: First stream matching the output format's default encoder type (text or image).

#### 4.1.2 Manual stream selection
When `-map` is used, only user-mapped streams are included.

#### 4.1.3 Complex filtergraphs
Unlabeled outputs are added to the first output file. Labeled pads must be mapped exactly once.

#### 4.1.4 Stream handling
Codec options (`-codec`) are applied after stream selection.

### 4.2 Examples

**Input assumptions:**
*   `A.avi`: stream 0 (v), stream 1 (a)
*   `B.mp4`: stream 0 (v), stream 1 (a), stream 2 (s-text), stream 3 (a-5.1), stream 4 (s-text)
*   `C.mkv`: stream 0 (v), stream 1 (a), stream 2 (s-image)

**Automatic Selection:**
```bash
ffmpeg -i A.avi -i B.mp4 out1.mkv out2.wav -map 1:a -c:a copy out3.mov
```
*   `out1.mkv`: B.mp4:0 (video), B.mp4:3 (audio), B.mp4:2 (subtitle).
*   `out2.wav`: B.mp4:3 (audio).
*   `out3.mov`: All audio from B.mp4 (manual map).

## 5 Options

### 5.1 Stream specifiers

Applied to specific streams using a colon.
*   `stream_index`: Matches index (e.g., `-threads:1 4`).
*   `stream_type`: `v` (video), `a` (audio), `s` (subtitle), `d` (data), `t` (attachments).
*   `p:program_id`: Matches streams in a program.
*   `#stream_id`: Matches by ID (e.g., PID in MPEG-TS).
*   `m:key[:value]`: Matches metadata tags.
*   `disp:dispositions`: Matches by disposition (e.g., `default`).

### 5.2 Generic options

*   `-h, -help [arg]`: Show help. `arg` can be `long`, `full`, `decoder=name`, etc.
*   `-version`: Show version.
*   `-formats`: Show available formats.
*   `-codecs`: Show all codecs.
*   `-decoders / -encoders`: Show available decoders/encoders.
*   `-filters`: Show available filters.
*   `-loglevel [flags+]loglevel`: Set logging level (quiet, fatal, error, warning, info, verbose, debug, trace).
*   `-report`: Dump log to a file.
*   `-hide_banner`: Suppress copyright/build info.

### 5.3 AVOptions

Generic and private options for containers, codecs, or devices.
Example: `ffmpeg -i input.flac -id3v2_version 3 out.mp3`

### 5.4 Main options

*   `-f fmt`: Force format.
*   `-i url`: Input file URL.
*   `-y / -n`: Overwrite / Do not overwrite output.
*   `-c[:spec] codec`: Select encoder/decoder.
*   `-t duration`: Limit duration.
*   `-ss position`: Seek to position.
*   `-metadata key=value`: Set metadata.
*   `-disposition[:spec] value`: Set disposition flags (e.g., `default`, `attached_pic`).

### 5.5 Video Options

*   `-vframes number`: Set number of video frames (alias for `-frames:v`).
*   `-r fps`: Set frame rate.
*   `-s size`: Set frame size (wxh).
*   `-aspect aspect`: Set aspect ratio (4:3, 16:9).
*   `-vn`: Disable video.
*   `-vcodec codec`: Set video codec.

### 5.6 Advanced Video options

*   `-pix_fmt format`: Set pixel format.
*   `-sws_flags flags`: Set scaler flags.
*   `-force_key_frames expr:expr`: Force keyframes based on expressions or timestamps.
*   `-hwaccel method`: Use hardware acceleration (vdpau, dxva2, vaapi, qsv, etc.).

### 5.7 Audio Options

*   `-aframes number`: Set number of audio frames.
*   `-ar freq`: Set sampling frequency.
*   `-ac channels`: Set number of audio channels.
*   `-an`: Disable audio.
*   `-acodec codec`: Set audio codec.

### 5.8 Advanced Audio options

*   `-channel_layout layout`: Set audio channel layout.
*   `-guess_layout_max channels`: Limit layout guessing.

### 5.9 Subtitle options

*   `-scodec codec`: Set subtitle codec.
*   `-sn`: Disable subtitles.

### 5.10 Advanced Subtitle options

*   `-fix_sub_duration`: Adjust subtitle durations to avoid overlap.
*   `-canvas_size size`: Set subtitle rendering canvas size.

### 5.11 Advanced options

*   `-map [-]input_file_id[:spec]`: Map input streams to output.
*   `-filter_complex graph`: Define a complex filtergraph.
*   `-copyts`: Copy timestamps without sanitizing.
*   `-shortest`: Finish encoding when the shortest stream ends.
*   `-bsf[:spec] filters`: Apply bitstream filters (e.g., `h264_mp4toannexb`).

### 5.12 Preset files

*   **ffpreset**: Specified with `vpre`, `apre`, `spre`, `fpre`.
*   **avpreset**: Specified with `pre`.

### 5.13 vstats file format

Generated via `-vstats` or `-vstats_file`.
*   **Version 2 Format:**
    `out= OUT_FILE_INDEX st= OUT_FILE_STREAM_INDEX frame= FRAME_NUMBER q= FRAME_QUALITYf PSNR= PSNR f_size= FRAME_SIZE s_size= STREAM_SIZEkB time= TIMESTAMP br= BITRATEkbits/s avg_br= AVERAGE_BITRATEkbits/s`

## 6 Examples

### 6.1 Video and Audio grabbing

**Using OSS:**
```bash
ffmpeg -f oss -i /dev/dsp -f video4linux2 -i /dev/video0 /tmp/out.mpg
```

**Using ALSA:**
```bash
ffmpeg -f alsa -ac 1 -i hw:1 -f video4linux2 -i /dev/video0 /tmp/out.mpg
```

### 6.2 X11 grabbing

**Grab display 0.0:**
```bash
ffmpeg -f x11grab -video_size cif -framerate 25 -i :0.0 /tmp/out.mpg
```

### 6.3 Video and Audio file format conversion

*   **YUV sequence to MPEG:**
    ```bash
    ffmpeg -i /tmp/test%d.Y /tmp/out.mpg
    ```

*   **Raw YUV420P to AVI:**
    ```bash
    ffmpeg -i /tmp/test.yuv /tmp/out.avi
    ```

*   **Audio and Video conversion:**
    ```bash
    ffmpeg -i /tmp/a.wav -s 640x480 -i /tmp/a.yuv /tmp/a.mpg
    ```

*   **Extract images from video:**
    ```bash
    ffmpeg -i foo.avi -r 1 -s WxH -f image2 foo-%03d.jpeg
    ```

*   **Create video from images:**
    ```bash
    ffmpeg -f image2 -framerate 12 -i foo-%03d.jpeg -s WxH foo.avi
    ```

*   **Force CBR video output:**
    ```bash
    ffmpeg -i myfile.avi -b 4000k -minrate 4000k -maxrate 4000k -bufsize 1835k out.m2v
    ```