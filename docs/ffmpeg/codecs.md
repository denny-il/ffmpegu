---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: Codecs
Source: https://ffmpeg.org/ffmpeg-codecs.html
---

# FFmpeg Codecs Documentation

- [1 Description](#1-description)
- [2 Codec Options](#2-codec-options)
- [3 Decoders](#3-decoders)
- [4 Video Decoders](#4-video-decoders)
- [5 Audio Decoders](#5-audio-decoders)
- [6 Subtitles Decoders](#6-subtitles-decoders)
- [7 Encoders](#7-encoders)
- [8 Audio Encoders](#8-audio-encoders)
- [9 Video Encoders](#9-video-encoders)
- [10 Subtitles Encoders](#10-subtitles-encoders)

## 1 Description

This document describes the codecs (decoders and encoders) provided by the libavcodec library.

## 2 Codec Options

libavcodec provides some generic global options, which can be set on all the encoders and decoders. In addition, each codec may support so-called private options, which are specific for a given codec.

Sometimes, a global option may only affect a specific kind of codec, and may be nonsensical or ignored by another, so you need to be aware of the meaning of the specified options. Also some options are meant only for decoding or encoding.

Options may be set by specifying -*option* *value* in the FFmpeg tools, or by setting the value explicitly in the `AVCodecContext` options or using the `libavutil/opt.h` API for programmatic use.

The list of supported options follow:

- **b** *integer* (*encoding,audio,video*): Set bitrate in bits/s. Default value is 200K.
- **ab** *integer* (*encoding,audio*): Set audio bitrate (in bits/s). Default value is 128K.
- **bt** *integer* (*encoding,video*): Set video bitrate tolerance (in bits/s). In 1-pass mode, bitrate tolerance specifies how far ratecontrol is willing to deviate from the target average bitrate value. This is not related to min/max bitrate. Lowering tolerance too much has an adverse effect on quality.
- **flags** *flags* (*decoding/encoding,audio,video,subtitles*): Set generic flags.
    - `mv4`: Use four motion vector by macroblock (mpeg4).
    - `qpel`: Use 1/4 pel motion compensation.
    - `loop`: Use loop filter.
    - `qscale`: Use fixed qscale.
    - `pass1`: Use internal 2pass ratecontrol in first pass mode.
    - `pass2`: Use internal 2pass ratecontrol in second pass mode.
    - `gray`: Only decode/encode grayscale.
    - `psnr`: Set error[?] variables during encoding.
    - `truncated`: Input bitstream might be randomly truncated.
    - `drop_changed`: Don’t output frames whose parameters differ from first decoded frame in stream. Error AVERROR_INPUT_CHANGED is returned when a frame is dropped.
    - `ildct`: Use interlaced DCT.
    - `low_delay`: Force low delay.
    - `global_header`: Place global headers in extradata instead of every keyframe.
    - `bitexact`: Only write platform-, build- and time-independent data. (except (I)DCT). This ensures that file and data checksums are reproducible and match between platforms. Its primary use is for regression testing.
    - `aic`: Apply H263 advanced intra coding / mpeg4 ac prediction.
    - `ilme`: Apply interlaced motion estimation.
    - `cgop`: Use closed gop.
    - `output_corrupt`: Output even potentially corrupted frames.
- **time_base** *rational number*: Set codec time base. It is the fundamental unit of time (in seconds) in terms of which frame timestamps are represented. For fixed-fps content, timebase should be `1 / frame_rate` and timestamp increments should be identically 1.
- **g** *integer* (*encoding,video*): Set the group of picture (GOP) size. Default value is 12.
- **ar** *integer* (*decoding/encoding,audio*): Set audio sampling rate (in Hz).
- **ac** *integer* (*decoding/encoding,audio*): Set number of audio channels.
- **cutoff** *integer* (*encoding,audio*): Set cutoff bandwidth. (Supported only by selected encoders).
- **frame_size** *integer* (*encoding,audio*): Set audio frame size. Each submitted frame except the last must contain exactly frame_size samples per channel. May be 0 when the codec has CODEC_CAP_VARIABLE_FRAME_SIZE set.
- **frame_number** *integer*: Set the frame number.
- **delay** *integer*
- **qcomp** *float* (*encoding,video*): Set video quantizer scale compression (VBR). Recommended range for default rc_eq: 0.0-1.0.
- **qblur** *float* (*encoding,video*): Set video quantizer scale blur (VBR).
- **qmin** *integer* (*encoding,video*): Set min video quantizer scale (VBR). Range: -1 to 69, default 2.
- **qmax** *integer* (*encoding,video*): Set max video quantizer scale (VBR). Range: -1 to 1024, default 31.
- **qdiff** *integer* (*encoding,video*): Set max difference between the quantizer scale (VBR).
- **bf** *integer* (*encoding,video*): Set max number of B frames between non-B-frames. Range: -1 to 16. Default 0.
- **b_qfactor** *float* (*encoding,video*): Set qp factor between P and B frames.
- **codec_tag** *integer*
- **bug** *flags* (*decoding,video*): Workaround not auto detected encoder bugs.
    - `autodetect`, `xvid_ilace`, `ump4`, `no_padding`, `amv`, `qpel_chroma`, `std_qpel`, `qpel_chroma2`, `direct_blocksize`, `edge`, `hpel_chroma`, `dc_clip`, `ms`, `trunc`.
- **strict** *integer* (*decoding/encoding,audio,video*): Specify how strictly to follow the standards.
    - `very`: strictly conform to an older more strict version of the spec.
    - `strict`: strictly conform to all the things in the spec.
    - `normal`
    - `unofficial`: allow unofficial extensions.
    - `experimental`: allow non standardized experimental things.
- **b_qoffset** *float* (*encoding,video*): Set QP offset between P and B frames.
- **err_detect** *flags* (*decoding,audio,video*): Set error detection flags.
    - `crccheck`, `bitstream`, `buffer`, `explode`, `ignore_err`, `careful`, `compliant`, `aggressive`.
- **has_b_frames** *integer*
- **block_align** *integer*
- **rc_override_count** *integer*
- **maxrate** *integer* (*encoding,audio,video*): Set max bitrate tolerance (in bits/s). Requires bufsize to be set.
- **minrate** *integer* (*encoding,audio,video*): Set min bitrate tolerance (in bits/s).
- **bufsize** *integer* (*encoding,audio,video*): Set ratecontrol buffer size (in bits).
- **i_qfactor** *float* (*encoding,video*): Set QP factor between P and I frames.
- **i_qoffset** *float* (*encoding,video*): Set QP offset between P and I frames.
- **dct** *integer* (*encoding,video*): Set DCT algorithm.
    - `auto`, `fastint`, `int`, `mmx`, `altivec`, `faan`.
- **lumi_mask** *float* (*encoding,video*): Compress bright areas stronger than medium ones.
- **tcplx_mask** *float* (*encoding,video*): Set temporal complexity masking.
- **scplx_mask** *float* (*encoding,video*): Set spatial complexity masking.
- **p_mask** *float* (*encoding,video*): Set inter masking.
- **dark_mask** *float* (*encoding,video*): Compress dark areas stronger than medium ones.
- **idct** *integer* (*decoding/encoding,video*): Select IDCT implementation.
    - `auto`, `int`, `simple`, `simplemmx`, `simpleauto`, `arm`, `altivec`, `sh4`, `simplearm`, `simplearmv5te`, `simplearmv6`, `simpleneon`, `xvid`, `faani`.
- **slice_count** *integer*
- **ec** *flags* (*decoding,video*): Set error concealment strategy.
    - `guess_mvs`, `deblock`, `favor_inter`.
- **bits_per_coded_sample** *integer*
- **aspect** *rational number* (*encoding,video*): Set sample aspect ratio.
- **sar** *rational number* (*encoding,video*): Set sample aspect ratio. Alias to *aspect*.
- **debug** *flags* (*decoding/encoding,audio,video,subtitles*): Print specific debug info.
    - `pict`, `rc`, `bitstream`, `mb_type`, `qp`, `dct_coeff`, `green_metadata`, `skip`, `startcode`, `er`, `mmco`, `bugs`, `buffers`, `thread_ops`, `nomc`.
- **cmp** *integer* (*encoding,video*): Set full pel me compare function.
    - `sad`, `sse`, `satd`, `dct`, `psnr`, `bit`, `rd`, `zero`, `vsad`, `vsse`, `nsse`, `w53`, `w97`, `dctmax`, `chroma`.
- **subcmp** *integer* (*encoding,video*): Set sub pel me compare function. (Values same as `cmp`).
- **mbcmp** *integer* (*encoding,video*): Set macroblock compare function. (Values same as `cmp`).
- **ildctcmp** *integer* (*encoding,video*): Set interlaced dct compare function. (Values same as `cmp`).
- **dia_size** *integer* (*encoding,video*): Set diamond type & size for motion estimation.
- **last_pred** *integer* (*encoding,video*): Set amount of motion predictors from the previous frame.
- **precmp** *integer* (*encoding,video*): Set pre motion estimation compare function.
- **pre_dia_size** *integer* (*encoding,video*): Set diamond type & size for motion estimation pre-pass.
- **subq** *integer* (*encoding,video*): Set sub pel motion estimation quality.
- **me_range** *integer* (*encoding,video*): Set limit motion vectors range.
- **global_quality** *integer* (*encoding,audio,video*)
- **slice_flags** *integer*
- **mbd** *integer* (*encoding,video*): Set macroblock decision algorithm.
    - `simple`, `bits`, `rd`.
- **rc_init_occupancy** *integer* (*encoding,video*): Set number of bits which should be loaded into the rc buffer before decoding starts.
- **flags2** *flags* (*decoding/encoding,audio,video,subtitles*):
    - `fast`, `noout`, `ignorecrop`, `local_header`, `chunks`, `showall`, `export_mvs`, `skip_manual`, `ass_ro_flush_noop`, `icc_profiles`.
- **export_side_data** *flags* (*decoding/encoding,audio,video,subtitles*):
    - `mvs`, `prft`, `venc_params`, `film_grain`, `enhancements`.
- **threads** *integer* (*decoding/encoding,video*): Set the number of threads. Default is `auto`.
- **dc** *integer* (*encoding,video*): Set intra_dc_precision.
- **nssew** *integer* (*encoding,video*): Set nsse weight.
- **skip_top** *integer* (*decoding,video*): Set number of macroblock rows at the top which are skipped.
- **skip_bottom** *integer* (*decoding,video*): Set number of macroblock rows at the bottom which are skipped.
- **profile** *integer* (*encoding,audio,video*): Set encoder codec profile.
- **level** *integer* (*encoding,audio,video*): Set the encoder level.
- **lowres** *integer* (*decoding,audio,video*): Decode at 1/2, 1/4, 1/8 resolutions.
- **mblmin** *integer* (*encoding,video*): Set min macroblock lagrange factor (VBR).
- **mblmax** *integer* (*encoding,video*): Set max macroblock lagrange factor (VBR).
- **skip_loop_filter**, **skip_idct**, **skip_frame** *integer* (*decoding,video*): Discard processing depending on frame type.
    - `none`, `default`, `noref`, `bidir`, `nokey`, `nointra`, `all`.
- **bidir_refine** *integer* (*encoding,video*): Refine the two motion vectors used in bidirectional macroblocks.
- **keyint_min** *integer* (*encoding,video*): Set minimum interval between IDR-frames.
- **refs** *integer* (*encoding,video*): Set reference frames to consider for motion compensation.
- **trellis** *integer* (*encoding,audio,video*): Set rate-distortion optimal quantization.
- **mv0_threshold** *integer*
- **compression_level** *integer*
- **bits_per_raw_sample** *integer*
- **channel_layout** *integer* (*decoding/encoding,audio*)
- **rc_max_vbv_use** *float*
- **rc_min_vbv_use** *float*
- **color_primaries** *integer* (*decoding/encoding,video*):
    - `bt709`, `bt470m`, `bt470bg`, `smpte170m`, `smpte240m`, `film`, `bt2020`, `smpte428`, `smpte431`, `smpte432`, `jedec-p22`.
- **color_trc** *integer* (*decoding/encoding,video*):
    - `bt709`, `gamma22`, `gamma28`, `smpte170m`, `smpte240m`, `linear`, `log`, `log_sqrt`, `iec61966_2_4`, `bt1361`, `iec61966_2_1`, `bt2020_10`, `bt2020_12`, `smpte2084`, `arib-std-b67`.
- **colorspace** *integer* (*decoding/encoding,video*):
    - `rgb`, `bt709`, `fcc`, `bt470bg`, `smpte170m`, `smpte240m`, `ycocg`, `bt2020nc`, `bt2020c`, `smpte2085`, `chroma-derived-nc`, `chroma-derived-c`, `ictcp`.
- **color_range** *integer* (*decoding/encoding,video*):
    - `tv`/`mpeg`/`limited`, `pc`/`jpeg`/`full`.
- **chroma_sample_location** *integer*: `left`, `center`, `topleft`, `top`, `bottomleft`, `bottom`.
- **alpha_mode** *integer*: `premultiplied`, `straight`.
- **log_level_offset** *integer*
- **slices** *integer* (*encoding,video*): Number of slices for parallelized encoding.
- **thread_type** *flags* (*decoding/encoding,video*): `slice`, `frame`. Default is `slice+frame`.
- **audio_service_type** *integer*: `ma`, `ef`, `vi`, `hi`, `di`, `co`, `em`, `vo`, `ka`.
- **request_sample_fmt** *sample_fmt* (*decoding,audio*)
- **pkt_timebase** *rational number*
- **sub_charenc** *encoding* (*decoding,subtitles*)
- **field_order** *field_order* (*video*): `progressive`, `tt`, `bb`, `tb`, `bt`.
- **skip_alpha** *bool* (*decoding,video*): Set to 1 to disable alpha processing. Default 0.
- **codec_whitelist** *list* (*input*): Separated list of allowed decoders.
- **dump_separator** *string* (*input*): Separator for command line fields.
- **max_pixels** *integer* (*decoding/encoding,video*): Maximum pixels per image to avoid OOM.
- **apply_cropping** *bool* (*decoding,video*): Enable cropping. Default 1.

## 3 Decoders

Decoders are elements in FFmpeg that allow the decoding of multimedia streams. Native decoders are enabled by default. External library decoders must be enabled via `--enable-lib`.

Use `ffmpeg -decoders` to see the list of enabled decoders.

## 4 Video Decoders

### 4.1 av1
AOMedia Video 1 (AV1) decoder.

#### 4.1.1 Options
- **operating_point**: Select an operating point of a scalable AV1 bitstream (0 - 31). Default is 0.

### 4.2 hevc
HEVC (H.265) decoder. Supports MV-HEVC multiview streams (max two views).

#### 4.2.1 Options
- **view_ids (MV-HEVC)**: List of view IDs to output. Set to '-1' for all views.
- **view_ids_available (MV-HEVC)**: Read-only array of view IDs available in the active VPS.
- **view_pos_available (MV-HEVC)**: Read-only array of view positions (left, right, unspecified).

### 4.3 rawvideo
Raw video decoder.

#### 4.3.1 Options
- **top**: Assumed field type. -1 (progressive, default), 0 (bottom-field-first), 1 (top-field-first).

### 4.4 libdav1d
dav1d AV1 decoder. Requires `--enable-libdav1d`.

#### 4.4.1 Options
- **max_frame_delay**: Max frames buffered. Default 0 (autodetect).
- **filmgrain**: Apply film grain. (Deprecated, use `export_side_data`).
- **oppoint**: Select operating point (0 - 31).
- **alllayers**: Output all spatial layers. Default false.

### 4.5 libdavs2
AVS2-P2/IEEE1857.4 video decoder wrapper using davs2.

### 4.6 libuavs3d
AVS3-P2/IEEE1857.10 video decoder. Requires `--enable-libuavs3d`.

#### 4.6.1 Options
- **frame_threads**: Set amount of frame threads. Default 0 (autodetect).

### 4.7 libxevd
MPEG-5 EVC decoder wrapper using libxevd. Requires `--enable-libxevd`.

#### 4.7.1 Options
- **threads**: Force specific number of threads.

### 4.8 QSV Decoders
Intel QuickSync Video decoders (VC1, MPEG-2, H.264, HEVC, JPEG, VP8, VP9, AV1, VVC).

#### 4.8.1 Common Options
- **async_depth**: Internal parallelization depth.
- **gpu_copy**: GPU-accelerated copy between video and system memory (`default`, `on`, `off`).

#### 4.8.2 HEVC Options
- **load_plugin**: `none`, `hevc_sw`, `hevc_hw`.
- **load_plugins**: List of hexadecimal plugin UIDs.

### 4.9 v210
Uncompressed 4:2:2 10-bit decoder.

#### 4.9.1 Options
- **custom_stride**: Line size in bytes. Default 0 (autodetect). Use -1 for strideless.

## 5 Audio Decoders

### 5.1 ac3
AC-3 audio decoder.

#### 5.1.1 AC-3 Decoder Options
- **-drc_scale**: Dynamic Range Scale Factor. 0 (disabled), 0-1 (fractional DRC), >1 (asymmetric enhancement).

### 5.2 flac
FLAC audio decoder.

#### 5.2.1 FLAC Decoder options
- **-use_buggy_lpc**: Decodes buggy streams produced by old lavc encoders.

### 5.3 ffwavesynth
Internal wave synthesizer.

### 5.4 libcelt
Xiph CELT decoder wrapper. Requires `--enable-libcelt`.

### 5.5 libgsm
GSM full rate decoder wrapper. Requires `--enable-libgsm`. Supports Microsoft variant.

### 5.6 libilbc
Internet Low Bitrate Codec (iLBC) decoder. Requires `--enable-libilbc`.

#### 5.6.1 Options
- **enhance**: Enable enhancement of decoded audio. Default 0.

### 5.7 libmpeghdec
MPEG-H 3D audio decoder. Requires `--enable-libmpeghdec --enable-nonfree`.

### 5.8 libopencore-amrnb
AMR-NB decoder wrapper. Requires `--enable-libopencore-amrnb`.

### 5.9 libopencore-amrwb
AMR-WB decoder wrapper. Requires `--enable-libopencore-amrwb`.

### 5.10 libopus
Opus decoder wrapper. Requires `--enable-libopus`.

## 6 Subtitles Decoders

### 6.1 libaribb24
ARIB STD-B24 caption decoder.

#### 6.1.1 libaribb24 Decoder Options
- **-aribb24-base-path**: Base path for config files and symbol dumping.
- **-aribb24-skip-ruby-text**: Skip half-height ruby text. Default enabled.

### 6.2 libaribcaption
ARIB STD-B24 caption decoder using libaribcaption. Requires `--enable-libaribcaption`.

#### 6.2.1 libaribcaption Decoder Options
- **-sub_type**: `bitmap`, `ass`, `text`. Default `ass`.
- **-caption_encoding**: `auto`, `jis`, `utf8`, `latin`.
- **-font**: Comma-separated list of font family names.
- **-ass_single_rect**: Display all text in a single ASS rectangle. Default false.
- **-force_outline_text**: Always render outline text. Default false.
- **-outline_width**: Outline width in dots (0.0 - 3.0). Default 1.5.
- **-ignore_background**: Ignore background rendering. Default false.
- **-ignore_ruby**: Ignore ruby characters. Default false.
- **-replace_drcs**: Render replaced DRCS as Unicode. Default true.
- **-replace_msz_ascii**: Replace MSZ fullwidth alphanumerics. Default true.
- **-replace_msz_japanese**: Replace MSZ fullwidth Japanese characters. Default true.
- **-replace_msz_glyph**: Replace MSZ with halfwidth glyphs. Default true.
- **-canvas_size**: Resolution of the canvas for bitmap rendering.

#### 6.2.2 libaribcaption decoder usage examples
```bash
ffplay -sub_type bitmap MPEG.TS
ffplay -sub_type bitmap -canvas_size 1920x1080 MPEG.TS
ffmpeg -sub_type bitmap -i src.m2t -filter_complex "[0:v][0:s]overlay" -vcodec h264 dest.mp4
```

### 6.3 dvbsub
#### 6.3.1 Options
- **compute_clut**: CLUT computation strategy (-2 to 1).
- **dvb_substream**: Select substream ID. Default -1 (all).

### 6.4 dvdsub
#### 6.4.1 Options
- **palette**: 16 24-bits hex numbers separated by commas.
- **ifo_palette**: Specify IFO file for palette.
- **forced_subs_only**: Only decode forced entries. Default 0.

### 6.5 libzvbi-teletext
Requires `--enable-libzvbi`.

#### 6.5.1 Options
- **txt_page**: Page numbers to decode (e.g., `*`, `subtitle`).
- **txt_default_region**: Default character set (0-87).
- **txt_chop_top**: Discard top line. Default 1.
- **txt_format**: `bitmap`, `text`, `ass`.
- **txt_left/txt_top**: Bitmap offsets.
- **txt_chop_spaces**: Remove leading/trailing spaces. Default 1.
- **txt_duration**: Display duration in ms.
- **txt_transparent**: Force transparent background.
- **txt_opacity**: Background opacity (0-255).

## 7 Encoders

Encoders allow the encoding of multimedia streams. Native encoders are enabled by default. External encoders require `--enable-lib`.

Use `ffmpeg -encoders` to see the list of enabled encoders.

## 8 Audio Encoders

### 8.1 aac
Native FFmpeg AAC encoder.

#### 8.1.1 Options
- **b**: Bitrate in bits/s (activates CBR). Default 128kbps.
- **q**: Quality for VBR mode.
- **cutoff**: Cutoff frequency.
- **aac_coder**: `twoloop` (default), `anmr`, `fast`.
- **aac_ms**: Mid/side coding (`auto`, `enable`, `disable`).
- **aac_is**: Intensity stereo coding.
- **aac_pns**: Perceptual noise substitution.
- **aac_tns**: Temporal noise shaping.
- **aac_ltp**: Long term prediction.
- **profile**: `aac_low` (default), `mpeg2_aac_low`, `aac_ltp`.

### 8.2 ac3 and ac3_fixed
#### 8.2.1 AC-3 Metadata
- **-per_frame_metadata**: Allow changing metadata per frame.
- **-center_mixlev**: Center downmix gain (0.707, 0.595, 0.500).
- **-surround_mixlev**: Surround downmix gain (0.707, 0.500, 0.000).
- **-mixing_level**: Mixing environment SPL (80 to 111).
- **-room_type**: `notindicated`, `large`, `small`.
- **-copyright**: 0 (off), 1 (on).
- **-dialnorm**: Dialogue Normalization (-31 to -1). Default -31.
- **-dsur_mode**: Dolby Surround Mode (0, 1, 2).
- **-original**: 0 (off), 1 (on).

#### 8.2.2 Extended Bitstream Information
- **-dmix_mode**: Preferred Stereo Downmix Mode (`notindicated`, `ltrt`, `loro`).
- **-ltrt_cmixlev / -ltrt_surmixlev**: Lt/Rt downmix levels.
- **-loro_cmixlev / -loro_surmixlev**: Lo/Ro downmix levels.
- **-dsurex_mode**: Dolby Surround EX Mode.
- **-dheadphone_mode**: Dolby Headphone Mode.
- **-ad_conv_type**: A/D Converter Type (`standard`, `hdcd`).

#### 8.2.3 Other AC-3 Encoding Options
- **-stereo_rematrixing**: Enable/disable stereo rematrixing.
- **cutoff**: Lowpass cutoff frequency.

#### 8.2.4 Floating-Point-Only AC-3 Encoding Options
- **-channel_coupling**: Enable/disable channel coupling (`auto`, `off`, `on`).
- **-cpl_start_band**: Coupling start band (1 to 15).

### 8.3 flac
#### 8.3.1 Options
- **compression_level**: 0 to 12. Default 5.
- **frame_size**: Samples per channel.
- **lpc_coeff_precision**: 1 to 15. Default 15.
- **lpc_type**: `none`, `fixed`, `levinson`, `cholesky`.
- **lpc_passes**: For Cholesky factorization.
- **min_partition_order / max_partition_order**
- **prediction_order_method**: `estimation`, `2level`, `4level`, `8level`, `search`, `log`.
- **ch_mode**: `auto`, `indep`, `left_side`, `right_side`, `mid_side`.
- **exact_rice_parameters**: 0 or 1.
- **multi_dim_quant**: Finetune coefficients.

### 8.4 opus
Native FFmpeg Opus encoder (CELT only).

#### 8.4.1 Options
- **b**: Bitrate in bits/s.
- **opus_delay**: Max delay in ms.

### 8.5 libfdk_aac
Requires `--enable-libfdk-aac`. Supports AAC-HE.

#### 8.5.1 Options
- **b**: Bitrate. Ignored in VBR mode.
- **profile**: `aac_low`, `aac_he`, `aac_he_v2`, `aac_ld`, `aac_eld`.
- **afterburner**: 0 or 1. Default 1.
- **vbr**: 1 to 5. 0 disables VBR.
- **latm**: Output LATM/LOAS.

#### 8.5.2 Examples
```bash
ffmpeg -i input.wav -codec:a libfdk_aac -vbr 3 output.m4a
ffmpeg -i input.wav -c:a libfdk_aac -profile:a aac_he -b:a 64k output.m4a
```

### 8.6 liblc3
Bluetooth SIG LC3 encoder. Requires `--enable-liblc3`.

#### 8.6.1 Options
- **frame_duration**: 2.5ms, 5ms, 7.5ms, 10ms. Default 10ms.
- **high_resolution**: Enable high-res mode (48/96 kHz).

### 8.7 libmp3lame
LAME MP3 encoder. Requires `--enable-libmp3lame`.

#### 8.7.1 Options
- **b**: Bitrate for CBR/ABR.
- **q**: Constant quality for VBR (0-9).
- **compression_level**: Algorithm quality (0-9).
- **reservoir**: Enable bit reservoir. Default 1.
- **joint_stereo**: Default 1.

### 8.8 libopencore-amrnb
AMR-NB encoder. Mono-only, 8000Hz.

#### 8.8.1 Options
- **b**: Supported bitrates: 4750, 5150, 5900, 6700, 7400, 7950, 10200, 12200.
- **dtx**: Discontinuous transmission. Default 0.

### 8.9 libopus
#### 8.9.1 Option Mapping
- **vbr**: `off`, `on`, `constrained`.
- **application**: `voip`, `audio`, `lowdelay`.
- **frame_duration**: 2.5, 5, 10, 20, 40, 60 ms.

### 8.10 libshine
Fixed-Point MP3 encoder. CBR-only.

### 8.11 libtwolame
MP2 encoder.

#### 8.11.1 Options
- **mode**: `auto`, `stereo`, `joint_stereo`, `dual_channel`, `mono`.
- **psymodel**: Psychoacoustic model ( -1 to 4). Default 3.

### 8.12 libvo-amrwbenc
AMR-WB encoder. Mono-only, 16000Hz.

### 8.13 libvorbis
#### 8.13.1 Options
- **q**: Quality (-1.0 to 10.0). Default 3.0.

### 8.14 mjpeg
#### 8.14.1 Options
- **huffman**: `default`, `optimal`.

### 8.15 wavpack
#### 8.15.1 Options
- **joint_stereo**: `on`, `off`, `auto`.
- **optimize_mono**: `on`, `off`.

## 9 Video Encoders

### 9.1 a64_multi, a64_multi5
Commodore 64 multicolor charset encoder.

### 9.2 Cinepak
#### 9.2.1 Options
- **g**: Keyframe interval.
- **q:v**: Quality factor (lower is better).
- **max_strips / min_strips**: Strips per frame (Vintage compatible: 1..3).

### 9.3 ffv1
#### 9.3.1 Options
- **coder**: `rice`, `range_def`, `range_tab`.
- **context**: 0 (small), 1 (big).

### 9.4 GIF
#### 9.4.1 Options
- **gifflags**: `offsetting`, `transdiff`.
- **gifimage**: Encode one full image per frame.

### 9.5 Hap
#### 9.5.1 Options
- **format**: `hap`, `hap_alpha`, `hap_q`.
- **chunks**: 1 to 64.
- **compressor**: `none`, `snappy`.

### 9.6 jpeg2000
#### 9.6.1 Options
- **pred**: `dwt97int` (Lossy), `dwt53` (Lossless).
- **layer_rates**: Compression ratio per layer (e.g., "100,10,1").

### 9.7 librav1e
#### 9.7.1 Options
- **speed**: 0-10.
- **rav1e-params**: List of key=value pairs.

### 9.8 libaom-av1
#### 9.8.1 Options
- **cpu-used**: 0 to 8. Default 1.
- **crf**: 0 to 63.
- **tiles**: columns x rows.
- **denoise-noise-level**: For grain synthesis.

### 9.9 liboapv
Advanced Professional Video (APV) encoder.

#### 9.9.1 Options
- **preset**: `fastest`, `fast`, `medium`, `slow`, `placebo`, `default`.
- **qp**: Quantization parameter for CQP.

### 9.10 libsvtav1
#### 9.10.1 Options
- **preset**: 0 to 13.
- **svtav1-params**: List of key=value pairs.

### 9.11 libsvtjpegxs
#### 9.11.1 Options
- **quantization**: `deadzone`, `uniform`.

### 9.12 libjxl
#### 9.12.1 Options
- **distance**: Quality setting (0.0 is lossless). Default 1.0.
- **effort**: 1 to 9. Default 7.

### 9.13 libkvazaar
#### 9.13.1 Options
- **kvazaar-params**: Comma-separated key=value pairs.

### 9.14 libopenh264
#### 9.14.1 Options
- **allow_skip_frames**: 0 or 1.

### 9.15 libtheora
#### 9.15.1 Options
- **q**: Quality (0-10).

### 9.16 libvpx
#### 9.16.1 Options
- **deadline**: `best`, `good`, `realtime`.
- **ts-parameters**: Temporal scalability config.

### 9.17 libvvenc
#### 9.17.1 Supported Pixel Formats
Supports 10-bit color spaces.

#### 9.17.2 Options
- **vvenc-params**: Colon-separated key=value pairs.

### 9.18 libwebp
#### 9.18.2 Options
- **-lossless**: 0 or 1.
- **-preset**: `none`, `default`, `picture`, `photo`, `drawing`, `icon`, `text`.

### 9.19 libx264, libx264rgb
#### 9.19.2 Options
- **preset**: `ultrafast`, `superfast`, `veryfast`, `faster`, `fast`, `medium`, `slow`, `slower`, `veryslow`, `placebo`.
- **tune**: `film`, `animation`, `grain`, `stillimage`, `psnr`, `ssim`, `fastdecode`, `zerolatency`.
- **x264-params**: Colon-separated key=value pairs.

### 9.20 libx265
#### 9.20.1 Options
- **x265-params**: Colon-separated key=value pairs.

### 9.21 libxavs2
#### 9.21.1 Options
- **speed_level**: 0 to 9. Default 0.

### 9.22 libxeve
#### 9.22.1 Options
- **crf**: 10 to 49. Default 32.

### 9.23 libxvid
#### 9.23.1 Options
- **me_quality**: 0 to 6.
- **mbd**: `simple`, `bits`, `rd`.

### 9.24 MediaCodec
Android hardware-accelerated encoding.
- **ndk_codec**: Use NDK API.
- **bitrate_mode**: `cq`, `vbr`, `cbr`, `cbr_fd`.

### 9.25 MediaFoundation
Windows hardware encoding (h264_mf, hevc_mf, av1_mf).
- **rate_control**: `cbr`, `pc_vbr`, `u_vbr`, `quality`, etc.

### 9.26 Microsoft RLE
8-bit palette mode only.

### 9.27 mpeg2
#### 9.27.1 Options
- **profile**: `422`, `high`, `ss`, `snr`, `main`, `simple`.

### 9.28 png
#### 9.28.2 Private options
- **pred**: `none`, `sub`, `up`, `avg`, `paeth`, `mixed`.

### 9.29 ProRes
#### 9.29.1 Private Options for prores-ks
- **profile**: `proxy`, `lt`, `standard`, `hq`, `4444`, `4444xq`.

### 9.30 QSV Encoders
Intel QuickSync Video encoders.

#### 9.30.1 Ratecontrol Method
- **CQP**, **ICQ**, **LA_ICQ** (Quality-based).
- **CBR**, **VBR**, **LA**, **VCM**, **AVBR** (Bitrate-based).

#### 9.30.4 Runtime Options
- **qsv_params**: Colon-separated key-value pairs (e.g., `CodingOption1=1`).

#### 9.30.5 H264 options
- **cavlc**: Use CAVLC instead of CABAC.
- **look_ahead**: Use VBR algorithm with look ahead.

#### 9.30.6 HEVC Options
- **load_plugin**: `hevc_sw`, `hevc_hw`.
- **tier**: `main`, `high`.

### 9.31 snow
#### 9.31.1 Options
- **iterative_dia_size**: dia size for iterative motion estimation.

### 9.32 VAAPI encoders
Hardware encoders via VAAPI.
- **rc_mode**: `CQP`, `CBR`, `VBR`, `ICQ`, `QVBR`, `AVBR`.
- **low_power**: Attempt to use low-power encoder.

### 9.33 vbn
Vizrt Binary Image encoder.
- **format**: `dxt1`, `dxt5`, `raw`.

### 9.34 vc2
SMPTE VC-2 (Dirac Pro).
- **wavelet_depth**: 1 to 5.
- **qm**: `default`, `flat`, `color`.

## 10 Subtitles Encoders

### 10.1 dvbsub
#### 10.1.1 Options
- **min_bpp**: 2, 4, or 8. Default 4.

### 10.2 dvdsub
#### 10.2.1 Options
- **palette**: 16 24-bits hex numbers.
- **even_rows_fix**: Add a transparent row if needed for even row count.

### 10.3 lrc
#### 10.3.1 Options
- **precision**: Fractional part of timestamp. Default 2 (centiseconds).