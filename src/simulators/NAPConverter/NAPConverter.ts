import {IChainScenario, SimStatus} from '../../models/schemas';
import dotenv from 'dotenv';
dotenv.config();
import Conrec = require('./conrec');
import _ = require('underscore');
import {FeatureCollection, Feature, Polygon} from 'geojson';
import {Dictionary} from '../../test-bed/consumerproducer';
import {IIsoGrid, IFeatureCollectionDescription, IChainDataMessage, IChainUpdate} from '../../models/Interfaces';
import {Logger, IAdapterMessage, ITestBedOptions, ITiming, TimeState} from 'node-test-bed-adapter';
import {Simulator} from '../Simulator';
import {FloodSim} from '../FloodSim/FloodSim';
import {IsoLines} from '../../utils/Isolines';

const log = Logger.instance;

const CHAIN_TOPIC = process.env.CHAIN_TOPIC || 'chain';
const FLOOD_TOPIC = process.env.FLOOD_TOPIC || 'chain_flood';

const dependentSims = [FloodSim.id];

/**
 * NAPConverter.
 *
 * It listens to the chain topic. Grid data that is published with absolute water levels, will be converted to relative water height.
 * The first grid should have timestamp 0, as it will be used as reference value for converting absolute to relative levels.
 */
export class NAPConverter extends Simulator {
  static readonly id = 'NAPConverter';
  private gridParams: any = {};
  private baseGrid: {[id: string]: number[][]} = {};
  private receivedUpdateCount: Dictionary<IChainUpdate> = {};
  private sentUpdateCount: Dictionary<IChainUpdate> = {};
  private inputLayers: Dictionary<IChainDataMessage[]> = {};

  private header = '';
  private processed: number[] = [];

  constructor(dataFolder: string, options: ITestBedOptions, whenReady?: Function) {
    super(dataFolder, NAPConverter.id, options, whenReady);
  }

  private reset() {
    this.gridParams = {};
    this.baseGrid = {};
    this.receivedUpdateCount = {};
    this.sentUpdateCount = {};
    this.inputLayers = {};
    this.processed.length = 0;
    log.warn(`${NAPConverter.id} has been reset`);
  }

  public getConsumerTopics(): string[] {
    return [CHAIN_TOPIC];
  }

  public getProducerTopics(): string[] {
    return [CHAIN_TOPIC, FLOOD_TOPIC];
  }

  public hasScenario(scenarioId: string) {
    return this.receivedUpdateCount.hasOwnProperty(scenarioId);
  }

  private initNewScenario(scenarioId: string) {
    if (this.hasScenario(scenarioId)) return log.info(`Already created scenario`);
    this.receivedUpdateCount[scenarioId] = {count: 0, finished: false};
    this.sentUpdateCount[scenarioId] = {count: 0, finished: false};
    this.inputLayers[scenarioId] = [];
  }

  public processMessage(msg: IAdapterMessage) {
    const value = msg.value as IChainDataMessage;
    if (dependentSims.indexOf(value.simulator) < 0) return;
    if (!this.hasScenario(value.id)) this.initNewScenario(value.id);
    log.info(`NAPConverter processes msg: ${JSON.stringify(msg).substr(0, 500)}`);
    if (this.processed.indexOf(value.timestamp) >= 0) {
      log.warn(`Already processed ${value.timestamp}`);
      return;
    } else {
      this.processed.push(value.timestamp);
    }
    this.convertLayer(value, result => {
      if (!result) {
        log.warn(`Error converting ${value.id}`);
        return;
      }
      log.info(`Converted ${value.id}`);
      const napGridResult: IChainDataMessage = {id: value.id, simulator: NAPConverter.id, isFinal: value.isFinal, timestamp: value.timestamp, data: result.grid};
      this.sendData(CHAIN_TOPIC, napGridResult, (err, data) => {
        const napFcResult: IChainDataMessage = {id: value.id, simulator: NAPConverter.id, isFinal: value.isFinal, timestamp: value.timestamp, data: JSON.stringify(result.iso)};
        this.sendData(FLOOD_TOPIC, napFcResult, (err, data) => {});
      });
    });
  }

  public processTimeMessage(msg: ITiming) {
    log.info(`NAPConverter processes time-msg: ${JSON.stringify(msg).substr(0, 500)}`);
    if (msg.state === TimeState.Stopped) {
      this.reset();
    }
  }

  public async convertLayer(msg: IChainDataMessage, callback: (result?: IIsoGrid) => void) {
    log.info(`NAPConverter: process timestamp ${msg.timestamp}`);
    if (msg.timestamp === 0) {
      this.createBaseHeightMap(msg.id, msg.data);
      log.info(`Created basegrid for ${msg.id}`);
      let result: IIsoGrid = this.normalizeData(msg.data, this.baseGrid[msg.id]);
      return callback(result);
    }
    if (!this.baseGrid.hasOwnProperty(msg.id)) {
      for (let i = 0; i <= 10; i++) {
        if (!this.baseGrid.hasOwnProperty(msg.id)) {
          log.info(`Basegrid not found for ${msg.id}, trying again`);
          if (i === 10) {
            log.warn(`Basegrid not found for ${msg.id}`);
            return callback();
          }
          await this.sleep(1000);
        } else {
          log.info(`Basegrid found for ${msg.id}`);
          break;
        }
      }
    }
    let result: IIsoGrid = this.normalizeData(msg.data, this.baseGrid[msg.id]);
    callback(result);
  }

  private createBaseHeightMap(id: string, data: string) {
    IsoLines.convertEsriHeaderToGridParams(data, this.gridParams);
    this.baseGrid[id] = [];
    var lines = data.split('\n');
    var splitCellsRegex = new RegExp('[^ ]+', 'g');
    lines.forEach(l => {
      if (l.length > 4 && l.length < 100) {
        this.header += l + '\n';
        return;
      }
      var cells = l.match(splitCellsRegex);
      if (!cells) return;
      var numbers = cells.map((val, ind) => {
        return +val;
      });
      this.baseGrid[id].push(numbers);
    });
    var result = [];
    this.baseGrid[id].forEach(line => {
      result.push(line.join(' '));
    });
  }

  public normalizeData(data: string, baseGrid: number[][]): IIsoGrid {
    var grid = [];
    var lines = data.split('\n');
    var splitCellsRegex = new RegExp('[^ ]+', 'g');
    var c = 0;
    lines.forEach(l => {
      if (l.length > 4 && l.length < 100) {
        return;
      }
      var cells = l.match(splitCellsRegex);
      if (!cells) return;
      var numbers = cells.map((val, ind) => {
        return baseGrid[c][ind] !== -9999 ? +val - baseGrid[c][ind] : -9999;
      });
      numbers = numbers.map((val, ind) => {
        return Math.abs(val) < 2000 && val >= 0 ? val : -9999;
      });
      grid.push(numbers);
      c += 1;
    });
    var result = [];
    grid.forEach(line => {
      result.push(line.join(' '));
    });
    var ftColl;
    if (process.env.USE_ISOLINES && process.env.USE_ISOLINES === 'true') {
      log.info('USE_ISOLINES');
      ftColl = this.convertDataToIsoLines(grid).fc;
    } else {
      ftColl = this.convertDataToPolygonGrid(grid).fc;
    }
    log.info(`# Contour features: ${ftColl.features.length}`);
    return {
      iso: ftColl,
      grid: this.header + result.join('\n')
    };
  }

  /**
   * Convert data to a set of isolines.
   */
  private convertDataToIsoLines(gridData: number[][]): IFeatureCollectionDescription {
    if (!_.isArray(gridData)) {
      log.warn(`gridData is no array`);
      log.debug(`${gridData.toString().slice(0, 500)}`);
      return {
        fc: this.createFeatureCollection([]),
        desc: `gridData is no array`
      };
    }

    var propertyName = this.gridParams.propertyName || 'v';
    var longitudes: number[] = [],
      latitudes: number[] = [];
    var lat = this.gridParams.startLat,
      lon = this.gridParams.startLon,
      deltaLat = this.gridParams.deltaLat,
      deltaLon = this.gridParams.deltaLon;
    var max = this.gridParams.maxThreshold || 5,
      min = this.gridParams.minThreshold || 0;

    gridData = gridData.reverse();
    gridData.forEach(row => {
      latitudes.push(lat);
      lat += deltaLat;
    });
    gridData[0].forEach(col => {
      longitudes.push(lon);
      lon += deltaLon;
      if (lon > 180) lon -= 360;
    });

    var features: Feature[] = [];
    var conrec = new Conrec.Conrec2(),
      nrIsoLevels: number,
      isoLevels: number[];

    if (typeof this.gridParams.contourLevels === 'undefined') {
      nrIsoLevels = 10;
    } else {
      var cl = this.gridParams.contourLevels;
      if (typeof cl === 'number') {
        nrIsoLevels = cl;
      } else {
        isoLevels = cl;
        nrIsoLevels = cl.length;
      }
    }

    if (typeof isoLevels === 'undefined') {
      isoLevels = [];
      var dl = (max - min) / nrIsoLevels;
      for (let l = min + dl / 2; l < max; l += dl) isoLevels.push(Math.round(l * 10) / 10); // round to nearest decimal.
      log.info(`Created ${isoLevels.length} isoLevels: ${JSON.stringify(isoLevels)}`);
    }
    conrec.contour(gridData, 0, gridData.length - 1, 0, gridData[0].length - 1, latitudes, longitudes, nrIsoLevels, isoLevels, this.gridParams.noDataValue || -9999);
    var contourList = conrec.contourList;
    contourList.forEach(contour => {
      var result: Dictionary<any> = {};
      result[propertyName] = contour.level;
      var feature: Feature<Polygon> = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: []
        },
        properties: result
      };
      var ring: number[][] = [];
      feature.geometry.coordinates.push(ring);
      contour.forEach(p => {
        ring.push([p.y, p.x]);
      });
      features.push(feature);
    });

    var desc = '# Number of features above the threshold: ' + features.length + '.\r\n';
    return {
      fc: this.createFeatureCollection(features),
      desc: desc
    };
  }

  /**
   * Convert data to a grid of square GeoJSON polygons, so each drawable point is converted to a square polygon.
   */
  private convertDataToPolygonGrid(gridData: number[][]): IFeatureCollectionDescription {
    var propertyName = this.gridParams.propertyName || 'v';
    var longitudes: number[] = [],
      latitudes: number[] = [];
    var lat = this.gridParams.startLat,
      lon = this.gridParams.startLon,
      deltaLat = this.gridParams.deltaLat,
      deltaLon = this.gridParams.deltaLon;
    var max = this.gridParams.maxThreshold,
      min = this.gridParams.minThreshold;

    var features: Feature[] = [];
    gridData = gridData.reverse();

    gridData.forEach(row => {
      let lon = this.gridParams.startLon;
      row.forEach(n => {
        var value = +n;
        if (value !== this.gridParams.noDataValue || (-9999 && min <= value && value <= max)) {
          var result: Dictionary<any> = {};
          result[propertyName] = value;
          var tl = [lon, lat + deltaLat],
            tr = [lon + deltaLon, lat + deltaLat],
            bl = [lon, lat],
            br = [lon + deltaLon, lat];

          var pg = this.createPolygonFeature([[tl, tr, br, bl, tl]], result);
          features.push(pg);
        }
        lon += deltaLon;
        if (lon > 180) lon -= 360;
      });
      lat += deltaLat;
    });
    var desc = '# Number of features above the threshold: ' + features.length + '.\r\n';
    return {
      fc: this.createFeatureCollection(features),
      desc: desc
    };
  }

  public createFeatureCollection(features: any[]): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  public createPolygonFeature(coordinates: Array<Array<Array<number>>>, properties: Dictionary<any>): Feature {
    if (coordinates === null) throw new Error('No coordinates passed');
    for (var i = 0; i < coordinates.length; i++) {
      var ring = coordinates[i];
      for (var j = 0; j < ring[ring.length - 1].length; j++) {
        if (ring.length < 4) {
          new Error('Each LinearRing of a Polygon must have 4 or more Positions.');
        }
        if (ring[ring.length - 1][j] !== ring[0][j]) {
          new Error('First and last Position are not equivalent.');
        }
      }
    }

    var polygon: Feature<Polygon> = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: coordinates
      },
      properties: properties
    };
    if (!polygon.properties) {
      polygon.properties = {};
    }
    return polygon;
  }
}
