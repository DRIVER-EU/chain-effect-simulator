// UNCOMMENT IF YOU WANT TO ENHANCE THE LOG OUTPUT OF KAFKA
// import { consoleLoggerProvider } from './console-logger-provider';
// const kafkaLogging = require('kafka-node/logging');
// kafkaLogging.setLoggerProvider(consoleLoggerProvider);

import {ProduceRequest} from 'kafka-node';
import {TestBedAdapter, Logger, IAdapterMessage, ITestBedOptions, ITimeManagement} from 'node-test-bed-adapter';
const log = Logger.instance;
const stringify = (m: string | Object) => (typeof m === 'string' ? m : JSON.stringify(m, null, 2)).substr(0, 200);

export interface Dictionary<T> {
  [key: string]: T;
}

export type MessageHandlerFunc = (msg: IAdapterMessage) => void;
export type TimerHandlerFunc = (msg: ITimeManagement) => void;

export class ConsumerProducer {
  private adapter: TestBedAdapter;
  private handlers: Dictionary<MessageHandlerFunc[]> = {};
  private timeHandler?: TimerHandlerFunc;

  constructor(options: ITestBedOptions, whenReady?: Function) {
    this.adapter = new TestBedAdapter(options);
    this.adapter.on('ready', () => {});
    this.adapter.on('error', err => log.error(`Consumer received an error: ${err.toString().substr(0, 500)}`));
    this.adapter
      .connect()
      .then(() => {
        this.initialize();
        log.info(`ConsumerProducer ${options.clientId} is connected`);
        if (whenReady) whenReady();
      })
      .catch(e => {
        log.warn(e);
        log.warn(e.toString().slice(0, 500));
      });
  }

  public stop() {
    this.adapter.close();
  }

  public addTimeHandler(cb: TimerHandlerFunc) {
    this.timeHandler = cb;
  }

  public addHandler(topic: string, cb: MessageHandlerFunc) {
    this.addOrCreateHandler(this.handlers, topic, cb);
    log.debug(`Add handler for topic ${topic.toLowerCase()} for ${this.adapter.configuration.clientId}`);
  }

  private addOrCreateHandler(handlers: Dictionary<any>, topic: string, cb: MessageHandlerFunc) {
    if (!handlers.hasOwnProperty(topic.toLowerCase())) {
      handlers[topic.toLowerCase()] = [cb];
    } else {
      handlers[topic.toLowerCase()].push(cb);
    }
  }

  private initialize() {
    this.subscribe();
  }

  private subscribe() {
    this.adapter.on('time', message => {
      this.handleTimeMessage(message);
    });
    this.adapter.on('message', message => {
      this.handleMessage(message);
    });
    this.adapter.on('raw', message => log.debug(`Raw: ${message}`));
  }

  public sendData(topic: string, data: any, cb?: (err?: Error, data?: any) => void) {
    log.info(`Producer ${this.adapter.configuration.clientId} sends: ${stringify(data)} on ${topic}`);
    const payloads: ProduceRequest[] = [
      {
        topic: topic,
        messages: data,
        attributes: 1 // Gzip
      }
    ];
    this.adapter.send(payloads, (error, data) => {
      if (error) {
        log.error(error);
        log.error(error.toString().slice(0, 500));
      }
      if (data) {
        log.info(data);
      }
      if (cb) cb(error, data);
    });
  }

  private handleTimeMessage(msg: ITimeManagement) {
    log.info(`Received timing message: State ${msg.state}, Time: ${msg.simulationTime} (timestamp: ${msg.timestamp}) ${msg.simulationSpeed}x`);
    if (this.timeHandler) {
      this.timeHandler(msg);
    }
  }

  private handleMessage(message: IAdapterMessage) {
    switch (message.topic.toLowerCase()) {
      case 'system_heartbeat':
        log.debug(`Received heartbeat message with key ${stringify(message.key)}: ${stringify(message.value)}`);
        // log.info(`Received heartbeat message with value ${stringifyShort(message.value)}`);
        break;
      case 'system_configuration':
        log.info(`Received configuration message with key ${stringify(message.key)}: ${stringify(message.value)}`);
        break;
      default:
        if (Object.keys(this.handlers).indexOf(message.topic.toLowerCase()) < 0) {
          // log.info(`Received unhandled ${message.topic} message with key ${stringify(message.key)}`);
          // log.debug(`Available handlers: ${stringify(Object.keys(this.handlers))}`);
        } else {
          this.callHandlerFunctions(message);
        }
        break;
    }
  }

  private callHandlerFunctions(message: IAdapterMessage) {
    log.debug(`Received ${message.topic} with key ${stringify(message.key)} and val ${stringify(message.value)}`);
    if (this.handlers.hasOwnProperty(message.topic.toLowerCase())) {
      this.handlers[message.topic.toLowerCase()].forEach(cb => {
        cb(message);
      });
    } else {
      log.warn(`Cannot handle ${message.topic}-message`);
    }
  }
}
