import { FeatureCollection } from 'geojson';
import { Dictionary } from '../../test-bed/consumerproducer';
import { IChainDataMessage, IChainUpdate, IChangeEvent, InfrastructureState } from '../../models/Interfaces';
import { Logger, IAdapterMessage, ITestBedOptions, clone } from 'node-test-bed-adapter';
import { ITimeManagement, TimeState } from 'test-bed-schemas';
import { Simulator } from '../Simulator';
import { NAPConverter } from '../NAPConverter/NAPConverter';
import fs from 'fs';
import path from 'path';
import * as _ from 'underscore';
import { GeoExtensions } from '../../utils/GeoExtensions';
import { ElectricitySim } from '../ElectricitySim/ElectricitySim';

const CHAIN_TOPIC = process.env.CHAIN_TOPIC || 'chain';
const CARE_TOPIC = process.env.CARE_TOPIC || 'chain_care';

const dependentSims = [ElectricitySim.id, NAPConverter.id];
const log = Logger.instance;

/**
 * CareObjectSim
 *
 * It listens to floodings: when a flooding occurs, all hazardous object are checked, and, if flooded,
 * fail to perform their function.
 * Also, in case they experience a blackout, they will fail too.
 */
export class CareObjectSim extends Simulator {
  static readonly id = 'CareObjectSim';
  private receivedUpdateCount: Dictionary<IChainUpdate> = {};
  private sentUpdateCount: Dictionary<IChainUpdate> = {};
  private baseLayer: FeatureCollection;

  private inputLayers: Dictionary<Dictionary<IChainDataMessage[]>> = {};
  private outputLayers: Dictionary<IChainDataMessage[]> = {};
  private finished: Dictionary<boolean> = {};

  constructor(dataFolder: string, options: ITestBedOptions, whenReady?: Function) {
    super(dataFolder, CareObjectSim.id, options, () => {
      this.readDataFolder(true); // On startup, send the baseLayer
      if (whenReady) whenReady();
    });
  }

  private reset() {
    this.receivedUpdateCount = {};
    this.sentUpdateCount = {};
    delete this.baseLayer;
    this.inputLayers = {};
    this.outputLayers = {};
    this.finished = {};
    log.warn(`${CareObjectSim.id} has been reset`);
    this.readDataFolder();
  }

  public getConsumerTopics(): string[] {
    // return [CHAIN_TOPIC, CHAIN_TOPIC];
    return [CHAIN_TOPIC];
  }

  public getProducerTopics(): string[] {
    return [CHAIN_TOPIC, CARE_TOPIC];
  }

  private readDataFolder(sendBaseLayer: boolean = false) {
    const fileName = path.join(this.dataFolder, CareObjectSim.id, `${CareObjectSim.id}.json`);
    const data = fs.readFileSync(fileName, { encoding: 'utf8' });
    this.baseLayer = JSON.parse(data);
    this.baseLayer.features.forEach((f, index) => {
      f.id = `GO_${index}`;
      f.properties['state'] = InfrastructureState.Ok;
    });
    log.info(`Read CareObject basefile: ${fileName} with ${this.baseLayer.features.length} features`);
    if (sendBaseLayer) {
      const baseLayer: IChainDataMessage = { id: 'base', simulator: CareObjectSim.id, isFinal: false, timestamp: -1, data: JSON.stringify(this.baseLayer) };
      this.sendData(CARE_TOPIC, JSON.parse(JSON.stringify(baseLayer)), (err, data) => { });
    }
  }

  public hasScenario(scenarioId: string) {
    return this.receivedUpdateCount.hasOwnProperty(scenarioId);
  }

  private initNewScenario(scenarioId: string) {
    if (this.hasScenario(scenarioId)) return log.info(`Already created scenario`);
    this.receivedUpdateCount[scenarioId] = { count: 0, finished: false };
    this.inputLayers[scenarioId] = {};
    dependentSims.forEach(ds => (this.inputLayers[scenarioId][ds] = []));
    const initialLayer: IChainDataMessage = { id: scenarioId, simulator: CareObjectSim.id, isFinal: false, timestamp: -1, data: JSON.stringify(this.baseLayer) };
    this.outputLayers[scenarioId] = [initialLayer];
    this.sentUpdateCount[scenarioId] = { count: 0, finished: false };
    this.sendData(CARE_TOPIC, JSON.parse(JSON.stringify(initialLayer)), (err, data) => { });
    // this.sendData(CHAIN_TOPIC, JSON.parse(JSON.stringify(initialLayer)), (err, data) => { });
  }

  private processLatestMessage(id: string, sim: string, isFinished: boolean) {
    if (this.inputLayers[id][sim].length <= 0) return;
    const dependentLayer = this.inputLayers[id][sim].sort((a, b) => a.timestamp - b.timestamp)[this.inputLayers[id][sim].length - 1];
    const latestTimestamp = dependentLayer.timestamp;
    if (this.allSimsHaveLatestTimestamp(id, latestTimestamp)) {
      const flood = this.inputLayers[id][NAPConverter.id].find(l => l.timestamp === latestTimestamp);
      const power = this.inputLayers[id][ElectricitySim.id].find(l => l.timestamp === latestTimestamp);
      this.processFloodLayer(flood, (floodResult: FeatureCollection) => {
        log.info(`Processed ${flood.id} at ${flood.timestamp}`);
        this.processPowerLayer(power, floodResult, (combinedResult: FeatureCollection) => {
          this.sendLayer(flood, combinedResult);
        });
      });
    } else {
      log.info(`Not all dependent layer have timestamp ${latestTimestamp} yet`);
    }
  }

  private sendLayer(flood: IChainDataMessage, result: FeatureCollection) {
    const careResult: IChainDataMessage = { id: flood.id, simulator: CareObjectSim.id, isFinal: flood.isFinal, timestamp: flood.timestamp, data: JSON.stringify(result) };
    this.outputLayers[flood.id].push(careResult);
    // this.sendData(CHAIN_TOPIC, JSON.parse(JSON.stringify(careResult)), (err, data) => { });
    this.sendData(CARE_TOPIC, JSON.parse(JSON.stringify(careResult)), (err, data) => { });
  }

  private allSimsHaveLatestTimestamp(scenarioId: string, latestTimestamp: number): boolean {
    return dependentSims.every(depSim => {
      return this.inputLayers[scenarioId][depSim].some(l => l.timestamp === latestTimestamp);
    });
  }

  public processMessage(msg: IAdapterMessage) {
    const value = msg.value as IChainDataMessage;
    if (dependentSims.indexOf(value.simulator) < 0) return;
    log.info(`CareObjectSim processes msg: ${JSON.stringify(msg).substr(0, 500)}`);
    if (!this.hasScenario(value.id)) this.initNewScenario(value.id);
    this.inputLayers[value.id][value.simulator].push(value);
    this.processLatestMessage(value.id, value.simulator, value.isFinal);
  }

  public processTimeMessage(msg: ITimeManagement) {
    log.info(`CareObjectSim processes time-msg: ${JSON.stringify(msg).substr(0, 500)}`);
    if (msg.state === TimeState.Reset) {
      this.reset();
    } else if (msg.state === TimeState.Initialization) {
      this.readDataFolder(true);
    }
  }

  public processAllMessages(id: string) {
    const floodLayers = this.inputLayers[id][NAPConverter.id].sort((a, b) => a.timestamp - b.timestamp);
    const powerLayers = this.inputLayers[id][ElectricitySim.id].sort((a, b) => a.timestamp - b.timestamp);
    floodLayers.forEach((flood, index) => {
      this.processFloodLayer(flood, (floodResult: FeatureCollection) => {
        log.info(`Processed ${flood.id} at ${flood.timestamp}`);
        const powerLayer = powerLayers[index + 1];
        this.processPowerLayer(powerLayer, floodResult, (combinedResult: FeatureCollection) => {
          this.sendLayer(flood, combinedResult);
        });
      });
    });
  }

  public processPowerLayer(msg: IChainDataMessage, prevResult: FeatureCollection, callback: (result: FeatureCollection) => void) {
    const powerLayer = msg.data;
    if (!powerLayer) {
      log.warn('No powerLayer received');
      return callback(GeoExtensions.createFeatureCollection([]));
    }
    // Find the previous object states
    var careLayer = _.find(this.outputLayers[msg.id].sort((a, b) => a.timestamp - b.timestamp), t => +t.timestamp < msg.timestamp);
    if (!careLayer) {
      log.warn(`No careLayer found for timestamp ${msg.timestamp}`);
      return callback(GeoExtensions.createFeatureCollection([]));
    }
    log.info(`Found previous care objects at t=${careLayer.timestamp} of ${_.size(this.outputLayers)} layers`);

    // Calculate and publish the effects of the flooding update
    var failedObjects: IChangeEvent[] = [];
    var features = JSON.parse(careLayer.data).features;
    log.info(`Care features before: ${features.length}`);
    failedObjects = this.blackout(powerLayer, careLayer.id, features, msg.timestamp);
    const newCareLayer: IChainDataMessage = { id: msg.id, simulator: CareObjectSim.id, isFinal: msg.isFinal, timestamp: msg.timestamp, data: JSON.stringify(GeoExtensions.createFeatureCollection(features)) };
    // this.outputLayers[msg.id].push(newCareLayer);
    var failedFeatures = prevResult.features.concat(failedObjects.map(fo => fo.value));
    log.info(`Care features failed due to blackout: ${failedFeatures.length - prevResult.features.length}, Care features after: ${features.length}`);
    callback(GeoExtensions.createFeatureCollection(failedFeatures));
  }

  public processFloodLayer(msg: IChainDataMessage, callback: (result: FeatureCollection) => void) {
    const floodLayer = msg.data;
    if (!floodLayer) {
      log.warn('No floodlayer received');
      return callback(GeoExtensions.createFeatureCollection([]));
    }
    // Find the previous obeject states
    var goLayer = _.find(this.outputLayers[msg.id].sort((a, b) => a.timestamp - b.timestamp), t => +t.timestamp < msg.timestamp);
    if (!goLayer) {
      log.warn(`No goLayer found for timestamp ${msg.timestamp}`);
      return callback(GeoExtensions.createFeatureCollection([]));
    }
    log.info(`Found previous care objects at t=${goLayer.timestamp} of ${_.size(this.outputLayers)} layers`);

    // Calculate and publish the effects of the flooding update
    var failedObjects: IChangeEvent[] = [];
    var features = JSON.parse(goLayer.data).features;
    log.info(`Care features before: ${features.length}`);
    failedObjects = this.flooding(floodLayer, goLayer.id, features);
    const newCareLayer: IChainDataMessage = { id: msg.id, simulator: CareObjectSim.id, isFinal: msg.isFinal, timestamp: msg.timestamp, data: JSON.stringify(GeoExtensions.createFeatureCollection(features)) };
    // this.outputLayers[msg.id].push(newCareLayer);
    log.info(`Care features failed due to flood: ${failedObjects.length}, Care features after: ${features.length}`);
    callback(GeoExtensions.createFeatureCollection(failedObjects.map(fo => fo.value)));
  }
}
