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
import {ElectricitySim} from '../ElectricitySim/ElectricitySim';

const CARE_TOPIC = process.env.CARE_TOPIC || 'chain_care';
const POWER_TOPIC = process.env.POWER_TOPIC || 'chain_power';
const WATERHEIGHT_TOPIC = process.env.WATERHEIGHT_TOPIC || 'chain_waterheight';

// const dependentSims = [ElectricitySim.id, NAPConverter.id];
const dependentSims = [NAPConverter.id];
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

  private inputLayers: Dictionary<IFloodDataMessage[]> = {};
  private outputLayers: Dictionary<IFloodDataMessage[]> = {};
  private processed: number[] = [];

  constructor(dataFolder: string, options: ITestBedOptions) {
    super(dataFolder, CareObjectSim.id, options);
    this.readDataFolder();
  }

  public getConsumerTopics(): string[] {
    // return [WATERHEIGHT_TOPIC, POWER_TOPIC];
    return [WATERHEIGHT_TOPIC];
  }

  public getProducerTopics(): string[] {
    return [CARE_TOPIC];
  }

  private readDataFolder() {
    const fileName = path.join(this.dataFolder, CareObjectSim.id, `${CareObjectSim.id}.json`);
    const data = fs.readFileSync(fileName, {encoding: 'utf8'});
    this.baseLayer = JSON.parse(data);
    this.baseLayer.features.forEach((f, index) => {
      f.id = `GO_${index}`;
      f.properties['state'] = InfrastructureState.Ok;
    });
    log.info(`Read CareObject basefile: ${fileName}`);
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
    this.sendScenarioUpdate(scenarioId, CareObjectSim.id, SimStatus.INITIAL);
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
    log.info(`CareObjectSim processes msg: ${JSON.stringify(msg).substr(0, 500)}`);
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
        this.sendData(CARE_TOPIC, powerResult, (err, data) => {
          this.sentUpdateCount[flood.id].count += 1;
          if (this.receivedUpdateCount[flood.id].finished === true && this.receivedUpdateCount[flood.id].count === this.sentUpdateCount[flood.id].count) {
            this.sendScenarioUpdate(flood.id, CareObjectSim.id, SimStatus.FINISHED);
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
    log.info(`Power features before: ${features.length}`);
    failedObjects = this.flooding(floodLayer, goLayer.id, features);
    // failedObjects = this.updatePowerSupplyAreas(failedObjects, features);
    this.inputLayers[msg.id][msg.timestamp] = goLayer;
    let newgoLayer: any = {};
    newgoLayer.features = features;
    newgoLayer.data = '';
    newgoLayer.id = 'careObjects';
    newgoLayer.title = 'Care objects';
    this.sendScenarioUpdate(msg.id, CareObjectSim.id, SimStatus.UPDATE);
    log.info(`Care features failed: ${failedObjects.length}, Care features after: ${features.length}`);
    callback(GeoExtensions.createFeatureCollection(failedObjects.map(fo => fo.value)));
  }
}
