ARG FFMPEG_VERSION=latest
FROM linuxserver/ffmpeg:${FFMPEG_VERSION}

ENV DEBIAN_FRONTEND=noninteractive

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

RUN ffmpeg -version && ffprobe -version
