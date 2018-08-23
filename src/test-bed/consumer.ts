// UNCOMMENT IF YOU WANT TO ENHANCE THE LOG OUTPUT OF KAFKA
// import { consoleLoggerProvider } from './console-logger-provider';
// const kafkaLogging = require('kafka-node/logging');
// kafkaLogging.setLoggerProvider(consoleLoggerProvider);

import {Message} from 'kafka-node';
import {TestBedAdapter, Logger, LogLevel, ITopicMetadataItem, IAdapterMessage, ITestBedOptions} from 'node-test-bed-adapter';
const log = Logger.instance;
const stringify = (m: string | Object) => (typeof m === 'string' ? m : JSON.stringify(m, null, 2));
const stringifyShort = (m: string | Object) => (typeof m === 'string' ? m : JSON.stringify(m));

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
  }

  private initialize() {
    this.subscribe();
    log.info('Consumer is connected');
    this.adapter.addConsumerTopics({topic: 'system_configuration', offset: Number.MAX_SAFE_INTEGER}, true, (err, msg) => {
      if (err) {
        return log.error(err);
      }
      this.handleMessage(msg as IAdapterMessage);
    });
  }

  private subscribe() {
    this.adapter.on('message', message => this.handleMessage(message));
    this.adapter.addConsumerTopics({topic: TestBedAdapter.HeartbeatTopic, offset: Number.MAX_SAFE_INTEGER}, true).catch(err => {
      if (err) {
        log.error(`Consumer received an error: ${err}`);
      }
    });
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
          log.info(`Received unhandled ${message.topic} message with key ${stringify(message.key)}: ${stringify(message.value)}`);
        } else {
          this.callHandlerFunction(message);
        }
        break;
    }
  }

  private callHandlerFunction(message: IAdapterMessage) {
    log.debug(`Received ${message.topic} with key ${stringify(message.key)}: ${stringify(message.value)}`);
    this.handlers[message.topic.toLowerCase()](message);
  }
}
