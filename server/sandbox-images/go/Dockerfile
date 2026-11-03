# CodeSync Go sandbox image
# -------------------------
# The official golang image does NOT ship a compiled standard library, so in a
# fresh container `go run` first compiles fmt, runtime, ... (~25 s on 0.5 CPU).
# Sandboxes are always fresh, so we compile the standard library ONCE here, at
# image-build time, into /gocache. Runs then take ~1-2 s.
#
# Build:  docker build -t codesync-go:1.22 server/sandbox-images/go
#         (or simply: npm run pull-images - it builds this automatically)
FROM golang:1.22-alpine

ENV GOCACHE=/gocache \
    GOPATH=/tmp/go \
    HOME=/tmp \
    CGO_ENABLED=0 \
    GOFLAGS=-buildvcs=false \
    GOTOOLCHAIN=local

# Pre-compile the whole standard library into the build cache.
RUN go build std && chmod -R a+rwX /gocache
