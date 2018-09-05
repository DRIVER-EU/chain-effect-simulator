import {ProduceRequest, KafkaClient} from 'kafka-node';
import {TestBedAdapter, Logger, LogLevel, ITestBedOptions} from 'node-test-bed-adapter';

const log = Logger.instance;
const stringify = (m: string | Object) => (typeof m === 'string' ? m : JSON.stringify(m)).substr(0, 200);

export class Producer {
  private id = 'NodeTestProducer';
  private adapter: TestBedAdapter;
  public isReady: boolean = false;

  constructor(options: ITestBedOptions, whenReady?: Function) {
    this.adapter = new TestBedAdapter(options);
    this.adapter.on('error', e => console.error(e));
    this.adapter.on('ready', () => {
      log.info(`Current simulation time: ${this.adapter.simTime}`);
      log.info('Producer is connected');
      this.isReady = true;
      if (whenReady) whenReady();
    });
    this.adapter.connect();
  }

  public addProducerTopics(topics: string[]) {
    if (!this.isReady) {
      log.warn(`Producer not ready yet`);
      return;
    }
    this.adapter.addProducerTopics(topics);
  }

  public sendData(topic: string, data: any) {
    log.info(`Producer sends: ${stringify(data)} on ${topic}`);
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
      }
      if (data) {
        log.info(data);
      }
    });
  }
}
