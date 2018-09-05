import {IChainScenario, SimStatus} from '../models/schemas';
import {IAdapterMessage, ITestBedOptions, Logger} from 'node-test-bed-adapter';
import {ConsumerProducer} from '../test-bed/consumerproducer';

const SCENARIO_TOPIC = process.env.SCENARIO_TOPIC || 'chain_scenario';
const log = Logger.instance;

export abstract class Simulator {
  static readonly id: string;
  protected consumerProducer: ConsumerProducer;
  protected isConnected: boolean = false;

  constructor(id: string, options: ITestBedOptions) {
    options.clientId = id;
    this.consumerProducer = new ConsumerProducer(options, () => this.initialize(id));
  }

  private async initialize(id: string) {
    const consumerTopics = this.getConsumerTopics();
    consumerTopics.forEach(topic => {
      this.consumerProducer.addHandler(topic, msg => this.processMessage(msg));
    });
    this.consumerProducer.addHandler(SCENARIO_TOPIC, msg => this.processScenarioUpdate(msg));
    log.info(`Registered ${consumerTopics.length} handlers for ${id}`);
    this.isConnected = true;
  }

  protected sendScenarioUpdate(scenarioId: string, simId: string, status: SimStatus) {
    const scenario: IChainScenario = {scenarioId: scenarioId, simId: simId, simStatus: status};
    this.sendData(SCENARIO_TOPIC, scenario);
  }

  protected sendData(topic: string, data: any, cb?: (err?: Error, data?: any) => void) {
    if (!this.consumerProducer || !this.isConnected) {
      log.warn(`Cannot send data: not connected`);
      return;
    }
    this.consumerProducer.sendData(topic, data, cb);
  }

  abstract processScenarioUpdate(msg: IAdapterMessage);
  abstract processMessage(msg: IAdapterMessage);
  abstract getConsumerTopics(): string[];
  abstract getProducerTopics(): string[];
}
