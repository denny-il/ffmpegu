---
All rights: (FFmpeg Project)[https://ffmpeg.org/legal.html]
Title: Protocols
Source: https://ffmpeg.org/ffmpeg-protocols.html
---

# FFmpeg Protocols

- [1 Description](#1-description)
- [2 Protocol Options](#2-protocol-options)
- [3 Protocols](#3-protocols)
    - [3.1 amqp](#31-amqp)
    - [3.2 async](#32-async)
    - [3.3 bluray](#33-bluray)
    - [3.4 cache](#34-cache)
    - [3.5 concat](#35-concat)
    - [3.6 concatf](#36-concatf)
    - [3.7 crypto](#37-crypto)
    - [3.8 data](#38-data)
    - [3.9 fd](#39-fd)
    - [3.10 file](#310-file)
    - [3.11 ftp](#311-ftp)
    - [3.12 gopher](#312-gopher)
    - [3.13 gophers](#313-gophers)
    - [3.14 hls](#314-hls)
    - [3.15 http](#315-http)
    - [3.16 Icecast](#316-icecast)
    - [3.17 ipfs](#317-ipfs)
    - [3.18 mmst](#318-mmst)
    - [3.19 mmsh](#319-mmsh)
    - [3.20 md5](#320-md5)
    - [3.21 pipe](#321-pipe)
    - [3.22 prompeg](#322-prompeg)
    - [3.23 rist](#323-rist)
    - [3.24 rtmp](#324-rtmp)
    - [3.25 rtmpe](#325-rtmpe)
    - [3.26 rtmps](#326-rtmps)
    - [3.27 rtmpt](#327-rtmpt)
    - [3.28 rtmpte](#328-rtmpte)
    - [3.29 rtmpts](#329-rtmpts)
    - [3.30 libsmbclient](#330-libsmbclient)
    - [3.31 libssh](#331-libssh)
    - [3.32 librtmp](#332-librtmp)
    - [3.33 rtp](#333-rtp)
    - [3.34 rtsp](#334-rtsp)
    - [3.35 sap](#335-sap)
    - [3.36 sctp](#336-sctp)
    - [3.37 srt](#337-srt)
    - [3.38 srtp](#338-srtp)
    - [3.39 subfile](#339-subfile)
    - [3.40 tee](#340-tee)
    - [3.41 tcp](#341-tcp)
    - [3.42 tls](#342-tls)
    - [3.43 dtls](#343-dtls)
    - [3.44 udp](#344-udp)
    - [3.45 unix](#345-unix)
    - [3.46 zmq](#346-zmq)

## 1 Description

This document describes the input and output protocols provided by the libavformat library.

## 2 Protocol Options

The libavformat library provides some generic global options, which can be set on all the protocols. In addition each protocol may support so-called private options, which are specific for that component.

Options may be set by specifying -*option* *value* in the FFmpeg tools, or by setting the value explicitly in the `AVFormatContext` options or using the `libavutil/opt.h` API for programmatic use.

The list of supported options follows:

**protocol_whitelist *list* (*input*)**
Set a ","-separated list of allowed protocols. "ALL" matches all protocols. Protocols prefixed by "-" are disabled. All protocols are allowed by default but protocols used by an another protocol (nested protocols) are restricted to a per protocol subset.

## 3 Protocols

Protocols are configured elements in FFmpeg that enable access to resources that require specific protocols.

When you configure your FFmpeg build, all the supported protocols are enabled by default. You can list all available ones using the configure option "–list-protocols".

You can disable all the protocols using the configure option "–disable-protocols", and selectively enable a protocol using the option "–enable-protocol=*PROTOCOL*", or you can disable a particular protocol using the option "–disable-protocol=*PROTOCOL*".

The option "-protocols" of the ff* tools will display the list of supported protocols.

All protocols accept the following options:

**rw_timeout**
Maximum time to wait for (network) read/write operations to complete, in microseconds.

A description of the currently available protocols follows.

### 3.1 amqp

Advanced Message Queueing Protocol (AMQP) version 0-9-1 is a broker based publish-subscribe communication protocol.

FFmpeg must be compiled with –enable-librabbitmq to support AMQP. A separate AMQP broker must also be run. An example open-source AMQP broker is RabbitMQ.

After starting the broker, an FFmpeg client may stream data to the broker using the command:

```
ffmpeg -re -i input -f mpegts amqp://[[user]:[password]@]hostname[:port][/vhost]
```

Where hostname and port (default is 5672) is the address of the broker. The client may also set a user/password for authentication. The default for both fields is "guest". Name of virtual host on broker can be set with vhost. The default value is "/".

Multiple subscribers may stream from the broker using the command:

```
ffplay amqp://[[user]:[password]@]hostname[:port][/vhost]
```

In RabbitMQ all data published to the broker flows through a specific exchange, and each subscribing client has an assigned queue/buffer. When a packet arrives at an exchange, it may be copied to a client’s queue depending on the exchange and routing_key fields.

The following options are supported:

**exchange**
Sets the exchange to use on the broker. RabbitMQ has several predefined exchanges: "amq.direct" is the default exchange, where the publisher and subscriber must have a matching routing_key; "amq.fanout" is the same as a broadcast operation; and "amq.topic" is similar to "amq.direct", but allows for more complex pattern matching.

**routing_key**
Sets the routing key. The default value is "amqp".

**pkt_size**
Maximum size of each packet sent/received to the broker. Default is 131072. Minimum is 4096.

**connection_timeout**
The timeout in seconds during the initial connection to the broker. The default value is rw_timeout, or 5 seconds if rw_timeout is not set.

**delivery_mode *mode***
Sets the delivery mode of each message sent to broker.
- ‘persistent’: Delivery mode set to "persistent" (2). This is the default value.
- ‘non-persistent’: Delivery mode set to "non-persistent" (1).

### 3.2 async

Asynchronous data filling wrapper for input stream. Fill data in a background thread, to decouple I/O operation from demux thread.

```
async:URL
async:http://host/resource
async:cache:http://host/resource
```

### 3.3 bluray

Read BluRay playlist.

The accepted options are:

**angle**
BluRay angle

**chapter**
Start chapter (1...N)

**playlist**
Playlist to read (BDMV/PLAYLIST/?????.mpls)

**Examples:**

Read longest playlist from BluRay mounted to /mnt/bluray:
```
bluray:/mnt/bluray
```

Read angle 2 of playlist 4 from BluRay mounted to /mnt/bluray, start from chapter 2:
```
-playlist 4 -angle 2 -chapter 2 bluray:/mnt/bluray
```

### 3.4 cache

Caching wrapper for input stream. Cache the input stream to temporary file. It brings seeking capability to live streams.

The accepted options are:

**read_ahead_limit**
Amount in bytes that may be read ahead when seeking isn’t supported. Range is -1 to INT_MAX. -1 for unlimited. Default is 65536.

**URL Syntax:**
```
cache:URL
```

### 3.5 concat

Physical concatenation protocol. Read and seek from many resources in sequence as if they were a unique resource.

A URL accepted by this protocol has the syntax:
```
concat:URL1|URL2|...|URLN
```

Example:
```
ffplay concat:split1.mpeg\|split2.mpeg\|split3.mpeg
```

### 3.6 concatf

Physical concatenation protocol using a line break delimited list of resources.

A URL accepted by this protocol has the syntax:
```
concatf:URL
```

Example:
```
ffplay concatf:split.txt
```
Where `split.txt` contains:
```
split1.mpeg
split2.mpeg
split3.mpeg
```

### 3.7 crypto

AES-encrypted stream reading protocol.

The accepted options are:

**key**
Set the AES decryption key binary block from given hexadecimal representation.

**iv**
Set the AES decryption initialization vector binary block from given hexadecimal representation.

**Accepted URL formats:**
```
crypto:URL
crypto+URL
```

### 3.8 data

Data in-line in the URI.

Example:
```
ffmpeg -i "data:image/gif;base64,R0lGODdhCAAIAMIEAAAAAAAA//8AAP//AP///////////////ywAAAAACAAIAAADF0gEDLojDgdGiJdJqUX02iB4E8Q9jUMkADs=" smiley.png
```

### 3.9 fd

File descriptor access protocol.

The accepted syntax is:
```
fd: -fd file_descriptor
```

**Options:**

**blocksize**
Set I/O operation maximum block size, in bytes.

**fd**
Set file descriptor.

### 3.10 file

File access protocol. Read from or write to a file.

**URL form:**
```
file:filename
```

**Options:**

**truncate**
Truncate existing files on write, if set to 1. Default value is 1.

**blocksize**
Set I/O operation maximum block size, in bytes.

**follow**
If set to 1, the protocol will retry reading at the end of the file.

**seekable**
Controls if seekability is advertised. 0 means non-seekable, -1 means auto.

**pkt_size**
Set the maximum packet size used for file I/O.

### 3.11 ftp

FTP (File Transfer Protocol).

**Syntax:**
```
ftp://[user[:password]@]server[:port]/path/to/remote/resource.mpeg
```

**Options:**

**timeout**
Set timeout in microseconds of socket I/O operations.

**ftp-user**
Set a user for authentication.

**ftp-password**
Set a password for authentication.

**ftp-anonymous-password**
Password used when login as anonymous user.

**ftp-write-seekable**
Control seekability of connection during encoding.

### 3.12 gopher

Gopher protocol.

### 3.13 gophers

Gophers protocol (Gopher with TLS encapsulation).

### 3.14 hls

Read Apple HTTP Live Streaming compliant segmented stream.

```
hls+http://host/path/to/remote/resource.m3u8
hls+file://path/to/local/resource.m3u8
```

### 3.15 http

HTTP (Hyper Text Transfer Protocol).

**Options:**

**seekable**
Control seekability (-1 auto, 0 no, 1 yes).

**chunked_post**
If set to 1 use chunked Transfer-Encoding for posts.

**http_proxy**
Set HTTP proxy.

**headers**
Set custom HTTP headers.

**content_type**
Set specific content type.

**user_agent**
Override the User-Agent header.

**referer**
Set the Referer header.

**multiple_requests**
Use persistent connections if set to 1.

**post_data**
Set custom HTTP post data.

**mime_type**
Export the MIME type.

**http_version**
Exports the HTTP response version number.

**cookies**
Set the cookies to be sent in future requests.

**icy**
If set to 1 request ICY (SHOUTcast) metadata.

**auth_type**
Set HTTP authentication type (`none`, `basic`).

**send_expect_100**
Send an Expect: 100-continue header for POST.

**location**
Exported dictionary containing the content location.

**offset**
Set initial byte offset.

**end_offset**
Try to limit the request to bytes preceding this offset.

**method**
Set the HTTP method for the request.

**reconnect**
Reconnect automatically when disconnected before EOF.

**reconnect_at_eof**
Treat EOF like an error and cause reconnection.

**reconnect_on_network_error**
Reconnect automatically in case of TCP/TLS errors.

**reconnect_on_http_error**
List of HTTP status codes to reconnect on.

**reconnect_streamed**
Reconnect even streamed/non seekable streams.

**reconnect_delay_max**
Maximum delay in seconds for reconnect.

**reconnect_max_retries**
Maximum number of retries.

**listen**
If set to 1 enables experimental HTTP server.

**short_seek_size**
Threshold for readahead vs seek.

#### 3.15.1 HTTP Cookies

The `cookies` option allows cookies to be specified. Multiple cookies can be delimited by a newline.

Syntax:
```
ffplay -cookies "nlqptid=nltid=tsn; path=/; domain=somedomain.com;" http://somedomain.com/somestream.m3u8
```

### 3.16 Icecast

Icecast protocol (stream to Icecast servers).

**Options:**

**ice_genre**, **ice_name**, **ice_description**, **ice_url**, **ice_public**, **user_agent**, **password**, **content_type**, **legacy_icecast**, **tls**.

**Syntax:**
```
icecast://[username[:password]@]server:port/mountpoint
```

### 3.17 ipfs

InterPlanetary File System (IPFS) protocol support.

**Options:**

**gateway**
Defines the gateway to use.

**Usage:**
```
ffplay ipfs://<hash>
ffplay ipns://<hash>
```

### 3.18 mmst

MMS (Microsoft Media Server) protocol over TCP.

### 3.19 mmsh

MMS (Microsoft Media Server) protocol over HTTP.

**Syntax:**
```
mmsh://server[:port][/app][/playpath]
```

### 3.20 md5

MD5 output protocol. Computes the MD5 hash of the data to be written.

**Examples:**
```
ffmpeg -i input.flv -f avi -y md5:output.avi.md5
ffmpeg -i input.flv -f avi -y md5:
```

### 3.21 pipe

UNIX pipe access protocol.

**Syntax:**
```
pipe:[number]
```

**Options:**

**blocksize**
Set I/O operation maximum block size.

**fd**
Set file descriptor.

### 3.22 prompeg

Pro-MPEG Code of Practice #3 Release 2 FEC protocol.

**Syntax:**
```
-f rtp_mpegts -fec prompeg=option=val... rtp://hostname:port
```

**Options:**
- `l=n`: Columns (4-20)
- `d=n`: Rows (4-20)

### 3.23 rist

Reliable Internet Streaming Transport protocol.

**Options:**
**rist_profile** (`simple`, `main`, `advanced`), **buffer_size**, **fifo_size**, **overrun_nonfatal**, **pkt_size**, **log_level**, **secret**, **encryption**.

### 3.24 rtmp

Real-Time Messaging Protocol.

**Syntax:**
```
rtmp://[username:password@]server[:port][/app][/instance][/playpath]
```

**Parameters:**
`username`, `password`, `server`, `port`, `app`, `playpath`, `listen`, `timeout`.

**Additional Options:**
`rtmp_app`, `rtmp_buffer`, `rtmp_conn`, `rtmp_enhanced_codecs`, `rtmp_flashver`, `rtmp_flush_interval`, `rtmp_live`, `rtmp_pageurl`, `rtmp_playpath`, `rtmp_subscribe`, `rtmp_swfhash`, `rtmp_swfsize`, `rtmp_swfurl`, `rtmp_swfverify`, `rtmp_tcurl`, `tcp_nodelay`, `tcp_keepalive`.

### 3.25 rtmpe

Encrypted Real-Time Messaging Protocol.

### 3.26 rtmps

Real-Time Messaging Protocol over a secure SSL connection.

### 3.27 rtmpt

Real-Time Messaging Protocol tunneled through HTTP.

### 3.28 rtmpte

Encrypted Real-Time Messaging Protocol tunneled through HTTP.

### 3.29 rtmpts

Real-Time Messaging Protocol tunneled through HTTPS.

### 3.30 libsmbclient

CIFS/SMB network resources access.

**Syntax:**
```
smb://[[domain:]user[:password@]]server[/share[/path[/file]]]
```

**Options:**
`timeout`, `truncate`, `workgroup`.

### 3.31 libssh

Secure File Transfer Protocol via libssh.

**Syntax:**
```
sftp://[user[:password]@]server[:port]/path/to/remote/resource.mpeg
```

**Options:**
`timeout`, `truncate`, `private_key`.

### 3.32 librtmp

RTMP and variants supported through librtmp.

**Syntax:**
```
rtmp_proto://server[:port][/app][/playpath] options
```

### 3.33 rtp

Real-time Transport Protocol.

**Syntax:**
```
rtp://hostname[:port][?options]
```

**Options:**
`ttl`, `rtcpport`, `local_rtpport`, `local_rtcpport`, `pkt_size`, `buffer_size`, `connect`, `sources`, `block`, `write_to_source`, `localaddr`, `timeout`.

### 3.34 rtsp

Real-Time Streaming Protocol.

**Syntax:**
```
rtsp://hostname[:port]/path
```

#### 3.34.1 Muxer
**Options:**
`rtsp_transport` (`udp`, `tcp`), `rtsp_flags` (`latm`, `rfc2190`, `skip_rtcp`, `h264_mode0`, `send_bye`), `min_port`, `max_port`, `buffer_size`, `pkt_size`.

#### 3.34.2 Demuxer
**Options:**
`initial_pause`, `rtsp_transport` (`udp`, `tcp`, `udp_multicast`, `http`, `https`), `rtsp_flags` (`filter_src`, `listen`, `prefer_tcp`, `satip_raw`), `allowed_media_types`, `min_port`, `max_port`, `listen_timeout`, `reorder_queue_size`, `timeout`, `user_agent`, `buffer_size`.

#### 3.34.3 Examples
- Watch over UDP: `ffplay -max_delay 500000 -rtsp_transport udp rtsp://server/video.mp4`
- Watch over HTTP: `ffplay -rtsp_transport http rtsp://server/video.mp4`

### 3.35 sap

Session Announcement Protocol (RFC 2974).

#### 3.35.1 Muxer
**Syntax:**
```
sap://destination[:port][?options]
```
**Options:** `announce_addr`, `announce_port`, `ttl`, `same_port`.

#### 3.35.2 Demuxer
**Syntax:**
```
sap://[address][:port]
```

### 3.36 sctp

Stream Control Transmission Protocol.

**Syntax:**
```
sctp://host:port[?options]
```
**Options:** `listen`, `max_streams`.

### 3.37 srt

Haivision Secure Reliable Transport Protocol via libsrt.

**Syntax:**
```
srt://hostname:port[?options]
```

**Options:**
`connect_timeout`, `ffs`, `inputbw`, `iptos`, `ipttl`, `latency`, `listen_timeout`, `maxbw`, `mode`, `mss`, `nakreport`, `oheadbw`, `passphrase`, `enforced_encryption`, `kmrefreshrate`, `kmpreannounce`, `snddropdelay`, `payload_size`, `pkt_size`, `peerlatency`, `pbkeylen`, `rcvlatency`, `recv_buffer_size`, `send_buffer_size`, `timeout`, `tlpktdrop`, `sndbuf`, `rcvbuf`, `lossmaxttl`, `minversion`, `streamid`, `srt_streamid`, `smoother`, `messageapi`, `transtype`, `linger`, `tsbpd`.

### 3.38 srtp

Secure Real-time Transport Protocol.

**Options:**
`srtp_in_suite`, `srtp_out_suite`, `srtp_in_params`, `srtp_out_params`.

### 3.39 subfile

Virtually extract a segment of a file.

**Options:**
`start`, `end`.

**Example:**
```
subfile,,start,153391104,end,268142592,,:/media/dvd/VIDEO_TS/VTS_08_1.VOB
```

### 3.40 tee

Writes output to multiple protocols.

```
tee:file://path/to/local/this.avi|file://path/to/local/that.avi
```

### 3.41 tcp

Transmission Control Protocol.

**Syntax:**
```
tcp://hostname:port[?options]
```

**Options:**
`listen`, `local_addr`, `local_port`, `timeout`, `listen_timeout`, `recv_buffer_size`, `send_buffer_size`, `tcp_nodelay`, `tcp_mss`.

### 3.42 tls

Transport Layer Security (TLS) / Secure Sockets Layer (SSL).

**Syntax:**
```
tls://hostname:port[?options]
```

**Options:**
`ca_file`, `tls_verify`, `cert_file`, `key_file`, `listen`, `http_proxy`.

### 3.43 dtls

Datagram Transport Layer Security (DTLS).

**Syntax:**
```
dtls://hostname:port[?options]
```

**Options:**
`ca_file`, `tls_verify`, `cert_file`, `key_file`, `cert_pem`, `key_pem`, `listen`, `mtu`, `use_srtp`, `external_sock`.

### 3.44 udp

User Datagram Protocol.

**Syntax:**
```
udp://hostname:port[?options]
```

**Options:**
`buffer_size`, `bitrate`, `burst_bits`, `localport`, `localaddr`, `pkt_size`, `reuse`, `ttl`, `dscp`, `connect`, `sources`, `block`, `fifo_size`, `overrun_nonfatal`, `timeout`, `broadcast`.

### 3.45 unix

Unix local socket.

**Syntax:**
```
unix://filepath
```

**Options:**
`timeout`, `listen`, `pkt_size`.

### 3.46 zmq

ZeroMQ asynchronous messaging.

**Syntax:**
```
zmq:tcp://ip-address:port
```

**Options:**
`pkt_size`.