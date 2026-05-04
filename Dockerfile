FROM debian:bookworm-slim

ARG TYPST_VERSION=0.13.1

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        inotify-tools \
        xz-utils \
        fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
    "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
    | tar -xJ --strip-components=1 -C /usr/local/bin \
      "typst-x86_64-unknown-linux-musl/typst" \
    && typst --version

WORKDIR /repo

COPY template.typ base_horaire.typ CEGEP_LOGO.png DICJ_LOGO.png ./
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Mount teachers dir at runtime:
#   docker run -v ./teachers:/repo/teachers horaires-watch

ENTRYPOINT ["/entrypoint.sh"]
