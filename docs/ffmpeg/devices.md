---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: Input and Output Devices
Source: https://ffmpeg.org/ffmpeg-devices.html
---

# FFmpeg Devices

- [1 Description](#1-description)
- [2 Device Options](#2-device-options)
- [3 Input Devices](#3-input-devices)
- [4 Output Devices](#4-output-devices)

## 1 Description

This document describes the input and output devices provided by the libavdevice library.

## 2 Device Options

The libavdevice library provides the same interface as libavformat. Namely, an input device is considered like a demuxer, and an output device like a muxer, and the interface and generic device options are the same provided by libavformat (see the ffmpeg-formats manual).

In addition each input or output device may support so-called private options, which are specific for that component.

Options may be set by specifying -*option* *value* in the FFmpeg tools, or by setting the value explicitly in the device `AVFormatContext` options or using the `libavutil/opt.h` API for programmatic use.

## 3 Input Devices

Input devices are configured elements in FFmpeg which enable accessing the data coming from a multimedia device attached to your system.

When you configure your FFmpeg build, all the supported input devices are enabled by default. You can list all available ones using the configure option "--list-indevs".

You can disable all the input devices using the configure option "--disable-indevs", and selectively enable an input device using the option "--enable-indev=*INDEV*", or you can disable a particular input device using the option "--disable-indev=*INDEV*".

The option "-devices" of the ff* tools will display the list of supported input devices.

A description of the currently available input devices follows.

### 3.1 alsa

ALSA (Advanced Linux Sound Architecture) input device.

To enable this input device during configuration you need libasound installed on your system.

This device allows capturing from an ALSA device. The name of the device to capture has to be an ALSA card identifier.

An ALSA identifier has the syntax:

```
hw:CARD[,DEV[,SUBDEV]]
```

where the *DEV* and *SUBDEV* components are optional.

The three arguments (in order: *CARD*, *DEV*, *SUBDEV*) specify card number or identifier, device number and subdevice number (-1 means any).

To see the list of cards currently recognized by your system check the files `/proc/asound/cards` and `/proc/asound/devices`.

For example to capture with `ffmpeg` from an ALSA device with card id 0, you may run the command:

```
ffmpeg -f alsa -i hw:0 alsaout.wav
```

For more information see: [http://www.alsa-project.org/alsa-doc/alsa-lib/pcm.html](http://www.alsa-project.org/alsa-doc/alsa-lib/pcm.html)

#### 3.1.1 Options

*   **sample_rate**: Set the sample rate in Hz. Default is 48000.
*   **channels**: Set the number of channels. Default is 2.

### 3.2 android_camera

Android camera input device.

This input devices uses the Android Camera2 NDK API which is available on devices with API level 24+. The availability of android_camera is autodetected during configuration.

This device allows capturing from all cameras on an Android device, which are integrated into the Camera2 NDK API.

The available cameras are enumerated internally and can be selected with the *camera_index* parameter. The input file string is discarded.

Generally the back facing camera has index 0 while the front facing camera has index 1.

#### 3.2.1 Options

*   **video_size**: Set the video size given as a string such as 640x480 or hd720. Falls back to the first available configuration reported by Android if requested video size is not available or by default.
*   **framerate**: Set the video framerate. Falls back to the first available configuration reported by Android if requested framerate is not available or by default (-1).
*   **camera_index**: Set the index of the camera to use. Default is 0.
*   **input_queue_size**: Set the maximum number of frames to buffer. Default is 5.

### 3.3 avfoundation

AVFoundation input device.

AVFoundation is the currently recommended framework by Apple for streamgrabbing on OSX >= 10.7 as well as on iOS.

The input filename has to be given in the following syntax:

```
-i "[[VIDEO]:[AUDIO]]"
```

The first entry selects the video input while the latter selects the audio input. The stream has to be specified by the device name or the device index as shown by the device list. Alternatively, the video and/or audio input device can be chosen by index using the `-video_device_index <INDEX>` and/or `-audio_device_index <INDEX>`, overriding any device name or index given in the input filename.

All available devices can be enumerated by using `-list_devices true`, listing all device names and corresponding indices.

There are two device name aliases:

*   **default**: Select the AVFoundation default device of the corresponding type.
*   **none**: Do not record the corresponding media type. This is equivalent to specifying an empty device name or index.

#### 3.3.1 Options

*   **-list_devices <TRUE|FALSE>**: If set to true, a list of all available input devices is given showing all device names and indices.
*   **-video_device_index <INDEX>**: Specify the video device by its index. Overrides anything given in the input filename.
*   **-audio_device_index <INDEX>**: Specify the audio device by its index. Overrides anything given in the input filename.
*   **-pixel_format <FORMAT>**: Request the video device to use a specific pixel format. If the specified format is not supported, a list of available formats is given and the first one in this list is used instead. Available pixel formats are: `monob, rgb555be, rgb555le, rgb565be, rgb565le, rgb24, bgr24, 0rgb, bgr0, 0bgr, rgb0, bgr48be, uyvy422, yuva444p, yuva444p16le, yuv444p, yuv422p16, yuv422p10, yuv444p10, yuv420p, nv12, yuyv422, gray`
*   **-framerate**: Set the grabbing frame rate. Default is `ntsc`, corresponding to a frame rate of `30000/1001`.
*   **-video_size**: Set the video frame size.
*   **-capture_cursor**: Capture the mouse pointer. Default is 0.
*   **-capture_mouse_clicks**: Capture the screen mouse clicks. Default is 0.
*   **-capture_raw_data**: Capture the raw device data. Default is 0. Using this option may result in receiving the underlying data delivered to the AVFoundation framework. E.g. for muxed devices that sends raw DV data to the framework (like tape-based camcorders), setting this option to false results in extracted video frames captured in the designated pixel format only. Setting this option to true results in receiving the raw DV stream untouched.

#### 3.3.2 Examples

*   Print the list of AVFoundation supported devices and exit:
    ```
    $ ffmpeg -f avfoundation -list_devices true -i ""
    ```
*   Record video from video device 0 and audio from audio device 0 into out.avi:
    ```
    $ ffmpeg -f avfoundation -i "0:0" out.avi
    ```
*   Record video from video device 2 and audio from audio device 1 into out.avi:
    ```
    $ ffmpeg -f avfoundation -video_device_index 2 -i ":1" out.avi
    ```
*   Record video from the system default video device using the pixel format bgr0 and do not record any audio into out.avi:
    ```
    $ ffmpeg -f avfoundation -pixel_format bgr0 -i "default:none" out.avi
    ```
*   Record raw DV data from a suitable input device and write the output into out.dv:
    ```
    $ ffmpeg -f avfoundation -capture_raw_data true -i "zr100:none" out.dv
    ```

### 3.4 decklink

The decklink input device provides capture capabilities for Blackmagic DeckLink devices.

To enable this input device, you need the Blackmagic DeckLink SDK and you need to configure with the appropriate `--extra-cflags` and `--extra-ldflags`. On Windows, you need to run the IDL files through `widl`.

DeckLink is very picky about the formats it supports. Pixel format of the input can be set with `raw_format`. Framerate and video size must be determined for your device with `-list_formats 1`. Audio sample rate is always 48 kHz and the number of channels can be 2, 8 or 16. Note that all audio channels are bundled in one single audio track.

#### 3.4.1 Options

*   **list_devices**: If set to `true`, print a list of devices and exit. Defaults to `false`. This option is deprecated, please use the `-sources` option of ffmpeg to list the available input devices.
*   **list_formats**: If set to `true`, print a list of supported formats and exit. Defaults to `false`.
*   **format_code <FourCC>**: This sets the input video format to the format given by the FourCC. To see the supported values of your device(s) use `list_formats`. Note that there is a FourCC `'pal '` that can also be used as `pal` (3 letters). Default behavior is autodetection of the input video format, if the hardware supports it.
*   **raw_format**: Set the pixel format of the captured video. Available values are:
    *   **‘auto’**: This is the default which means 8-bit YUV 422 or 8-bit ARGB if format autodetection is used, 8-bit YUV 422 otherwise.
    *   **‘uyvy422’**: 8-bit YUV 422.
    *   **‘yuv422p10’**: 10-bit YUV 422.
    *   **‘argb’**: 8-bit RGB.
    *   **‘bgra’**: 8-bit RGB.
    *   **‘rgb10’**: 10-bit RGB.
*   **teletext_lines**: If set to nonzero, an additional teletext stream will be captured from the vertical ancillary data. Both SD PAL (576i) and HD (1080i or 1080p) sources are supported. In case of HD sources, OP47 packets are decoded. This option is a bitmask of the SD PAL VBI lines captured, specifically lines 6 to 22, and lines 318 to 335. Line 6 is the LSB in the mask. Selected lines which do not contain teletext information will be ignored. You can use the special `all` constant to select all possible lines, or `standard` to skip lines 6, 318 and 319, which are not compatible with all receivers. For SD sources, ffmpeg needs to be compiled with `--enable-libzvbi`. For HD sources, on older (pre-4K) DeckLink card models you have to capture in 10 bit mode.
*   **channels**: Defines number of audio channels to capture. Must be ‘2’, ‘8’ or ‘16’. Defaults to ‘2’.
*   **duplex_mode**: Sets the decklink device duplex/profile mode. Must be ‘unset’, ‘half’, ‘full’, ‘one_sub_device_full’, ‘one_sub_device_half’, ‘two_sub_device_full’, ‘four_sub_device_half’. Defaults to ‘unset’.
    *   Note: DeckLink SDK 11.0 have replaced the duplex property by a profile property. For the DeckLink Duo 2 and DeckLink Quad 2, a profile is shared between any 2 sub-devices that utilize the same connectors. For the DeckLink 8K Pro, a profile is shared between all 4 sub-devices. So DeckLink 8K Pro support four profiles.
    *   Valid profile modes for DeckLink 8K Pro (with DeckLink SDK >= 11.0): ‘one_sub_device_full’, ‘one_sub_device_half’, ‘two_sub_device_full’, ‘four_sub_device_half’.
    *   Valid profile modes for DeckLink Quad 2 and DeckLink Duo 2: ‘half’, ‘full’.
*   **timecode_format**: Timecode type to include in the frame and video stream metadata. Must be ‘none’, ‘rp188vitc’, ‘rp188vitc2’, ‘rp188ltc’, ‘rp188hfr’, ‘rp188any’, ‘vitc’, ‘vitc2’, or ‘serial’. Defaults to ‘none’ (not included).
*   **video_input**: Sets the video input source. Must be ‘unset’, ‘sdi’, ‘hdmi’, ‘optical_sdi’, ‘component’, ‘composite’ or ‘s_video’. Defaults to ‘unset’.
*   **audio_input**: Sets the audio input source. Must be ‘unset’, ‘embedded’, ‘aes_ebu’, ‘analog’, ‘analog_xlr’, ‘analog_rca’ or ‘microphone’. Defaults to ‘unset’.
*   **video_pts**: Sets the video packet timestamp source. Must be ‘video’, ‘audio’, ‘reference’, ‘wallclock’ or ‘abs_wallclock’. Defaults to ‘video’.
*   **audio_pts**: Sets the audio packet timestamp source. Must be ‘video’, ‘audio’, ‘reference’, ‘wallclock’ or ‘abs_wallclock’. Defaults to ‘audio’.
*   **draw_bars**: If set to ‘true’, color bars are drawn in the event of a signal loss. Defaults to ‘true’. This option is deprecated, please use the `signal_loss_action` option.
*   **signal_loss_action**: Sets the action to take in the event of a signal loss. Accepts one of the following values:
    *   **1, none**: Do nothing on signal loss. This usually results in black frames.
    *   **2, bars**: Draw color bars on signal loss. Only supported for 8-bit input signals.
    *   **3, repeat**: Repeat the last video frame on signal loss.
    *   Defaults to ‘bars’.
*   **queue_size**: Sets maximum input buffer size in bytes. If the buffering reaches this value, incoming frames will be dropped. Defaults to ‘1073741824’.
*   **audio_depth**: Sets the audio sample bit depth. Must be ‘16’ or ‘32’. Defaults to ‘16’.
*   **decklink_copyts**: If set to `true`, timestamps are forwarded as they are without removing the initial offset. Defaults to `false`.
*   **timestamp_align**: Capture start time alignment in seconds. If set to nonzero, input frames are dropped till the system timestamp aligns with configured value. Alignment difference of up to one frame duration is tolerated. This is useful for maintaining input synchronization across N different hardware devices deployed for ’N-way’ redundancy. The system time of different hardware devices should be synchronized with protocols such as NTP or PTP, before using this option.
*   **wait_for_tc (bool)**: Drop frames till a frame with timecode is received. If this option is set to `true`, input frames are dropped till a frame with timecode is received. Option *timecode_format* must be specified. Defaults to `false`.
*   **enable_klv (bool)**: If set to `true`, extracts KLV data from VANC and outputs KLV packets. Defaults to `false`.

#### 3.4.2 Examples

*   List input devices:
    ```
    ffmpeg -sources decklink
    ```
*   List supported formats:
    ```
    ffmpeg -f decklink -list_formats 1 -i 'Intensity Pro'
    ```
*   Capture video clip at 1080i50:
    ```
    ffmpeg -format_code Hi50 -f decklink -i 'Intensity Pro' -c:a copy -c:v copy output.avi
    ```
*   Capture video clip at 1080i50 10 bit:
    ```
    ffmpeg -raw_format yuv422p10 -format_code Hi50 -f decklink -i 'UltraStudio Mini Recorder' -c:a copy -c:v copy output.avi
    ```
*   Capture video clip at 1080i50 with 16 audio channels:
    ```
    ffmpeg -channels 16 -format_code Hi50 -f decklink -i 'UltraStudio Mini Recorder' -c:a copy -c:v copy output.avi
    ```

### 3.5 dshow

Windows DirectShow input device.

DirectShow support is enabled when FFmpeg is built with the mingw-w64 project. Currently only audio and video devices are supported.

Multiple devices may be opened as separate inputs, but they may also be opened on the same input, which should improve synchronism between them.

The input name should be in the format:

```
TYPE=NAME[:TYPE=NAME]
```

where *TYPE* can be either *audio* or *video*, and *NAME* is the device’s name or alternative name.

#### 3.5.1 Options

If no options are specified, the device’s defaults are used. If the device does not support the requested options, it will fail to open.

*   **video_size**: Set the video size in the captured video.
*   **framerate**: Set the frame rate in the captured video.
*   **sample_rate**: Set the sample rate (in Hz) of the captured audio.
*   **sample_size**: Set the sample size (in bits) of the captured audio.
*   **channels**: Set the number of channels in the captured audio.
*   **list_devices**: If set to `true`, print a list of devices and exit.
*   **list_options**: If set to `true`, print a list of selected device’s options and exit.
*   **video_device_number**: Set video device number for devices with the same name (starts at 0, defaults to 0).
*   **audio_device_number**: Set audio device number for devices with the same name (starts at 0, defaults to 0).
*   **pixel_format**: Select pixel format to be used by DirectShow. This may only be set when the video codec is not set or set to rawvideo.
*   **audio_buffer_size**: Set audio device buffer size in milliseconds. Defaults to using the audio device’s default buffer size (typically some multiple of 500ms).
*   **video_pin_name**: Select video capture pin to use by name or alternative name.
*   **audio_pin_name**: Select audio capture pin to use by name or alternative name.
*   **crossbar_video_input_pin_number**: Select video input pin number for crossbar device.
*   **crossbar_audio_input_pin_number**: Select audio input pin number for crossbar device.
*   **show_video_device_dialog**: If set to `true`, before capture starts, popup a display dialog to the end user.
*   **show_audio_device_dialog**: If set to `true`, before capture starts, popup a display dialog to the end user.
*   **show_video_crossbar_connection_dialog**: If set to `true`, before capture starts, popup a display dialog to the end user for crossbar pin routings.
*   **show_audio_crossbar_connection_dialog**: If set to `true`, before capture starts, popup a display dialog to the end user for crossbar pin routings.
*   **show_analog_tv_tuner_dialog**: If set to `true`, before capture starts, popup a display dialog for TV channels.
*   **show_analog_tv_tuner_audio_dialog**: If set to `true`, before capture starts, popup a display dialog for TV audio.
*   **audio_device_load**: Load an audio capture filter device from file.
*   **audio_device_save**: Save the currently used audio capture filter device to a file.
*   **video_device_load**: Load a video capture filter device from file.
*   **video_device_save**: Save the currently used video capture filter device to a file.
*   **use_video_device_timestamps**: If set to `false`, the timestamp for video frames will be derived from the wallclock instead of the device timestamp.

#### 3.5.2 Examples

*   Print the list of DirectShow supported devices and exit:
    ```
    $ ffmpeg -list_devices true -f dshow -i dummy
    ```
*   Open video device *Camera*:
    ```
    $ ffmpeg -f dshow -i video="Camera"
    ```
*   Open second video device with name *Camera*:
    ```
    $ ffmpeg -f dshow -video_device_number 1 -i video="Camera"
    ```
*   Open video device *Camera* and audio device *Microphone*:
    ```
    $ ffmpeg -f dshow -i video="Camera":audio="Microphone"
    ```
*   Print the list of supported options in selected device and exit:
    ```
    $ ffmpeg -list_options true -f dshow -i video="Camera"
    ```

### 3.6 fbdev

Linux framebuffer input device.

The Linux framebuffer is a graphic hardware-independent abstraction layer to show graphics on a computer monitor, typically on the console. It is accessed through a file device node, usually `/dev/fb0`.

To record from the framebuffer device `/dev/fb0` with `ffmpeg`:

```
ffmpeg -f fbdev -framerate 10 -i /dev/fb0 out.avi
```

You can take a single screenshot image with the command:

```
ffmpeg -f fbdev -framerate 1 -i /dev/fb0 -frames:v 1 screenshot.jpeg
```

#### 3.6.1 Options

*   **framerate**: Set the frame rate. Default is 25.

### 3.7 gdigrab

Win32 GDI-based screen capture device.

This device allows you to capture a region of the display on Windows.

Amongst options for the input filenames are:
*   `desktop`
*   `title=window_title`
*   `hwnd=window_hwnd`

For example, to grab the entire desktop using `ffmpeg`:

```
ffmpeg -f gdigrab -framerate 6 -i desktop out.mpg
```

#### 3.7.1 Options

*   **draw_mouse**: Specify whether to draw the mouse pointer. Default value is `1`.
*   **framerate**: Set the grabbing frame rate. Default value is `ntsc`.
*   **show_region**: Show grabbed region on screen. Default is `0`.
*   **video_size**: Set the video frame size.
*   **offset_x**: Set distance from the left edge of the screen.
*   **offset_y**: Set distance from the top edge of the screen.

### 3.8 iec61883

FireWire DV/HDV input device using libiec61883.

To enable this input device, you need libiec61883, libraw1394 and libavc1394 installed on your system.

#### 3.8.1 Options

*   **dvtype**: Override autodetection of DV/HDV. Values `auto`, `dv` and `hdv` are supported.
*   **dvbuffer**: Set maximum size of buffer for incoming data, in frames.
*   **dvguid**: Select the capture device by specifying its GUID.

#### 3.8.2 Examples

*   Grab and show the input of a FireWire DV/HDV device:
    ```
    ffplay -f iec61883 -i auto
    ```

### 3.9 jack

JACK input device.

To enable this input device during configuration you need libjack installed on your system.

A JACK input device creates one or more JACK writable clients, one for each audio channel, with name *client_name*:input_*N*.

#### 3.9.1 Options

*   **channels**: Set the number of channels. Default is 2.

### 3.10 kmsgrab

KMS video input device.

Captures the KMS scanout framebuffer associated with a specified CRTC or plane as a DRM object. Requires either DRM master or CAP_SYS_ADMIN to run.

#### 3.10.1 Options

*   **device**: DRM device to capture on. Defaults to `/dev/dri/card0`.
*   **format**: Pixel format of the framebuffer. Defaults to `bgr0`.
*   **format_modifier**: Format modifier to signal on output frames.
*   **crtc_id**: KMS CRTC ID to define the capture source.
*   **plane_id**: KMS plane ID to define the capture source.
*   **framerate**: Framerate to capture at. Defaults to `30`.

#### 3.10.2 Examples

*   Capture from the first active plane and encode:
    ```
    ffmpeg -f kmsgrab -i - -vf 'hwdownload,format=bgr0' output.mp4
    ```

### 3.11 lavfi

Libavfilter input virtual device.

This input device reads data from the open output pads of a libavfilter filtergraph.

#### 3.11.1 Options

*   **graph**: Specify the filtergraph to use as input.
*   **graph_file**: Set the filename of the filtergraph to be read.
*   **dumpgraph**: Dump graph to stderr.

#### 3.11.2 Examples

*   Create a color video stream and play it back:
    ```
    ffplay -f lavfi -graph "color=c=pink [out0]" dummy
    ```

### 3.12 libcdio

Audio-CD input device based on libcdio.

#### 3.12.1 Options

*   **speed**: Set drive reading speed. Default value is 0.
*   **paranoia_mode**: Set paranoia recovery mode flags. Values: ‘disable’, ‘verify’, ‘overlap’, ‘neverskip’, ‘full’. Default is ‘disable’.

### 3.13 libdc1394

IIDC1394 input device, based on libdc1394 and libraw1394.

#### 3.13.1 Options

*   **framerate**: Set the frame rate. Default is `ntsc`.
*   **pixel_format**: Select the pixel format. Default is `uyvy422`.
*   **video_size**: Set the video size. Default is `qvga`.

### 3.14 openal

The OpenAL input device provides audio capture on all systems with a working OpenAL 1.1 implementation.

#### 3.14.1 Options

*   **channels**: Set the number of channels. Defaults to `2`.
*   **sample_size**: Set the sample size (8 or 16 bits). Defaults to `16`.
*   **sample_rate**: Set the sample rate. Defaults to `44.1k`.
*   **list_devices**: If set to `true`, print a list of devices and exit.

#### 3.14.2 Examples

*   Capture from the default device:
    ```
    $ ffmpeg -f openal -i '' out.ogg
    ```

### 3.15 oss

Open Sound System input device.

#### 3.15.1 Options

*   **sample_rate**: Set the sample rate in Hz. Default is 48000.
*   **channels**: Set the number of channels. Default is 2.

### 3.16 pulse

PulseAudio input device.

#### 3.16.1 Options

*   **server**: Connect to a specific PulseAudio server.
*   **name**: Specify the application name.
*   **stream_name**: Specify the stream name. Default is "record".
*   **sample_rate**: Specify the samplerate in Hz. Default is 48kHz.
*   **channels**: Specify the channels in use. Default is 2.
*   **fragment_size**: Specify the size of the minimal buffering fragment.
*   **wallclock**: Set the initial PTS using the current time. Default is 1.

#### 3.16.2 Examples

*   Record a stream from default device:
    ```
    ffmpeg -f pulse -i default /tmp/pulse.wav
    ```

### 3.17 sndio

sndio input device.

#### 3.17.1 Options

*   **sample_rate**: Set the sample rate in Hz. Default is 48000.
*   **channels**: Set the number of channels. Default is 2.

### 3.18 video4linux2, v4l2

Video4Linux2 input video device. "v4l2" can be used as alias for "video4linux2".

#### 3.18.1 Options

*   **standard**: Set the standard.
*   **channel**: Set the input channel number.
*   **video_size**: Set the video frame size.
*   **pixel_format**: Select the pixel format.
*   **input_format**: Set the preferred pixel format or codec name.
*   **framerate**: Set the preferred video frame rate.
*   **list_formats**: List available formats and exit. Values: ‘all’, ‘raw’, ‘compressed’.
*   **list_standards**: List supported standards and exit.
*   **timestamps, ts**: Set type of timestamps. Values: ‘default’, ‘abs’, ‘mono2abs’.
*   **use_libv4l2**: Use libv4l2 conversion functions. Default is 0.

### 3.19 vfwcap

VfW (Video for Windows) capture input device.

#### 3.19.1 Options

*   **video_size**: Set the video frame size.
*   **framerate**: Set the grabbing frame rate. Default value is `ntsc`.

### 3.20 x11grab

X11 video input device.

The filename passed as input has the syntax:
`[hostname]:display_number.screen_number[+x_offset,y_offset]`

#### 3.20.1 Options

*   **select_region**: Select grabbing area graphically using the pointer. Default is `0`.
*   **draw_mouse**: Specify whether to draw the mouse pointer. Default is `1`.
*   **follow_mouse**: Make the grabbed area follow the mouse. Values: `centered` or pixels.
*   **framerate**: Set the grabbing frame rate. Default is `ntsc`.
*   **show_region**: Show grabbed region on screen.
*   **region_border**: Set the region border thickness. Range 1 to 128, default 3.
*   **window_id**: Grab this window, instead of the whole screen.
*   **video_size**: Set the video frame size.
*   **grab_x, grab_y**: Set the grabbing region coordinates.

## 4 Output Devices

Output devices are configured elements in FFmpeg that can write multimedia data to an output device attached to your system.

The option "-devices" of the ff* tools will display the list of enabled output devices.

### 4.1 alsa

ALSA (Advanced Linux Sound Architecture) output device.

#### 4.1.1 Examples

*   Play a file on default ALSA device:
    ```
    ffmpeg -i INPUT -f alsa default
    ```

### 4.2 AudioToolbox

AudioToolbox output device. Allows native output to CoreAudio devices on OSX.

#### 4.2.1 Options

*   **-audio_device_index <INDEX>**: Specify the audio device by its index.

#### 4.2.2 Examples

*   Output a sine wave to the device with the index 2:
    ```
    $ ffmpeg -f lavfi -i sine=r=44100 -f audiotoolbox -audio_device_index 2 -
    ```

### 4.3 caca

CACA output device. Shows a video stream in a CACA window (text-based graphics).

#### 4.3.1 Options

*   **window_title**: Set the CACA window title.
*   **window_size**: Set the CACA window size.
*   **driver**: Set display driver.
*   **algorithm**: Set dithering algorithm.
*   **antialias**: Set antialias method.
*   **charset**: Set characters used for rendering.
*   **color**: Set color used for rendering.
*   **list_drivers**: Print a list of available drivers and exit.
*   **list_dither**: List available dither options.

#### 4.3.2 Examples

*   Force size to 80x25:
    ```
    ffmpeg -i INPUT -c:v rawvideo -pix_fmt rgb24 -window_size 80x25 -f caca -
    ```

### 4.4 decklink

The decklink output device provides playback capabilities for Blackmagic DeckLink devices.

#### 4.4.1 Options

*   **list_devices**: Print a list of devices and exit.
*   **list_formats**: Print a list of supported formats and exit.
*   **preroll**: Amount of time to preroll video in seconds. Default is `0.5`.
*   **duplex_mode**: Sets the decklink device duplex/profile mode.
*   **timing_offset**: Sets the genlock timing pixel offset.
*   **link**: Sets the SDI video link configuration (‘single’, ‘dual’, ‘quad’).
*   **sqd**: Enable Square Division Quad Split mode.
*   **level_a**: Enable SMPTE Level A mode.
*   **vanc_queue_size**: Sets maximum output buffer size for VANC data.

#### 4.4.2 Examples

*   Play video clip:
    ```
    ffmpeg -i test.avi -f decklink -pix_fmt uyvy422 'DeckLink Mini Monitor'
    ```

### 4.5 fbdev

Linux framebuffer output device.

#### 4.5.1 Options

*   **xoffset, yoffset**: Set x/y coordinate of top left corner. Default is 0.

#### 4.5.2 Examples

*   Play a file on framebuffer device `/dev/fb0`:
    ```
    ffmpeg -re -i INPUT -c:v rawvideo -pix_fmt bgra -f fbdev /dev/fb0
    ```

### 4.6 oss

OSS (Open Sound System) output device.

### 4.7 pulse

PulseAudio output device.

#### 4.7.1 Options

*   **server**: Connect to a specific PulseAudio server.
*   **name**: Specify the application name.
*   **stream_name**: Specify the stream name.
*   **device**: Specify the device to use.
*   **buffer_size, buffer_duration**: Control the size and duration of the buffer.
*   **prebuf**: Specify pre-buffering size in bytes.
*   **minreq**: Specify minimum request size in bytes.

#### 4.7.2 Examples

*   Play a file on default device:
    ```
    ffmpeg -i INPUT -f pulse "stream name"
    ```

### 4.8 sndio

sndio audio output device.

### 4.9 v4l2

Video4Linux2 output device.

### 4.10 xv

XV (XVideo) output device. Shows a video stream in a X Window System window.

#### 4.10.1 Options

*   **display_name**: Specify the hardware display name.
*   **window_id**: Use an existing window ID.
*   **window_size**: Set the created window size.
*   **window_x, window_y**: Set window offsets.
*   **window_title**: Set the window title.

#### 4.10.2 Examples

*   Decode and display:
    ```
    ffmpeg -i INPUT OUTPUT -f xv display
    ```