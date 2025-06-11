FROM debian:trixie-slim AS build
WORKDIR /setup
COPY components/ ./components/
COPY scripts/ ./scripts/
COPY styles/ ./styles/
COPY posts/ ./posts/
COPY index.html .
COPY build.sh .
RUN sh build.sh

FROM nginx:stable-alpine3.21-slim
COPY --from=build /setup/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

