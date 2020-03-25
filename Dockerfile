FROM node:12-stretch-slim as builder
RUN mkdir -p ./code
COPY package.json /code/package.json
WORKDIR /code
RUN yarn
COPY . .
RUN yarn build

FROM node:12-stretch-slim
RUN mkdir -p /chainsim/dist
RUN mkdir -p /chainsim/data/schemas
RUN mkdir -p /chainsim/config
RUN mkdir -p /chainsim/node_modules
COPY --from=builder /code/dist /chainsim/dist
COPY --from=builder /code/node_modules /chainsim/node_modules
COPY --from=builder /code/package.json /chainsim/package.json
COPY --from=builder /code/config /chainsim/config
WORKDIR /chainsim
CMD ["yarn", "start"]
