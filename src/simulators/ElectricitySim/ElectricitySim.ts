import {FeatureCollection, Feature, Polygon} from 'geojson';
import {Dictionary} from '../../test-bed/consumer';
import {IFloodDataMessage, IChainUpdate, IChangeEvent, InfrastructureState, ChangeType} from '../../models/Interfaces';
import {Logger, IAdapterMessage, ITestBedOptions, clone} from 'node-test-bed-adapter';
import {Simulator} from '../Simulator';
import {IChainScenario, SimStatus} from '../../models/schemas';
import {NAPConverter} from '../NAPConverter/NAPConverter';
import fs from 'fs';
import path from 'path';
import * as _ from 'underscore';
import {GeoExtensions} from '../../utils/GeoExtensions';

const POWER_TOPIC = process.env.POWER_TOPIC || 'chain_power';
const WATERHEIGHT_TOPIC = process.env.WATERHEIGHT_TOPIC || 'chain_waterheight';

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

  private inputLayers: Dictionary<IFloodDataMessage[]> = {};
  private outputLayers: Dictionary<IFloodDataMessage[]> = {};
  private processed: number[] = [];

  constructor(dataFolder: string, options: ITestBedOptions, whenReady?: Function) {
    super(dataFolder, ElectricitySim.id, options, whenReady);
    this.readDataFolder();
  }

  public getConsumerTopics(): string[] {
    return [WATERHEIGHT_TOPIC];
  }

  public getProducerTopics(): string[] {
    return [POWER_TOPIC];
  }

  private readDataFolder() {
    const fileName = path.join(this.dataFolder, ElectricitySim.id, `${ElectricitySim.id}.json`);
    const data = fs.readFileSync(fileName, {encoding: 'utf8'});
    this.baseLayer = JSON.parse(data);
    this.baseLayer.features.forEach((f, index) => {
      f.id = `POW_${index}`;
      f.properties['state'] = InfrastructureState.Ok;
    });
    log.info(`Read Electricity basefile: ${fileName}`);
  }

  public hasScenario(scenarioId: string) {
    return this.receivedUpdateCount.hasOwnProperty(scenarioId);
  }

  private initNewScenario(scenarioId: string) {
    if (this.hasScenario(scenarioId)) return log.info(`Already created scenario`);
    this.receivedUpdateCount[scenarioId] = {count: 0, finished: false};
    this.inputLayers[scenarioId] = [];
    const initialLayer: IFloodDataMessage = {id: scenarioId, timestamp: -1, data: JSON.stringify(this.baseLayer)};
    this.outputLayers[scenarioId] = [initialLayer];
    this.sentUpdateCount[scenarioId] = {count: 0, finished: false};
    this.sendScenarioUpdate(scenarioId, ElectricitySim.id, SimStatus.INITIAL);
  }

  private checkFinished(id: string) {
    if (this.receivedUpdateCount[id].finished === true) {
      this.processAllMessages(id);
    }
  }

  public processScenarioUpdate(msg: IAdapterMessage) {
    const value = msg.value as IChainScenario;
    if (dependentSims.indexOf(value.simId) >= 0) {
      if (value.simStatus === SimStatus.INITIAL) {
        this.initNewScenario(value.scenarioId);
      }
      if (value.simStatus === SimStatus.UPDATE) {
        this.receivedUpdateCount[value.scenarioId].count += 1;
      }
      if (value.simStatus === SimStatus.FINISHED) {
        this.receivedUpdateCount[value.scenarioId].finished = true;
        this.checkFinished(value.scenarioId);
      }
    }
  }

  public processMessage(msg: IAdapterMessage) {
    log.info(`ElectricSim processes msg: ${JSON.stringify(msg).substr(0, 500)}`);
    const value = msg.value as IFloodDataMessage;
    if (this.processed.indexOf(value.timestamp) >= 0) {
      log.warn(`Already processed ${value.timestamp}`);
      return;
    } else {
      this.processed.push(value.timestamp);
    }
    if (!this.hasScenario(value.id)) this.initNewScenario(value.id);
    this.inputLayers[value.id].push(value);
    this.checkFinished(value.id);
  }

  public processAllMessages(id: string) {
    const floodLayers = this.inputLayers[id].sort((a, b) => a.timestamp - b.timestamp);
    floodLayers.forEach(flood => {
      this.processFloodLayer(flood, (result: FeatureCollection) => {
        log.info(`Processed ${flood.id} at ${flood.timestamp}`);
        const powerResult: IFloodDataMessage = {id: flood.id, timestamp: flood.timestamp, data: JSON.stringify(result)};
        this.sendData(POWER_TOPIC, powerResult, (err, data) => {
          this.sentUpdateCount[flood.id].count += 1;
          if (this.receivedUpdateCount[flood.id].finished === true && this.receivedUpdateCount[flood.id].count === this.sentUpdateCount[flood.id].count) {
            this.sendScenarioUpdate(flood.id, ElectricitySim.id, SimStatus.FINISHED);
          }
        });
      });
    });
  }

  public processFloodLayer(msg: IFloodDataMessage, callback: (result: FeatureCollection) => void) {
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
    this.inputLayers[msg.id][msg.timestamp] = powerLayer;
    // this.updateFailedFeatures(failedObjects, powerLayer.id, floodTime);
    // this.sendLayerUpdate(failedObjects, powerLayer, floodTime);
    let newPowerLayer: any = {};
    newPowerLayer.features = features;
    newPowerLayer.data = '';
    newPowerLayer.id = 'power';
    newPowerLayer.title = 'Power stations';
    this.sendScenarioUpdate(msg.id, ElectricitySim.id, SimStatus.UPDATE);
    log.info(`Power features failed: ${failedObjects.length}, Power features after: ${features.length}`);
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
