export function generateAgentDockerfile(): string {
  return `# TERMINAL_KIT_PROTOCOL_VERSION=2
FROM node:22-alpine
RUN apk add --no-cache util-linux
WORKDIR /app
RUN wget -qO /app/agent.mjs https://raw.githubusercontent.com/nexuss0781/terminalkit-docker/main/agent.mjs
EXPOSE 8080
CMD ["node", "/app/agent.mjs"]
`;
}
