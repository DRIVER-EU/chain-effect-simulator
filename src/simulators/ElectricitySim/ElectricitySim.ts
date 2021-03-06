import { FeatureCollection, Feature, Polygon } from 'geojson';
import { IChainDataMessage, IChainUpdate, IChangeEvent, InfrastructureState, ChangeType } from '../../models/Interfaces';
import { Logger, IAdapterMessage, ITestBedOptions, ITimeManagement, TimeState } from 'node-test-bed-adapter';
import { Simulator, CAP_TOPIC } from '../Simulator';
import { NAPConverter } from '../NAPConverter/NAPConverter';
import fs from 'fs';
import path from 'path';
import * as _ from 'underscore';
import { GeoExtensions } from '../../utils/GeoExtensions';
import { Dictionary } from '../../test-bed/consumerproducer';

const CHAIN_TOPIC = process.env.CHAIN_TOPIC || 'chain';
const ELECTRICITY_TOPIC = process.env.ELECTRICITY_TOPIC || 'chain_power';

const dependentSims = [NAPConverter.id];

const log = Logger.instance;
/**
 * Electrical Network Simulator.
 *
 * It listens to flooding.metadata. When a new scenario is published, it creates an accompanying power topic for that scenario
 * and it starts listening to the flooding.scen.scenario topic. When a flooding update is consumed, the effect of the flood on the
 * power-network is calculated. Finally, a new power network layer is published on the power topic.
 */
export class ElectricitySim extends Simulator {
  static readonly id = 'ElectricitySim';
  private receivedUpdateCount: Dictionary<IChainUpdate> = {};
  private sentUpdateCount: Dictionary<IChainUpdate> = {};
  private baseLayer: FeatureCollection;

  private inputLayers: Dictionary<IChainDataMessage[]> = {};
  private outputLayers: Dictionary<IChainDataMessage[]> = {};
  private processed: number[] = [];

  constructor(dataFolder: string, options: ITestBedOptions, whenReady?: Function) {
    super(dataFolder, ElectricitySim.id, options, () => {
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
    this.processed.length = 0;
    log.warn(`${ElectricitySim.id} has been reset`);
    this.readDataFolder();
  }

  public getConsumerTopics(): string[] {
    return [CHAIN_TOPIC];
  }

  public getProducerTopics(): string[] {
    return [CHAIN_TOPIC, ELECTRICITY_TOPIC, CAP_TOPIC];
  }

  private readDataFolder(sendBaseLayer: boolean = false) {
    const fileName = path.join(this.dataFolder, ElectricitySim.id, `${ElectricitySim.id}.json`);
    const data = fs.readFileSync(fileName, { encoding: 'utf8' });
    this.baseLayer = JSON.parse(data);
    this.baseLayer.features.forEach((f, index) => {
      f.id = `POW_${index}`;
      f.properties['state'] = InfrastructureState.Ok;
    });
    log.info(`Read Electricity basefile: ${fileName} with ${this.baseLayer.features.length} features`);
    if (sendBaseLayer) {
      const baseLayer: IChainDataMessage = { id: 'base', simulator: ElectricitySim.id, isFinal: false, timestamp: -1, data: JSON.stringify(this.baseLayer) };
      this.sendData(ELECTRICITY_TOPIC, JSON.parse(JSON.stringify(baseLayer)), (err, data) => { });
    }
  }

  public hasScenario(scenarioId: string) {
    return this.receivedUpdateCount.hasOwnProperty(scenarioId);
  }

  private initNewScenario(scenarioId: string) {
    if (this.hasScenario(scenarioId)) return log.info(`Already created scenario`);
    this.receivedUpdateCount[scenarioId] = { count: 0, finished: false };
    this.inputLayers[scenarioId] = [];
    const initialLayer: IChainDataMessage = { id: scenarioId, simulator: ElectricitySim.id, isFinal: false, timestamp: -1, data: JSON.stringify(this.baseLayer) };
    this.outputLayers[scenarioId] = [initialLayer];
    this.sentUpdateCount[scenarioId] = { count: 0, finished: false };
    this.sendData(CHAIN_TOPIC, JSON.parse(JSON.stringify(initialLayer)), (err, data) => { });
    this.sendData(ELECTRICITY_TOPIC, JSON.parse(JSON.stringify(initialLayer)), (err, data) => { });
    this.sendCAP('stedin', `There are ${this.baseLayer ? this.baseLayer.features.length : '?'} power stations in this area`, true);
  }

  private processLatestMessage(id: string, isFinished: boolean) {
    if (this.inputLayers[id].length <= 0) return;
    const flood = this.inputLayers[id].sort((a, b) => a.timestamp - b.timestamp)[this.inputLayers[id].length - 1];
    this.processFloodLayer(flood, (result: FeatureCollection) => {
      this.sendLayer(flood, result);
    });
  }

  public processMessage(msg: IAdapterMessage) {
    const value = msg.value as IChainDataMessage;
    if (dependentSims.indexOf(value.simulator) < 0) return;
    if (!this.hasScenario(value.id)) this.initNewScenario(value.id);
    log.info(`ElectricSim processes msg: ${JSON.stringify(msg).substr(0, 500)}`);
    if (this.processed.indexOf(value.timestamp) >= 0) {
      log.warn(`Already processed ${value.timestamp}`);
      return;
    } else {
      this.processed.push(value.timestamp);
    }
    if (!this.hasScenario(value.id)) this.initNewScenario(value.id);
    this.inputLayers[value.id].push(value);
    this.processLatestMessage(value.id, value.isFinal);
  }

  public processTimeMessage(msg: ITimeManagement) {
    log.info(`ElectricSim processes time-msg: ${JSON.stringify(msg).substr(0, 500)}`);
    if (msg.state === TimeState.Reset) {
      this.reset();
    } else if (msg.state === TimeState.Initialization) {
      this.readDataFolder(true);
    }
  }

  public processAllMessages(id: string) {
    const floodLayers = this.inputLayers[id].sort((a, b) => a.timestamp - b.timestamp);
    floodLayers.forEach((flood, index) => {
      this.processFloodLayer(flood, (result: FeatureCollection) => {
        this.sendLayer(flood, result);
      });
    });
  }

  private sendLayer(flood: IChainDataMessage, result: FeatureCollection) {
    const powerResult: IChainDataMessage = { id: flood.id, simulator: ElectricitySim.id, isFinal: flood.isFinal, timestamp: flood.timestamp, data: JSON.stringify(result) };
    this.sendData(CHAIN_TOPIC, powerResult, (err, data) => { });
    this.sendData(ELECTRICITY_TOPIC, powerResult, (err, data) => { });
  }

  public processFloodLayer(msg: IChainDataMessage, callback: (result: FeatureCollection) => void) {
    const floodLayer = msg.data;
    if (!floodLayer) {
      log.warn('No floodlayer received');
      return callback(GeoExtensions.createFeatureCollection([]));
    }
    // Find the previous powerstation states
    var powerLayer = _.find(this.outputLayers[msg.id].sort((a, b) => a.timestamp - b.timestamp), t => +t.timestamp < msg.timestamp);
    if (!powerLayer) {
      log.warn(`No powerlayer found for timestamp ${msg.timestamp}`);
      return callback(GeoExtensions.createFeatureCollection([]));
    }
    log.info(`Found previous power at t=${powerLayer.timestamp} of ${_.size(this.outputLayers)} layers`);

    // Calculate and publish the effects of the flooding update
    var failedObjects: IChangeEvent[] = [];
    var features = JSON.parse(powerLayer.data).features;
    log.info(`Power features before: ${features.length}`);
    failedObjects = this.flooding(floodLayer, powerLayer.id, features);
    failedObjects = this.updatePowerSupplyAreas(failedObjects, features);
    // this.inputLayers[msg.id][msg.timestamp] = powerLayer;
    // this.updateFailedFeatures(failedObjects, powerLayer.id, floodTime);
    // this.sendLayerUpdate(failedObjects, powerLayer, floodTime);
    const newPowerLayer: IChainDataMessage = { id: msg.id, simulator: ElectricitySim.id, isFinal: msg.isFinal, timestamp: msg.timestamp, data: JSON.stringify(GeoExtensions.createFeatureCollection(features)) };
    log.info(`Power features failed: ${failedObjects.length}, Power features after: ${features.length}`);
    this.outputLayers[msg.id].push(newPowerLayer);
    log.info(`Processed ${msg.id} at ${msg.timestamp}`);
    this.sendCAP('STEDIN', `${failedObjects.length} power stations failed`);
    this.sendEmail('STEDIN', 'Power network status', `${failedObjects.length} power stations have failed in the area`);
    callback(GeoExtensions.createFeatureCollection(failedObjects.map(fo => fo.value)));
  }

  private updatePowerSupplyAreas(failedObjects: IChangeEvent[], powerFeatures: Feature[]) {
    var areas: IChangeEvent[] = [];
    failedObjects.forEach(e => {
      let feature: Feature = e.value;
      let state = this.getFeatureState(feature);
      if (
        state === InfrastructureState.Failed &&
        feature.properties.hasOwnProperty('powerSupplyArea') &&
        !powerFeatures.find(pf => {
          return pf.id === 'psa_'.concat(feature.id.toString());
        })
      ) {
        let psa: Feature<Polygon> = <Feature<Polygon>>{};
        psa.id = 'psa_' + feature.id;
        psa.properties = {
          Name: 'Blackout area',
          featureTypeId: 'AffectedArea',
          info: 'No power'
        };
        psa.geometry = JSON.parse(feature.properties['powerSupplyArea']);
        areas.push(<IChangeEvent>{
          value: psa,
          id: psa.id,
          type: ChangeType.Update
        });
        powerFeatures.push(psa);
      }
    });
    failedObjects = failedObjects.concat(areas);
    log.info(`Added ${areas.length} power supply areas, total power features: ${powerFeatures.length}, total failed features: ${failedObjects.length}`);
    return failedObjects;
  }
}
