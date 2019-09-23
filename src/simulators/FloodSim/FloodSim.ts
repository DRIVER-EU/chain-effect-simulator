import dotenv from 'dotenv';
dotenv.config();
import {Logger, IAdapterMessage, ITestBedOptions, ITiming, TimeState} from 'node-test-bed-adapter';
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
  private floodStartTime: number;
  private floodEnded: boolean = false;
  private lastSentFile: number = -1;

  constructor(dataFolder: string, options: ITestBedOptions, whenReady?: Function) {
    super(dataFolder, FloodSim.id, options, whenReady);
    this.resetFlood();
  }

  public getConsumerTopics(): string[] {
    return [];
  }

  public getProducerTopics(): string[] {
    return [CHAIN_TOPIC];
  }

  public processMessage(msg: IAdapterMessage) {}

  public processTimeMessage(msg: ITiming) {
    log.info(`${FloodSim.id} received timing message: State ${msg.state}, Time: ${msg.trialTime} (elapsed: ${msg.timeElapsed})`);
    this.checkFloodUpdate(msg);
    if (msg.state === TimeState.Stopped) {
      this.resetFlood();
    }
  }

  private resetFlood() {
    this.floodStartTime = undefined;
    this.floodEnded = false;
    this.lastSentFile = -1;
  }

  private checkFloodUpdate(msg: ITiming) {
    if (msg.state === TimeState.Stopped) {
      this.resetFlood();
    } else if (!this.floodStarted() && msg.state === TimeState.Started) {
      this.floodStartTime = msg.trialTime;
      this.sendFile(CHAIN_TOPIC, this.files[(this.lastSentFile += 1)], this.lastSentFile * this.interval, this.isFinalFile(this.lastSentFile), () => {
        log.info(`${FloodSim.id} sent initial file`);
      });
    } else if (this.floodInProgress() && msg.trialTime - this.floodStartTime >= (this.lastSentFile + 1) * this.interval) {
      this.sendFile(CHAIN_TOPIC, this.files[(this.lastSentFile += 1)], this.lastSentFile * this.interval, this.isFinalFile(this.lastSentFile), () => {
        log.info(`${FloodSim.id} sent file ${this.files[this.lastSentFile]}`);
      });
    }
  }

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

  private floodStarted() {
    return !!this.floodStartTime;
  }

  private floodInProgress() {
    return this.floodStarted() && !this.floodEnded;
  }

  private isFinalFile(counter: number) {
    this.floodEnded = counter === this.files.length - 1;
    return this.floodEnded;
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

  private sendFile(topic: string, file: string, timestamp: number, isFinal: boolean, resolve: Function) {
    if (fs.existsSync(file)) {
      const demoData = fs.readFileSync(file, {encoding: 'utf8'});
      const demoMsg: IChainDataMessage = {id: FLOOD_ID, simulator: FloodSim.id, isFinal: isFinal, timestamp: timestamp, data: demoData};
      this.sendData(topic, demoMsg, (err, data) => {
        log.info(`Sent demo data ${timestamp} on topic ${topic}`);
        resolve();
      });
    } else {
      log.info(`File ${file} not found`);
      resolve();
    }
  }
}
