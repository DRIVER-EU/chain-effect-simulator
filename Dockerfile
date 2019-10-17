FROM node:11 as builder
RUN mkdir -p ./code
COPY package.json /code/package.json
COPY node-test-bed-adapter-0.8.9.tgz /code/node-test-bed-adapter-0.8.9.tgz
WORKDIR /code
RUN yarn
RUN yarn add file:/code/node-test-bed-adapter-0.8.9.tgz
COPY . .
RUN yarn build

FROM node:11-stretch-slim
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
