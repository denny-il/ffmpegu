---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: Bitstream Filters
Source: https://ffmpeg.org/ffmpeg-bitstream-filters.html
---

# FFmpeg Bitstream Filters

- [Description](#description)
- [Bitstream Filters](#bitstream-filters)
  - [aac_adtstoasc](#aac_adtstoasc)
  - [av1_metadata](#av1_metadata)
  - [chomp](#chomp)
  - [dca_core](#dca_core)
  - [dovi_rpu](#dovi_rpu)
  - [dump_extra](#dump_extra)
  - [dv_error_marker](#dv_error_marker)
  - [eac3_core](#eac3_core)
  - [eia608_to_smpte436m](#eia608_to_smpte436m)
  - [extract_extradata](#extract_extradata)
  - [filter_units](#filter_units)
  - [hapqa_extract](#hapqa_extract)
  - [h264_metadata](#h264_metadata)
  - [h264_mp4toannexb](#h264_mp4toannexb)
  - [h264_redundant_pps](#h264_redundant_pps)
  - [hevc_metadata](#hevc_metadata)
  - [hevc_mp4toannexb](#hevc_mp4toannexb)
  - [imxdump](#imxdump)
  - [mjpeg2jpeg](#mjpeg2jpeg)
  - [mjpegadump](#mjpegadump)
  - [mov2textsub](#mov2textsub)
  - [mpeg2_metadata](#mpeg2_metadata)
  - [mpeg4_unpack_bframes](#mpeg4_unpack_bframes)
  - [noise](#noise)
  - [null](#null)
  - [pcm_rechunk](#pcm_rechunk)
  - [pgs_frame_merge](#pgs_frame_merge)
  - [prores_metadata](#prores_metadata)
  - [remove_extra](#remove_extra)
  - [setts](#setts)
  - [showinfo](#showinfo)
  - [smpte436m_to_eia608](#smpte436m_to_eia608)
  - [text2movsub](#text2movsub)
  - [trace_headers](#trace_headers)
  - [truehd_core](#truehd_core)
  - [vp9_metadata](#vp9_metadata)
  - [vp9_superframe](#vp9_superframe)
  - [vp9_superframe_split](#vp9_superframe_split)
  - [vp9_raw_reorder](#vp9_raw_reorder)

## 1 Description

This document describes the bitstream filters provided by the libavcodec library.

A bitstream filter operates on the encoded stream data, and performs bitstream level modifications without performing decoding.

## 2 Bitstream Filters

When you configure your FFmpeg build, all the supported bitstream filters are enabled by default. You can list all available ones using the configure option `--list-bsfs`.

You can disable all the bitstream filters using the configure option `--disable-bsfs`, and selectively enable any bitstream filter using the option `--enable-bsf=BSF`, or you can disable a particular bitstream filter using the option `--disable-bsf=BSF`.

The option `-bsfs` of the ff* tools will display the list of all the supported bitstream filters included in your build.

The ff* tools have a -bsf option applied per stream, taking a comma-separated list of filters, whose parameters follow the filter name after a ’=’.

```example
ffmpeg -i INPUT -c:v copy -bsf:v filter1[=opt1=str1:opt2=str2][,filter2] OUTPUT
```

Below is a description of the currently available bitstream filters, with their parameters, if any.

### 2.1 aac_adtstoasc

Convert MPEG-2/4 AAC ADTS to an MPEG-4 Audio Specific Configuration bitstream.

This filter creates an MPEG-4 AudioSpecificConfig from an MPEG-2/4 ADTS header and removes the ADTS header.

This filter is required for example when copying an AAC stream from a raw ADTS AAC or an MPEG-TS container to MP4A-LATM, to an FLV file, or to MOV/MP4 files and related formats such as 3GP or M4A. Please note that it is auto-inserted for MP4A-LATM and MOV/MP4 and related formats.

### 2.2 av1_metadata

Modify metadata embedded in an AV1 stream.

*   **td**: Insert or remove temporal delimiter OBUs in all temporal units of the stream.
    *   **insert**: Insert a TD at the beginning of every TU which does not already have one.
    *   **remove**: Remove the TD from the beginning of every TU which has one.
*   **color_primaries**, **transfer_characteristics**, **matrix_coefficients**: Set the color description fields in the stream (see AV1 section 6.4.2).
*   **color_range**: Set the color range in the stream (see AV1 section 6.4.2; note that this cannot be set for streams using BT.709 primaries, sRGB transfer characteristic and identity (RGB) matrix coefficients).
    *   **tv**: Limited range.
    *   **pc**: Full range.
*   **chroma_sample_position**: Set the chroma sample location in the stream (see AV1 section 6.4.2). This can only be set for 4:2:0 streams.
    *   **vertical**: Left position (matching the default in MPEG-2 and H.264).
    *   **colocated**: Top-left position.
*   **tick_rate**: Set the tick rate (*time_scale / num_units_in_display_tick*) in the timing info in the sequence header.
*   **num_ticks_per_picture**: Set the number of ticks in each picture, to indicate that the stream has a fixed framerate. Ignored if `tick_rate` is not also set.
*   **delete_padding**: Deletes Padding OBUs.

### 2.3 chomp

Remove zero padding at the end of a packet.

### 2.4 dca_core

Extract the core from a DCA/DTS stream, dropping extensions such as DTS-HD.

### 2.5 dovi_rpu

Manipulate Dolby Vision metadata in a HEVC/AV1 bitstream, optionally enabling metadata compression.

*   **strip**: If enabled, strip all Dolby Vision metadata (configuration record + RPU data blocks) from the stream.
*   **compression**: Which compression level to enable.
    *   **none**: No metadata compression.
    *   **limited**: Limited metadata compression scheme. Should be compatible with most devices. This is the default.
    *   **extended**: Extended metadata compression. Devices are not required to support this. Note that this level currently behaves the same as ‘limited’ in libavcodec.

### 2.6 dump_extra

Add extradata to the beginning of the filtered packets except when said packets already exactly begin with the extradata that is intended to be added.

*   **freq**: The additional argument specifies which packets should be filtered. It accepts the values:
    *   **k**, **keyframe**: add extradata to all key packets
    *   **e**, **all**: add extradata to all packets

If not specified it is assumed ‘k’.

For example the following `ffmpeg` command forces a global header (thus disabling individual packet headers) in the H.264 packets generated by the `libx264` encoder, but corrects them by adding the header stored in extradata to the key packets:

```example
ffmpeg -i INPUT -map 0 -flags:v +global_header -c:v libx264 -bsf:v dump_extra out.ts
```

### 2.7 dv_error_marker

Blocks in DV which are marked as damaged are replaced by blocks of the specified color.

*   **color**: The color to replace damaged blocks by
*   **sta**: A 16 bit mask which specifies which of the 16 possible error status values are to be replaced by colored blocks. 0xFFFE is the default which replaces all non 0 error status values.
    *   **ok**: No error, no concealment
    *   **err**: Error, No concealment
    *   **res**: Reserved
    *   **notok**: Error or concealment
    *   **notres**: Not reserved
    *   **Aa, Ba, Ca, Ab, Bb, Cb, A, B, C, a, b, erri, erru**: The specific error status code

See page 44-46 or section 5.5 of [SMPTE 314M](http://web.archive.org/web/20060927044735/http://www.smpte.org/smpte_store/standards/pdf/s314m.pdf).

### 2.8 eac3_core

Extract the core from a E-AC-3 stream, dropping extra channels.

### 2.9 eia608_to_smpte436m

Convert from a `EIA_608` stream to a `SMPTE_436M_ANC` data stream, wrapping the closed captions in CTA-708 CDP VANC packets.

*   **line_number**: Choose which line number the generated VANC packets should go on. You generally want either line 9 (the default) or 11.
*   **wrapping_type**: Choose the SMPTE 436M wrapping type, defaults to ‘vanc_frame’.
    *   **vanc_frame**: VANC frame (interlaced or segmented progressive frame)
    *   **vanc_field_1**, **vanc_field_2**, **vanc_progressive_frame**
*   **sample_coding**: Choose the SMPTE 436M sample coding, defaults to ‘8bit_luma’.
    *   **8bit_luma**: 8-bit component luma samples
    *   **8bit_color_diff**: 8-bit component color difference samples
    *   **8bit_luma_and_color_diff**: 8-bit component luma and color difference samples
    *   **10bit_luma**: 10-bit component luma samples
    *   **10bit_color_diff**: 10-bit component color difference samples
    *   **10bit_luma_and_color_diff**: 10-bit component luma and color difference samples
    *   **8bit_luma_parity_error**: 8-bit component luma samples with parity error
    *   **8bit_color_diff_parity_error**: 8-bit component color difference samples with parity error
    *   **8bit_luma_and_color_diff_parity_error**: 8-bit component luma and color difference samples with parity error
*   **initial_cdp_sequence_cntr**: The initial value of the CDP’s 16-bit unsigned integer `cdp_hdr_sequence_cntr` and `cdp_ftr_sequence_cntr` fields. Defaults to 0.
*   **cdp_frame_rate**: Set the CDP’s `cdp_frame_rate` field. This doesn’t actually change the timing of the data stream, it just changes the values inserted in that field in the generated CDP packets. Defaults to ‘30000/1001’.

### 2.10 extract_extradata

Extract the in-band extradata.

Certain codecs allow the long-term headers (e.g. MPEG-2 sequence headers, or H.264/HEVC (VPS/)SPS/PPS) to be transmitted either "in-band" (i.e. as a part of the bitstream containing the coded frames) or "out of band" (e.g. on the container level). This latter form is called "extradata" in FFmpeg terminology.

This bitstream filter detects the in-band headers and makes them available as extradata.

*   **remove**: When this option is enabled, the long-term headers are removed from the bitstream after extraction.

### 2.11 filter_units

Remove units with types in or not in a given set from the stream.

*   **pass_types**: List of unit types or ranges of unit types to pass through while removing all others. This is specified as a ’|’-separated list of unit type values or ranges of values with ’-’.
*   **remove_types**: Identical to `pass_types`, except the units in the given set are removed and all others passed through.

The types used by pass_types and remove_types correspond to NAL unit types (nal_unit_type) in H.264, HEVC and H.266, to marker values for JPEG (without 0xFF prefix) and to start codes without start code prefix for MPEG-2. For VP8 and VP9, every unit has type zero.

Extradata is unchanged by this transformation, but note that if the stream contains inline parameter sets then the output may be unusable if they are removed.

Example: remove all non-VCL NAL units from an H.264 stream:
```example
ffmpeg -i INPUT -c:v copy -bsf:v 'filter_units=pass_types=1-5' OUTPUT
```

Example: remove all AUDs, SEI and filler from an H.265 stream:
```example
ffmpeg -i INPUT -c:v copy -bsf:v 'filter_units=remove_types=35|38-40' OUTPUT
```

Example: remove all user data from a MPEG-2 stream, including Closed Captions:
```example
ffmpeg -i INPUT -c:v copy -bsf:v 'filter_units=remove_types=178' OUTPUT
```

Example: remove all SEI from a H264 stream, including Closed Captions:
```example
ffmpeg -i INPUT -c:v copy -bsf:v 'filter_units=remove_types=6' OUTPUT
```

Example: remove all prefix and suffix SEI from a HEVC stream, including Closed Captions and dynamic HDR:
```example
ffmpeg -i INPUT -c:v copy -bsf:v 'filter_units=remove_types=39|40' OUTPUT
```

### 2.12 hapqa_extract

Extract Rgb or Alpha part of an HAPQA file, without recompression, in order to create an HAPQ or an HAPAlphaOnly file.

*   **texture**: Specifies the texture to keep.
    *   **color**
    *   **alpha**

Convert HAPQA to HAPQ:
```example
ffmpeg -i hapqa_inputfile.mov -c copy -bsf:v hapqa_extract=texture=color -tag:v HapY -metadata:s:v:0 encoder="HAPQ" hapq_file.mov
```

Convert HAPQA to HAPAlphaOnly:
```example
ffmpeg -i hapqa_inputfile.mov -c copy -bsf:v hapqa_extract=texture=alpha -tag:v HapA -metadata:s:v:0 encoder="HAPAlpha Only" hapalphaonly_file.mov
```

### 2.13 h264_metadata

Modify metadata embedded in an H.264 stream.

*   **aud**: Insert or remove AUD NAL units in all access units of the stream.
    *   **pass**, **insert**, **remove** (Default is pass).
*   **sample_aspect_ratio**: Set the sample aspect ratio of the stream in the VUI parameters.
*   **overscan_appropriate_flag**: Set whether the stream is suitable for display using overscan or not.
*   **video_format**, **video_full_range_flag**: Set the video format in the stream.
*   **colour_primaries**, **transfer_characteristics**, **matrix_coefficients**: Set the colour description in the stream.
*   **chroma_sample_loc_type**: Set the chroma sample location in the stream.
*   **tick_rate**: Set the tick rate (time_scale / num_units_in_tick) in the VUI parameters.
*   **fixed_frame_rate_flag**: Set whether the stream has fixed framerate.
*   **zero_new_constraint_set_flags**: Zero constraint_set4_flag and constraint_set5_flag in the SPS.
*   **crop_left**, **crop_right**, **crop_top**, **crop_bottom**: Set the frame cropping offsets in the SPS.
*   **sei_user_data**: Insert a string as SEI unregistered user data. The argument must be of the form *UUID+string*.
    *   Example: ‘086f3693-b7b3-4f2c-9653-21492feee5b8+hello’
*   **delete_filler**: Deletes both filler NAL units and filler SEI messages.
*   **display_orientation**: Insert, extract or remove Display orientation SEI messages.
    *   **pass**, **insert**, **remove**, **extract** (Default is pass).
*   **rotate**: Set rotation in display orientation SEI (anticlockwise angle in degrees). Range is -360 to +360.
*   **flip**: Set flip in display orientation SEI.
    *   **horizontal**, **vertical**
*   **level**: Set the level in the SPS (e.g., ‘4.2’, ‘42’, or ‘auto’).

### 2.14 h264_mp4toannexb

Convert an H.264 bitstream from length prefixed mode to start code prefixed mode (Annex B). This is required by some streaming formats like MPEG-TS.

```example
ffmpeg -i INPUT.mp4 -codec copy -bsf:v h264_mp4toannexb OUTPUT.ts
```

### 2.15 h264_redundant_pps

Fixes some Blu-ray BDMV H264 streams containing redundant PPSs that vary irrelevant parameters, causing issues in global header containers. This filter removes extra PPSs and rewrites slice headers to use a single leading PPS.

### 2.16 hevc_metadata

Modify metadata embedded in an HEVC stream.

*   **aud**: Insert or remove AUD NAL units.
*   **sample_aspect_ratio**: Set the sample aspect ratio.
*   **video_format**, **video_full_range_flag**: Set video format fields.
*   **colour_primaries**, **transfer_characteristics**, **matrix_coefficients**: Set color description.
*   **chroma_sample_loc_type**: Set chroma sample location.
*   **tick_rate**: Set the tick rate in VPS and VUI.
*   **num_ticks_poc_diff_one**: Set poc_proportional_to_timing_flag.
*   **crop_left**, **crop_right**, **crop_top**, **crop_bottom**: Set conformance window offsets.
*   **width**, **height**: Set width and height after crop.
*   **level**: Set the level in VPS and SPS.

### 2.17 hevc_mp4toannexb

Convert an HEVC/H.265 bitstream from length prefixed mode to start code prefixed mode.

```example
ffmpeg -i INPUT.mp4 -codec copy -bsf:v hevc_mp4toannexb OUTPUT.ts
```

### 2.18 imxdump

Modifies the bitstream to fit in MOV and to be usable by the Final Cut Pro decoder (mpeg2video only).

```example
ffmpeg -i input.mxf -c copy -bsf:v imxdump -tag:v mx3n output.mov
```

### 2.19 mjpeg2jpeg

Convert MJPEG/AVI1 packets to full JPEG/JFIF packets by prepending the missing DHT segment.

```example
ffmpeg -i mjpeg-movie.avi -c:v copy -bsf:v mjpeg2jpeg frame_%d.jpg
```

### 2.20 mjpegadump

Add an MJPEG A header to the bitstream to enable decoding by Quicktime.

### 2.21 mov2textsub

Extract a representable text file from MOV subtitles, stripping the metadata header from each subtitle packet.

### 2.22 mpeg2_metadata

Modify metadata embedded in an MPEG-2 stream.

*   **display_aspect_ratio**: Set the display aspect ratio (4/3, 16/9, 221/100).
*   **frame_rate**: Set the frame rate.
*   **video_format**: Set the video format.
*   **colour_primaries**, **transfer_characteristics**, **matrix_coefficients**: Set color description.

### 2.23 mpeg4_unpack_bframes

Unpack DivX-style packed B-frames into valid MPEG-4.

```example
ffmpeg -i INPUT.avi -codec copy -bsf:v mpeg4_unpack_bframes OUTPUT.avi
```

### 2.24 noise

Damages the contents of packets or drops them. Used for fuzzing or testing error resilience.

*   **amount**: Expression for how often bytes are modified.
*   **drop**: Expression for whether a packet is dropped.
*   **dropamount**: Variable chance of dropping (backwards compatibility).

Variables for expressions: `n` (index), `tb` (timebase), `pts`, `dts`, `nopts`, `startpts`, `startdts`, `duration`, `pos`, `size`, `key`, `state`.

#### 2.24.1 Examples

Modify every byte:
```example
ffmpeg -i INPUT -c copy -bsf noise=1 output.mkv
```

Drop non-keyframes after 30s:
```example
ffmpeg -i INPUT -c copy -bsf:v noise=drop='gt(pts*tb\,30)*not(key)' output.mkv
```

### 2.25 null

Passes the packets through unchanged.

### 2.26 pcm_rechunk

Repacketize PCM audio to a fixed number of samples per packet or a fixed packet rate.

*   **nb_out_samples, n**: Samples per channel per output packet (Default 1024).
*   **pad, p**: Pad last packet with silence (Default 1).
*   **frame_rate, r**: Fixed number of packets per second.

Example: generate 1602-1601 pattern for 48kHz audio at NTSC rate:
```example
ffmpeg -f lavfi -i sine=r=48000:d=1 -c pcm_s16le -bsf pcm_rechunk=r=30000/1001 -f framecrc -
```

### 2.27 pgs_frame_merge

Merge a sequence of PGS Subtitle segments ending with an "end of display set" segment into a single packet. Required for Matroska.

### 2.28 prores_metadata

Modify color property metadata embedded in prores stream.

*   **color_primaries**: auto, unknown, bt709, bt470bg, smpte170m, bt2020, smpte431, smpte432.
*   **transfer_characteristics**: auto, unknown, bt709, smpte2084, arib-std-b67.
*   **matrix_coefficients**: auto, unknown, bt709, smpte170m, bt2020nc.

Example: Set Rec709 colorspace:
```example
ffmpeg -i INPUT -c copy -bsf:v prores_metadata=color_primaries=bt709:color_trc=bt709:colorspace=bt709 output.mov
```

### 2.29 remove_extra

Remove extradata from packets.

*   **freq**:
    *   **k**: Non-keyframes only.
    *   **keyframe**: Keyframes only.
    *   **e, all**: All frames.

### 2.30 setts

Set PTS and DTS in packets.

*   **ts**, **pts**, **dts**: Set expressions for timestamps.
*   **duration**: Set expression for duration.
*   **time_base**: Set output time base.

Constants: `N`, `TS`, `POS`, `DTS`, `PTS`, `DURATION`, `STARTDTS`, `STARTPTS`, `PREV_INDTS`, `PREV_INPTS`, `PREV_INDURATION`, `PREV_OUTDTS`, `PREV_OUTPTS`, `PREV_OUTDURATION`, `NEXT_DTS`, `NEXT_PTS`, `NEXT_DURATION`, `TB`, `TB_OUT`, `SR`, `NOPTS`.

Example: set PTS equal to DTS:
```example
ffmpeg -i INPUT -c:a copy -bsf:a setts=pts=DTS out.mkv
```

### 2.31 showinfo

Log basic packet information for testing and development.

### 2.32 smpte436m_to_eia608

Convert from a `SMPTE_436M_ANC` data stream to a `EIA_608` stream, extracting closed captions from CTA-708 CDP VANC packets.

### 2.33 text2movsub

Convert text subtitles to MOV subtitles (as used by the `mov_text` codec) with metadata headers.

### 2.34 trace_headers

Log trace output containing all syntax elements in the coded stream headers. Supports AV1, H.264, H.265, (M)JPEG, MPEG-2 and VP9.

### 2.35 truehd_core

Extract the core from a TrueHD stream, dropping ATMOS data.

### 2.36 vp9_metadata

Modify metadata embedded in a VP9 stream.

*   **color_space**: unknown, bt601, bt709, smpte170, smpte240, bt2020, rgb.
*   **color_range**: tv, pc.

### 2.37 vp9_superframe

Merge VP9 invisible (alt-ref) frames back into VP9 superframes.

### 2.38 vp9_superframe_split

Split VP9 superframes into single frames.

### 2.39 vp9_raw_reorder

Given a VP9 stream with correct timestamps but possibly out of order, insert additional show-existing-frame packets to correct the ordering.