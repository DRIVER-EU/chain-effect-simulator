import path = require('path');
import Winston = require('winston');
import util = require('util');
import Conrec = require('./conrec');
import _ = require('underscore');
import {FeatureCollection, Feature, Polygon} from 'geojson';
import {Dictionary} from '../test-bed/consumer';
import {IIsoGrid, IFeatureCollectionDescription, IFloodDataMessage} from '../models/Interfaces';
import {Logger} from 'node-test-bed-adapter';
require('dotenv').load({path: './.env'});

const log = Logger.instance;
/**
 * NAPConverter.
 *
 * It listens to the chain_flood topic. Grid data that is published with absolute water levels, will be converted to relative water height.
 * The first grid should have timestamp 0, as it will be used as reference value for converting absolute to relative levels.
 */
export class NAPConverter {
  private gridParams: any = {};
  private baseGrid: {[id: string]: number[][]} = {};
  private header = '';

  constructor() {}

  public convertLayer(msg: IFloodDataMessage, callback: Function) {
    if (msg.timestamp === 0) {
      this.createBaseHeightMap(msg.id, msg.data);
      return callback(this.baseGrid);
    }
    if (!this.baseGrid.hasOwnProperty(msg.id)) {
      log.warn(`Basegrid not found for ${msg.id}`);
      return callback();
    }
    let result: IIsoGrid = this.normalizeData(msg.data, this.baseGrid[msg.id]);
    let isoLayer: any = {};
    isoLayer.features = result.iso.features;
    isoLayer.data = '';
    isoLayer.id = 'watercontour';
    isoLayer.title = 'Watercontour';
    callback(isoLayer);
  }

  private createBaseHeightMap(id: string, data: string) {
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
      ftColl = this.convertDataToIsoLines(grid).fc;
    } else {
      ftColl = this.convertDataToPolygonGrid(grid).fc;
    }
    Winston.info(`# Contour features: ${ftColl.features.length}`);
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
      Winston.warn(`gridData is no array: ${gridData ? gridData.toString().slice(0, 10) : gridData}`);
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
    var max = this.gridParams.maxThreshold,
      min = this.gridParams.minThreshold;

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
      Winston.info(`Created ${isoLevels.length} isoLevels: ${JSON.stringify(isoLevels)}`);
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
