# ===== Stage 1: Build frontend =====
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# ===== Stage 2: Build Go binary =====
FROM golang:latest AS backend-builder

RUN apk add --no-cache git

WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./

ARG PUBLIC_KEY_PEM=""
RUN CGO_ENABLED=0 go build \
    -ldflags="-s -w -X 'xinipay/internal/license.publicKeyPEM=${PUBLIC_KEY_PEM}'" \
    -o /xinipay ./cmd/server/

RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /fingerprint ./cmd/fingerprint/

# ===== Stage 3: Production image =====
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=backend-builder /xinipay .
COPY --from=backend-builder /fingerprint .
COPY --from=frontend-builder /app/frontend/dist ./static
COPY config.production.yaml ./config.yaml

RUN chown -R app:app /app
USER app

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8090/api/health || exit 1

ENTRYPOINT ["./xinipay"]
