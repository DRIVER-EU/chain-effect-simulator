import {IChainScenario, SimStatus} from '../../models/schemas';
import dotenv from 'dotenv';
dotenv.config();
import {Logger, IAdapterMessage, ITestBedOptions} from 'node-test-bed-adapter';
import {Simulator} from '../Simulator';
import fs from 'fs';
import async from 'async';
import {IChainDataMessage} from '../../models/Interfaces';

const log = Logger.instance;

const CHAIN_TOPIC = process.env.CHAIN_TOPIC || 'chain_flood';
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

  constructor(dataFolder: string, options: ITestBedOptions) {
    super(dataFolder, FloodSim.id, options);
  }

  public getConsumerTopics(): string[] {
    return [];
  }

  public getProducerTopics(): string[] {
    return [CHAIN_TOPIC];
  }

  public processMessage(msg: IAdapterMessage) {}

  public publishFlood(immediately: boolean = false) {
    if (immediately) {
      this.publishFiles();
      return;
    }
    if (!this.isConnected) {
      return;
    } else {
      try {
        this.publishFiles();
      } catch (error) {
        log.warn('Error publishing files: ' + FLOOD_ID);
      }
    }
  }

  private isFinalFile(counter: number) {
    return counter === this.files.length - 1;
  }

  private publishFiles() {
    log.warn('INITIAL ' + FLOOD_ID);
    async.eachOfSeries(
      this.files,
      (file, counter: number, cb) => {
        this.publishFile(file, counter, this.isFinalFile(counter), () => {
          log.warn('UPDATE ' + FLOOD_ID);
          cb();
        });
      },
      error => {
        log.warn('FINISHED ' + FLOOD_ID);
      }
    );
  }

  private publishFile(file: string, index: number, isFinal: boolean, cb: Function) {
    this.sendFile(CHAIN_TOPIC, file, index * this.interval, isFinal, cb);
  }

  public setInterval(interval: number) {
    this.interval = interval;
  }

  public setFiles(files: string[]) {
    this.files = files;
  }

  private sendFile(topic: string, files: string, timestamp: number, isFinal: boolean, resolve: Function) {
    if (fs.existsSync(files)) {
      const demoData = fs.readFileSync(files, {encoding: 'utf8'});
      const demoMsg: IChainDataMessage = {id: FLOOD_ID, simulator: FloodSim.id, isFinal: isFinal, timestamp: timestamp, data: demoData};
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
