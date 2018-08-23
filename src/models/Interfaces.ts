import {FeatureCollection} from 'geojson';

export interface IIsoGrid {
  iso: FeatureCollection;
  grid: string;
}

export interface IFeatureCollectionDescription {
  fc: FeatureCollection;
  desc: string;
}

export interface IFloodDataMessage {
  id: string;
  timestamp: number;
  data: string;
}
