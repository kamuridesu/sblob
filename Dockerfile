FROM debian:trixie-slim AS build
RUN apt-get update && apt-get install -y jq
WORKDIR /setup
COPY components/ ./components/
COPY scripts/ ./scripts/
COPY styles/ ./styles/
COPY posts/ ./posts/
COPY index.html .
COPY build.sh .
RUN sh build.sh

FROM nginx:stable-alpine3.21-slim AS runtime
RUN addgroup -S rungroup && adduser -S runner -G rungroup -u 1024
RUN mkdir -p /home/vsts/.cache && chown -R 1024:1024 /home/vsts/.cache

COPY --from=build /setup/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chown -R runner:rungroup /var/cache/nginx var/log/nginx /etc/nginx/conf.d
RUN touch /var/run/nginx.pid && chown -R runner:rungroup /var/run/nginx.pid

USER runner

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

