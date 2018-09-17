import {IChainScenario, SimStatus} from '../models/schemas';
import {IAdapterMessage, ITestBedOptions, Logger} from 'node-test-bed-adapter';
import {ConsumerProducer} from '../test-bed/consumerproducer';
import fs from 'fs';
import path from 'path';
import {FeatureCollection, Feature, Point, LineString} from 'geojson';
import {IChangeEvent, ChangeType, InfrastructureState, FailureMode} from '../models/Interfaces';
import {IsoLines, IGridDataSourceParameters} from '../utils/Isolines';

const SCENARIO_TOPIC = process.env.SCENARIO_TOPIC || 'chain_scenario';
const log = Logger.instance;

export abstract class Simulator {
  static readonly id: string;
  protected consumerProducer: ConsumerProducer;
  protected dataFolder: string;
  private _isConnected: boolean = false;
  public get isConnected(): boolean {
    return this._isConnected;
  }

  constructor(dataFolder: string, id: string, options: ITestBedOptions, whenReady?: Function) {
    this.dataFolder = dataFolder;
    options.clientId = id;
    try {
      this.consumerProducer = new ConsumerProducer(options, async () => {
        await this.initialize(id);
        if (whenReady) whenReady();
      });
    } catch (error) {
      log.info(`Error creating consumerProducer for ${id}`);
    }
    this.initFolder(id);
  }

  private initFolder(id) {
    this.assertDataFolder(this.dataFolder);
    this.assertDataFolder(path.join(this.dataFolder, id));
  }

  private assertDataFolder(folder: string) {
    if (fs.existsSync(folder)) return;
    fs.mkdirSync(folder);
  }

  private async initialize(id: string) {
    const consumerTopics = this.getConsumerTopics();
    consumerTopics.forEach(topic => {
      this.consumerProducer.addHandler(topic, msg => this.processMessage(msg));
    });
    this.consumerProducer.addHandler(SCENARIO_TOPIC, msg => this.processScenarioUpdate(msg));
    log.info(`Registered ${consumerTopics.length} handlers for ${id}`);
    this._isConnected = true;
  }

  protected sendScenarioUpdate(scenarioId: string, simId: string, status: SimStatus, cb?: (err?: Error, data?: any) => void) {
    const scenario: IChainScenario = {scenarioId: scenarioId, simId: simId, simStatus: status};
    this.sendData(SCENARIO_TOPIC, scenario, cb);
  }

  public sendData(topic: string, data: any, cb?: (err?: Error, data?: any) => void) {
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

  // Calculate if objects are flooded
  protected flooding(layer: string, objectsLayerId: string, objects: Feature[]): IChangeEvent[] {
    var failedObjects = this.checkWaterLevel(layer, objectsLayerId, objects);
    return failedObjects;
  }

  public async sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  protected checkWaterLevel(layer: string, objectsLayerId: string, objects: Feature[]) {
    var getWaterLevel = this.convertLayerToGrid(layer);
    var failedObjects: IChangeEvent[] = [];

    for (let i = 0; i < objects.length; i++) {
      var ho = objects[i];
      var state = this.getFeatureState(ho);
      if (state === InfrastructureState.Failed) {
        failedObjects.push(<IChangeEvent>{
          id: ho.id,
          value: ho,
          type: ChangeType.Update
        });
        continue;
      }
      var waterLevel;
      switch (ho.geometry.type.toLowerCase()) {
        case 'point':
          waterLevel = getWaterLevel((<Feature<Point>>ho).geometry.coordinates);
          break;
        case 'linestring':
          let maxWaterLevel = 0;
          (<Feature<LineString>>ho).geometry.coordinates.forEach(segm => {
            let level = getWaterLevel(segm);
            maxWaterLevel = Math.max(maxWaterLevel, level);
          });
          waterLevel = maxWaterLevel;
          break;
        default:
          // Winston.warn(`GeometryType not supported: ${ho.geometry.type}`);
          break;
      }
      // Check the max water level the object is able to resist
      var waterResistanceLevel = 0;
      if (ho.properties.hasOwnProperty('_dep_water')) {
        waterResistanceLevel = ho.properties['_dep_water'];
      }
      if (waterLevel > waterResistanceLevel) {
        this.setFeatureState(ho, objectsLayerId, InfrastructureState.Failed, FailureMode.Flooded, false);
        failedObjects.push(<IChangeEvent>{
          id: ho.id,
          value: ho,
          type: ChangeType.Update
        });
      } else if (waterLevel > 0) {
        this.setFeatureState(ho, objectsLayerId, InfrastructureState.Stressed, FailureMode.Flooded, false);
      }
    }
    return failedObjects;
  }

  protected convertLayerToGrid(layer: string) {
    var gridParams = <IGridDataSourceParameters>{};
    IsoLines.convertEsriHeaderToGridParams(layer, gridParams);
    var gridData = IsoLines.convertDataToGrid(layer, gridParams);

    return function getWaterLevel(pt: number[]): number {
      if (!gridData || !gridData[0]) return -1;
      var col = Math.floor((pt[0] - gridParams.startLon) / gridParams.deltaLon);
      if (col < 0 || col >= gridData[0].length) return -1;
      var row = Math.floor((pt[1] - gridParams.startLat) / gridParams.deltaLat);
      if (row < 0 || row >= gridData.length) return -1;
      var waterLevel = gridData[row][col];
      return waterLevel;
    };
  }

  protected getFeatureState(feature: Feature): InfrastructureState {
    return <InfrastructureState>feature.properties['state'];
  }

  protected setFeatureState(feature: Feature, layerId: string, state: InfrastructureState, failureMode: FailureMode = FailureMode.None, publish: boolean = false) {
    feature.properties['state'] = state;
    feature.properties['failureMode'] = failureMode;
    if (!publish) return;
    // Publish feature update
    // this.updateFeature(layerId, feature, <csweb.ApiMeta>{}, () => {});
  }
}
