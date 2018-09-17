import {IChainScenario, SimStatus} from '../../models/schemas';
import dotenv from 'dotenv';
dotenv.config();
import {Logger, IAdapterMessage, ITestBedOptions} from 'node-test-bed-adapter';
import {Simulator} from '../Simulator';
import fs from 'fs';
import async from 'async';
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

  constructor(dataFolder: string, options: ITestBedOptions) {
    super(dataFolder, FloodSim.id, options);
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

  private publishFiles() {
    log.warn('INITIAL ' + FLOOD_ID);
    this.sendScenarioUpdate(FLOOD_ID, FloodSim.id, SimStatus.INITIAL, () => {
      var counter = 0;
      async.each(
        this.files,
        (file, cb) => {
          this.publishFile(file, counter, () => {
            counter += 1;
            this.sendScenarioUpdate(FLOOD_ID, FloodSim.id, SimStatus.UPDATE, async () => {
              log.warn('UPDATE ' + FLOOD_ID);
              cb();
            });
          });
        },
        error => {
          log.warn('FINISHED ' + FLOOD_ID);
          this.sendScenarioUpdate(FLOOD_ID, FloodSim.id, SimStatus.FINISHED);
        }
      );
    });
  }

  private publishFile(file: string, index: number, cb: Function) {
    this.sendFile(FLOOD_TOPIC, file, index * this.interval, cb);
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
