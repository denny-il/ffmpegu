---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: Video Scaling and Pixel Format Converter
Source: https://ffmpeg.org/ffmpeg-scaler.html
---

# FFmpeg Rescaler

- [1 Description](#1-description)
- [2 Scaler Options](#2-scaler-options)

## 1 Description

The FFmpeg rescaler provides a high-level interface to the libswscale library image conversion utilities. In particular it allows one to perform image rescaling and pixel format conversion.

## 2 Scaler Options

The video scaler supports the following named options.

Options may be set by specifying -`option` `value` in the FFmpeg tools, with a few API-only exceptions noted below. For programmatic use, they can be set explicitly in the `SwsContext` options or through the `libavutil/opt.h` API.

*   **sws_flags**
    Set the scaler flags. This is also used to set the scaling algorithm. Only a single algorithm should be selected. Default value is ‘bicubic’.

    It accepts the following values:
    *   **fast_bilinear**: Select fast bilinear scaling algorithm.
    *   **bilinear**: Select bilinear scaling algorithm.
    *   **bicubic**: Select bicubic scaling algorithm.
    *   **experimental**: Select experimental scaling algorithm.
    *   **neighbor**: Select nearest neighbor rescaling algorithm.
    *   **area**: Select averaging area rescaling algorithm.
    *   **bicublin**: Select bicubic scaling algorithm for the luma component, bilinear for chroma components.
    *   **gauss**: Select Gaussian rescaling algorithm.
    *   **sinc**: Select sinc rescaling algorithm.
    *   **lanczos**: Select Lanczos rescaling algorithm. The default width (alpha) is 3 and can be changed by setting `param0`.
    *   **spline**: Select natural bicubic spline rescaling algorithm.
    *   **print_info**: Enable printing/debug logging.
    *   **accurate_rnd**: Enable accurate rounding.
    *   **full_chroma_int**: Enable full chroma interpolation.
    *   **full_chroma_inp**: Select full chroma input.
    *   **bitexact**: Enable bitexact output.
    *   **unstable**: Allow the use of experimental new code. May subtly affect the output or even produce wrong results. For testing only.

*   **srcw (API only)**
    Set source width.

*   **srch (API only)**
    Set source height.

*   **dstw (API only)**
    Set destination width.

*   **dsth (API only)**
    Set destination height.

*   **src_format (API only)**
    Set source pixel format (must be expressed as an integer).

*   **dst_format (API only)**
    Set destination pixel format (must be expressed as an integer).

*   **src_range (boolean)**
    If value is set to `1`, indicates source is full range. Default value is `0`, which indicates source is limited range.

*   **dst_range (boolean)**
    If value is set to `1`, enable full range for destination. Default value is `0`, which enables limited range.

*   **gamma (boolean)**
    If value is set to `1`, enable gamma correct scaling. Default value is `0`.

*   **param0, param1**
    Set scaling algorithm parameters. The specified values are specific of some scaling algorithms and ignored by others. The specified values are floating point number values.

*   **sws_dither**
    Set the dithering algorithm. Accepts one of the following values. Default value is ‘auto’.
    *   **auto**: automatic choice
    *   **none**: no dithering
    *   **bayer**: bayer dither
    *   **ed**: error diffusion dither
    *   **a_dither**: arithmetic dither, based using addition
    *   **x_dither**: arithmetic dither, based using xor (more random/less apparent patterning that a_dither).

*   **alphablend**
    Set the alpha blending to use when the input has alpha but the output does not. Default value is ‘none’.
    *   **uniform_color**: Blend onto a uniform background color
    *   **checkerboard**: Blend onto a checkerboard
    *   **none**: No blending