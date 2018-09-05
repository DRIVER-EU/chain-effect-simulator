// UNCOMMENT IF YOU WANT TO ENHANCE THE LOG OUTPUT OF KAFKA
// import { consoleLoggerProvider } from './console-logger-provider';
// const kafkaLogging = require('kafka-node/logging');
// kafkaLogging.setLoggerProvider(consoleLoggerProvider);

import {Message, OffsetFetchRequest} from 'kafka-node';
import {TestBedAdapter, Logger, LogLevel, ITopicMetadataItem, IAdapterMessage, ITestBedOptions} from 'node-test-bed-adapter';
const log = Logger.instance;
const stringify = (m: string | Object) => (typeof m === 'string' ? m : JSON.stringify(m, null, 2)).substr(0, 200);
const stringifyShort = (m: string | Object) => (typeof m === 'string' ? m : JSON.stringify(m)).substr(0, 200);

export interface Dictionary<T> {
  [key: string]: T;
}

export type MessageHandlerFunc = (msg: IAdapterMessage) => void;

export class Consumer {
  private adapter: TestBedAdapter;
  private handlers: Dictionary<MessageHandlerFunc> = {};

  constructor(options: ITestBedOptions) {
    this.adapter = new TestBedAdapter(options);
    this.adapter.on('ready', () => this.initialize());
    this.adapter.on('error', err => log.error(`Consumer received an error: ${err}`));
    this.adapter.connect();
  }

  public addHandler(topic: string, cb: MessageHandlerFunc) {
    this.handlers[topic.toLowerCase()] = cb;
    log.debug(`Add handler for topic ${topic.toLowerCase()} for ${this.adapter.configuration.clientId}`);
  }

  public addConsumerTopics(topics: string[]) {
    const topicRequests: OffsetFetchRequest[] = topics.map(t => {
      return {topic: t, offset: -1};
    });
    this.adapter.addConsumerTopics(topicRequests);
  }

  private initialize() {
    this.subscribe();
    log.info('Consumer is connected');
  }

  private subscribe() {
    this.adapter.on('message', message => this.handleMessage(message));
    // this.adapter.addConsumerTopics({topic: TestBedAdapter.HeartbeatTopic, offset: -1}, true).catch(err => {
    this.adapter.addConsumerTopics();
  }

  private handleMessage(message: IAdapterMessage) {
    switch (message.topic.toLowerCase()) {
      case 'system_heartbeat':
        log.debug(`Received heartbeat message with key ${stringify(message.key)}: ${stringify(message.value)}`);
        log.info(`Received heartbeat message with value ${stringifyShort(message.value)}`);
        break;
      case 'system_configuration':
        log.info(`Received configuration message with key ${stringify(message.key)}: ${stringify(message.value)}`);
        break;
      default:
        if (Object.keys(this.handlers).indexOf(message.topic.toLowerCase()) < 0) {
          // log.info(`Received unhandled ${message.topic} message with key ${stringify(message.key)}`);
          // log.debug(`Available handlers: ${stringify(Object.keys(this.handlers))}`);
        } else {
          this.callHandlerFunction(message);
        }
        break;
    }
  }

  private callHandlerFunction(message: IAdapterMessage) {
    log.debug(`Received ${message.topic} with key ${stringify(message.key)} and val ${stringify(message.value)}`);
    this.handlers[message.topic.toLowerCase()](message);
  }
}
