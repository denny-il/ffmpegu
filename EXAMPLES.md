# FFmpegu Examples

This file contains examples of how to use the FFmpegu library.

## Basic Usage

```typescript
import { defaultRunner, FFmpegCommand } from '@ffmpegujs/ffmpegu';

// Create a simple command to convert video
const command = new FFmpegCommand({
  input: 'input.mp4',
  output: 'output.mp4',
  outputOptions: ['-vcodec', 'libx264', '-acodec', 'aac']
});

// Execute the command
try {
  const result = await defaultRunner.run(command);
  if (result.success) {
    console.log('Conversion completed successfully!');
  } else {
    console.error('Conversion failed:', result.stderr);
  }
} catch (error) {
  console.error('Error running FFmpeg:', error);
}
```

## Custom Runner

```typescript
import { FFmpegRunner, FFmpegCommand } from '@ffmpegujs/ffmpegu';

// Create a custom runner with specific binary paths
const customRunner = new FFmpegRunner({
  ffmpegPath: '/usr/local/bin/ffmpeg',
  ffprobePath: '/usr/local/bin/ffprobe'
});

// Validate that binaries are available
const isValid = await customRunner.validate();
if (!isValid) {
  throw new Error('FFmpeg binaries not found');
}
```

## Stream Processing

```typescript
import { createReadStream, createWriteStream } from 'node:fs';
import { defaultRunner, FFmpegCommand } from '@ffmpegujs/ffmpegu';

// Process using streams
const inputStream = createReadStream('input.mp4');
const outputStream = createWriteStream('output.mp4');

const command = new FFmpegCommand({
  input: inputStream,
  output: outputStream,
  outputOptions: ['-f', 'mp4', '-vcodec', 'copy']
});

const result = await defaultRunner.run(command);
```

## Media Information

```typescript
import { defaultRunner } from '@ffmpegujs/ffmpegu';

// Get media file information
try {
  const probeResult = await defaultRunner.probe('video.mp4');
  console.log('Media info:', probeResult.data);
} catch (error) {
  console.error('Failed to probe file:', error);
}
```

## Advanced Options

```typescript
import { FFmpegCommand } from '@ffmpegujs/ffmpegu';

// Complex command with many options
const command = new FFmpegCommand({
  input: 'input.mov',
  inputOptions: [
    '-ss', '00:01:30',  // Start at 1:30
    '-t', '30'          // Duration 30 seconds
  ],
  output: 'output.mp4',
  outputOptions: [
    '-vf', 'scale=1280:720',    // Scale to 720p
    '-crf', '23',               // Quality setting
    '-preset', 'fast',          // Encoding speed
    '-movflags', '+faststart'   // Web optimization
  ]
});
```

## Error Handling

```typescript
import { defaultRunner, FFmpegCommand } from '@ffmpegujs/ffmpegu';

async function convertVideo(inputPath: string, outputPath: string): Promise<boolean> {
  const command = new FFmpegCommand({
    input: inputPath,
    output: outputPath,
    outputOptions: ['-vcodec', 'libx264']
  });

  try {
    const result = await defaultRunner.run(command);
    
    if (!result.success) {
      console.error(`FFmpeg failed with exit code ${result.exitCode}`);
      console.error('Error output:', result.stderr);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to run FFmpeg:', error);
    return false;
  }
}
```
