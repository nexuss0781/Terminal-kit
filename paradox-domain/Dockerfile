FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY active-domain.json.template /usr/share/nginx/html/active-domain.json.template
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod 0555 /docker-entrypoint.sh

ENV PARADOX_GATEWAY_URL=https://paradox-db.onrender.com/v1 \
    PARADOX_RESOLVER_TTL_SECONDS=60 \
    PARADOX_RESOLVER_VERSION=1

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
