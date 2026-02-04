---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: Formats
Source: https://ffmpeg.org/ffmpeg-formats.html
---

# FFmpeg Formats

- [1 Description](#1-description)
- [2 Format Options](#2-format-options)
    - [2.1 Format stream specifiers](#21-format-stream-specifiers)
- [3 Demuxers](#3-demuxers)
    - [3.5 concat](#35-concat)
    - [3.7 dvdvideo](#37-dvdvideo)
    - [3.13 image2](#313-image2)
    - [3.18 mov/mp4/3gp](#318-movmp43gp)
- [4 Muxers](#4-muxers)
    - [4.1 Raw muxers](#41-raw-muxers)
    - [4.4 MOV/MPEG-4/ISOMBFF muxers](#44-movmpeg-4isombff-muxers)
    - [4.29 dash](#429-dash)
    - [4.46 hls](#446-hls)
    - [4.69 segment, stream_segment, ssegment](#469-segment-stream_segment-ssegment)
    - [4.72 tee](#472-tee)
- [5 Metadata](#5-metadata)

## 1 Description

This document describes the supported formats (muxers and demuxers) provided by the libavformat library.

## 2 Format Options

The libavformat library provides some generic global options, which can be set on all the muxers and demuxers. In addition each muxer or demuxer may support so-called private options, which are specific for that component.

Options may be set by specifying -*option* *value* in the FFmpeg tools, or by setting the value explicitly in the `AVFormatContext` options or using the `libavutil/opt.h` API for programmatic use.

The list of supported options follows:

*   **avioflags *flags* (input/output)**
    *   `direct`: Reduce buffering.
*   **probesize *integer* (input)**
    Set probing size in bytes, i.e. the size of the data to analyze to get stream information. Must be an integer not lesser than 32. It is 5000000 by default.
*   **max_probe_packets *integer* (input)**
    Set the maximum number of buffered packets when probing a codec. Default is 2500 packets.
*   **packetsize *integer* (output)**
    Set packet size.
*   **fflags *flags***
    Set format flags.
    *   Input values: `discardcorrupt`, `fastseek`, `genpts`, `igndts`, `ignidx`, `nobuffer`, `nofillin`, `noparse`, `sortdts`.
    *   Output values: `autobsf`, `bitexact`, `flush_packets`, `shortest`.
*   **seek2any *integer* (input)**
    Allow seeking to non-keyframes on demuxer level when supported if set to 1. Default is 0.
*   **analyzeduration *integer* (input)**
    Specify how many microseconds are analyzed to probe the input. Defaults to 5,000,000.
*   **cryptokey *hexadecimal string* (input)**
    Set decryption key.
*   **indexmem *integer* (input)**
    Set max memory used for timestamp index (per stream).
*   **rtbufsize *integer* (input)**
    Set max memory used for buffering real-time frames.
*   **fdebug *flags* (input/output)**
    Print specific debug info. Value: `ts`.
*   **max_delay *integer* (input/output)**
    Set maximum muxing or demuxing delay in microseconds.
*   **fpsprobesize *integer* (input)**
    Set number of frames used to probe fps.
*   **audio_preload *integer* (output)**
    Set microseconds by which audio packets should be interleaved earlier.
*   **chunk_duration *integer* (output)**
    Set microseconds for each chunk.
*   **chunk_size *integer* (output)**
    Set size in bytes for each chunk.
*   **err_detect, f_err_detect *flags* (input)**
    Set error detection flags: `crccheck`, `bitstream`, `buffer`, `explode`, `careful`, `compliant`, `aggressive`.
*   **max_interleave_delta *integer* (output)**
    Set maximum buffering duration for interleaving. Defaults to 10,000,000 (10 seconds).
*   **use_wallclock_as_timestamps *integer* (input)**
    Use wallclock as timestamps if set to 1. Default is 0.
*   **avoid_negative_ts *integer* (output)**
    `make_non_negative`, `make_zero`, `auto (default)`, `disabled`.
*   **skip_initial_bytes *integer* (input)**
    Set number of bytes to skip before reading header and frames. Default is 0.
*   **correct_ts_overflow *integer* (input)**
    Correct single timestamp overflows if set to 1. Default is 1.
*   **flush_packets *integer* (output)**
    Flush the underlying I/O stream after each packet. Default is -1 (auto).
*   **output_ts_offset *offset* (output)**
    Set the output time offset.
*   **format_whitelist *list* (input)**
    "," separated list of allowed demuxers.
*   **dump_separator *string* (input)**
    Separator used to separate the fields printed on the command line about the Stream parameters.
*   **max_streams *integer* (input)**
    Specifies the maximum number of streams.
*   **skip_estimate_duration_from_pts *bool* (input)**
    Skip estimation of input duration if it requires an additional probing for PTS at end of file.
*   **duration_probesize *integer* (input)**
    Set probing size, in bytes, for input duration estimation.
*   **strict, f_strict *integer* (input/output)**
    Specify how strictly to follow the standards: `very`, `strict`, `normal`, `unofficial`, `experimental`.

### 2.1 Format stream specifiers

Format stream specifiers allow selection of one or more streams that match specific properties. The exact semantics are defined by the `avformat_match_stream_specifier()` function.

## 3 Demuxers

Demuxers are configured elements in FFmpeg that can read multimedia streams from a particular type of file.

### 3.1 aa
Audible Format 2, 3, and 4 demuxer (.aa).

### 3.2 aac
Raw Audio Data Transport Stream AAC demuxer.

### 3.3 apng
Animated Portable Network Graphics demuxer.
*   `-ignore_loop bool`: Default enabled.
*   `-max_fps int`: Default 0 (no limit).
*   `-default_fps int`: Default 15.

### 3.4 asf
Advanced Systems Format demuxer.
*   `-no_resync_search bool`: Do not try to resynchronize.

### 3.5 concat
Virtual concatenation script demuxer.

#### 3.5.1 Syntax
The script is a text file with one directive per line.
*   `file path`: Path to a file to read.
*   `ffconcat version 1.0`: Identify script type. Must be the first line.
*   `duration dur`: Duration of the file.
*   `inpoint timestamp`: Start seeking point.
*   `outpoint timestamp`: End point (exclusive).
*   `file_packet_meta key value`: Metadata for file packets.
*   `option key value`: Option to access/open the file.
*   `stream`: Introduce a stream.
*   `exact_stream_id id`: Set the id of the stream.
*   `chapter id start end`: Add a chapter.

#### 3.5.2 Options
*   `safe`: If set to 1 (default), reject unsafe file paths.
*   `auto_convert`: If set to 1 (default), perform automatic packet conversions.
*   `segment_time_metadata`: If set to 1, include start time and duration metadata.

#### 3.5.3 Examples
```
# my first filename
file /mnt/share/file-1.wav
# my second filename including whitespace
file '/mnt/share/file 2.wav'
```

### 3.6 dash
Dynamic Adaptive Streaming over HTTP demuxer.
*   `cenc_decryption_key`: 16-byte hex key for CENC decryption.

### 3.7 dvdvideo
DVD-Video demuxer powered by libdvdnav and libdvdread.

#### 3.7.1 Background
DVD-Video uses sequential PGCs (Program Group Chains) within titles. This demuxer requires libdvdnav for navigation and libdvdread for structure parsing.

#### 3.7.2 Options
*   `title int`: Title number (default 1).
*   `chapter_start int`: Chapter to start at.
*   `chapter_end int`: Chapter to end at.
*   `angle int`: Video angle number.
*   `menu bool`: Demux menu assets.
*   `pgc int`: Entry PGC.
*   `preindex bool`: Slow second pass to index chapter markers.
*   `trim bool`: Skip padding cells at the beginning.

#### 3.7.3 Examples
```
ffmpeg -f dvdvideo -title 3 -i <path to DVD> ...
ffmpeg -f dvdvideo -menu 1 -menu_lu 1 -menu_vts 1 -pgc 1 -pg 1 -i <path to DVD> ...
```

### 3.8 ea
Electronic Arts Multimedia format demuxer.
*   `merge_alpha bool`: Return VP6 alpha channel in a single video stream.

### 3.9 imf
Interoperable Master Format demuxer (SMPTE ST 2067-2).

### 3.10 flv, live_flv, kux
Adobe Flash Video Format demuxer. `live_flv` survives timestamp discontinuities.

### 3.11 gif
Animated GIF demuxer.
*   `min_delay`: Minimum frame delay (default 2).
*   `max_gif_delay`: Maximum frame delay (default 65535).
*   `ignore_loop`: Ignore loop setting (default 1).

### 3.12 hls
Apple HTTP Live Streaming demuxer.
*   `live_start_index`: Segment index to start live streams.
*   `http_multiple`: Use multiple HTTP connections.

### 3.13 image2
Image file demuxer.

#### 3.13.1 Examples
```
ffmpeg -framerate 10 -i 'img-%03d.jpeg' out.mkv
ffmpeg -framerate 10 -pattern_type glob -i "*.png" out.mkv
```

### 3.14 libgme
Game Music Emu library demuxer.
*   `track_index`: Index of track to demux.
*   `max_size`: Maximum buffer size (default 50 MiB).

### 3.15 libmodplug
ModPlug based module demuxer.

### 3.16 libopenmpt
libopenmpt based module demuxer.

### 3.17 mcc
MacCaption MCC files (v1.0 and 2.0).
*   `eia608_extract`: Set to 0 to return all VANC data as `SMPTE_436M_ANC`.

### 3.18 mov/mp4/3gp
Quicktime / ISO Base Media File Format demuxer.

#### 3.18.1 Options
*   `ignore_editlist`: Ignore edit list atoms.
*   `activation_bytes`: 4-byte key for Audible AAX files.
*   `decryption_key`: 16-byte hex key for CENC.

#### 3.18.2 Audible AAX
```
ffmpeg -activation_bytes 1CEB00DA -i test.aax -vn -c:a copy output.mp4
```

### 3.19 mpegts
MPEG-2 transport stream demuxer.

### 3.20 mpjpeg
MJPEG encapsulated in multi-part MIME demuxer.

### 3.21 rawvideo
Raw video demuxer. Requires manual specification of `video_size` and `pixel_format`.

### 3.22 rcwt
Raw Captions With Time (ccextractor format).

### 3.23 sbg
SBaGen script demuxer for binaural beats.

### 3.24 tedcaptions
JSON captions for TED Talks.

### 3.25 vapoursynth
Vapoursynth wrapper. Requires `-f vapoursynth`.

### 3.26 w64
Sony Wave64 Audio demuxer.

### 3.27 wav
RIFF Wave Audio demuxer.

## 4 Muxers

Muxers allow writing multimedia streams to a particular type of file.

### 4.1 Raw muxers
These accept a single stream matching the designated codec.
*   `ac3`, `adx`, `aptx`, `avs2`, `cavsvideo`, `codec2raw`, `data`, `dirac`, `dnxhd`, `dts`, `eac3`, `h264`, `hevc`, `mjpeg`, `mp2`, `mpeg1video`, `rawvideo`.

### 4.2 Raw PCM muxers
*   `alaw`, `f32be`, `f32le`, `s16be`, `s16le`, `s32le`, `u8`.

### 4.3 MPEG-1/MPEG-2 program stream muxers
*   `mpeg`, `vcd`, `vob`, `dvd`, `svcd`.
*   **Options**: `muxrate`, `preload`.

### 4.4 MOV/MPEG-4/ISOMBFF muxers
*   `3gp`, `3g2`, `f4v`, `ipod`, `ismv`, `mov`, `mp4`, `psp`.

#### 4.4.1 Fragmentation
Enabled via `frag_duration`, `frag_size`, or `movflags +frag_keyframe`.

#### 4.4.2 Options
*   `faststart`: Move index (moov atom) to the beginning.
*   `negative_cts_offsets`: Enables version 1 of CTTS box.
*   `write_prft`: Write producer time reference box.

### 4.5 a64
Commodore 64 video muxer.

### 4.6 ac4
Raw AC-4 audio muxer.

### 4.7 adts
Audio Data Transport Stream muxer (AAC).

### 4.14 apng
Animated Portable Network Graphics muxer.
*   `final_delay`: Delay after the last frame.
*   `plays`: Number of repetitions (0 for infinite).

### 4.17 asf, asf_stream
Advanced Systems Format muxer.

### 4.21 avi
Audio Video Interleaved muxer.
*   `reserve_index_space`: Bytes to reserve for OpenDML master index.

### 4.22 avif
AV1 image format muxer.

### 4.27 chromaprint
Chromaprint fingerprinter muxer. Requires `--enable-chromaprint`.

### 4.28 crc
Computes Adler-32 CRC of all input frames.

### 4.29 dash
Dynamic Adaptive Streaming over HTTP (DASH) muxer.
*   `adaptation_sets`: Assign streams to adaptation sets.
*   `window_size`: Max segments kept in manifest.
*   `streaming`: Enable chunk streaming mode.

### 4.30 daud
D-Cinema audio muxer (96kHz, 6-channel pcm_24daud).

### 4.32 ffmetadata
FFmpeg metadata muxer.

### 4.33 fifo
First-In First-Out pseudo-muxer. Separates encoding and muxing into different threads.
*   `attempt_recovery`: Attempt to restart streaming on failure.

### 4.37 flac
Raw FLAC audio muxer.

### 4.38 flv
Adobe Flash Video Format muxer.

### 4.39 framecrc
Per-packet Adler-32 CRC testing format.

### 4.40 framehash
Per-packet cryptographic hash testing format.

### 4.42 gif
Animated GIF muxer.

### 4.44 hash
Computes a cryptographic hash of all input frames.

### 4.46 hls
Apple HTTP Live Streaming muxer.
*   `hls_time`: Target segment length.
*   `hls_list_size`: Max playlist entries.
*   `hls_flags`: `delete_segments`, `append_list`, `split_by_time`, `program_date_time`.

### 4.47 iamf
Immersive Audio Model and Formats (IAMF) muxer.

### 4.48 ico
Microsoft icon file format.

| BMP Bit Depth | FFmpeg Pixel Format |
| :--- | :--- |
| 1bit | pal8 |
| 4bit | pal8 |
| 8bit | pal8 |
| 16bit | rgb555le |
| 24bit | bgr24 |
| 32bit | bgra |

### 4.50 image2, image2pipe
Image file muxer.
*   `update`: Continuously overwrite a single file.
*   `strftime`: Expand filename with date/time.

### 4.57 matroska
Matroska container muxer (includes WebM).
*   `reserve_index_space`: Reserve space for Cues at the beginning.

### 4.59 mcc
MacCaption MCC files (v1.0 and 2.0).

### 4.62 mp3
Raw MP3 stream with ID3v2 and Xing/LAME frame support.

### 4.63 mpegts
MPEG transport stream muxer.

### 4.64 mxf, mxf_d10, mxf_opatom
MXF muxer.

### 4.65 null
Null muxer. Does not generate output; used for benchmarking.

### 4.67 ogg
Ogg container muxer.

### 4.69 segment, stream_segment, ssegment
Basic stream segmenter.
*   `segment_time`: Segment duration.
*   `segment_list`: Generate a listfile (m3u8, csv, ffconcat).

### 4.72 tee
Writes the same data to several outputs.
*   `use_fifo`: Process slave outputs in separate threads.
*   `select`: Select specific streams for a slave.

### 4.73 webm_chunk
WebM Live Chunk Muxer for DASH.

### 4.74 webm_dash_manifest
WebM DASH Manifest muxer.

### 4.75 whip
WebRTC-HTTP ingestion protocol (WHIP) muxer. Experimental.

## 5 Metadata

FFmpeg can dump metadata into a UTF-8 encoded INI-like file.

**Format:**
1. Header: `;FFMETADATA1`
2. Tags: `key=value`
3. Sections: `[STREAM]` or `[CHAPTER]`
4. Chapter requirements: `TIMEBASE`, `START`, `END`.

**Example:**
```
;FFMETADATA1
title=bike\\shed
artist=FFmpeg troll team

[CHAPTER]
TIMEBASE=1/1000
START=0
END=60000
title=chapter \#1
```