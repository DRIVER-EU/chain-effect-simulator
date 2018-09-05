import {IChainScenario, SimStatus} from '../../models/schemas';
import dotenv from 'dotenv';
dotenv.config();
import {Logger, IAdapterMessage, ITestBedOptions} from 'node-test-bed-adapter';
import {Simulator} from '../Simulator';
import fs from 'fs';
import {IFloodDataMessage} from '../../models/Interfaces';

const log = Logger.instance;

const FLOOD_TOPIC = process.env.FLOOD_TOPIC || 'chain_flood';
const FLOOD_ID = 'demo';

/**
 * FloodSim.
 *
 * Published files to the chain_flood topic.
 */
export class FloodSim extends Simulator {
  static readonly id = 'FloodSim';
  private files: string[];
  private interval: number;

  constructor(options: ITestBedOptions) {
    super(FloodSim.id, options);
  }

  public getConsumerTopics(): string[] {
    return [];
  }

  public getProducerTopics(): string[] {
    return [FLOOD_TOPIC];
  }

  public processScenarioUpdate(msg: IAdapterMessage): IChainScenario {
    const value = msg.value as IChainScenario;
    return value;
  }

  public processMessage(msg: IAdapterMessage) {}

  public publishFlood() {
    if (!this.isConnected) {
      setTimeout(() => this.publishFlood(), 1000);
    } else {
      setTimeout(() => this.publishFiles(), 3000);
    }
  }

  private async publishFiles() {
    log.warn('INITIAL ' + FLOOD_ID);
    this.sendScenarioUpdate(FLOOD_ID, FloodSim.id, SimStatus.INITIAL);
    this.files.forEach(async (file, index) => {
      await this.publishFile(file, index);
      this.sendScenarioUpdate(FLOOD_ID, FloodSim.id, SimStatus.UPDATE);
      log.warn('UPDATE ' + FLOOD_ID);
      if (index === this.files.length - 1) {
        log.warn('FINISHED ' + FLOOD_ID);
        this.sendScenarioUpdate(FLOOD_ID, FloodSim.id, SimStatus.FINISHED);
      }
    });
  }

  private publishFile(file: string, index: number): Promise<undefined> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.sendFile(FLOOD_TOPIC, file, index * this.interval, resolve);
      }, 1000 + index * 2000);
    });
  }

  public setInterval(interval: number) {
    this.interval = interval;
  }

  public setFiles(files: string[]) {
    this.files = files;
  }

  private sendFile(topic: string, files: string, timestamp: number, resolve: Function) {
    if (fs.existsSync(files)) {
      const demoData = fs.readFileSync(files, {encoding: 'utf8'});
      const demoMsg: IFloodDataMessage = {id: FLOOD_ID, timestamp: timestamp, data: demoData};
      this.sendData(topic, demoMsg, (err, data) => {
        log.info(`Sent demo data ${timestamp} on topic ${topic}`);
        resolve();
      });
    } else {
      log.info(`files ${files} not found`);
      resolve();
    }
  }
}
