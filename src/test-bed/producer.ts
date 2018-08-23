import {ProduceRequest, KafkaClient} from 'kafka-node';
import {TestBedAdapter, Logger, LogLevel, ITestBedOptions} from 'node-test-bed-adapter';

const log = Logger.instance;

export class Producer {
  private id = 'NodeTestProducer';
  private adapter: TestBedAdapter;

  constructor(options: ITestBedOptions, whenReady?: Function) {
    this.adapter = new TestBedAdapter(options);
    this.adapter.on('error', e => console.error(e));
    this.adapter.on('ready', () => {
      log.info(`Current simulation time: ${this.adapter.simTime}`);
      log.info('Producer is connected');
      if (whenReady) whenReady();
    });
    this.adapter.connect();
  }

  public sendData(topic: string, data: any) {
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
