import {FeatureCollection, Feature} from 'geojson';

export enum ChangeType {
  Update,
  Create,
  Delete
}

/** In what state is the (critical) infrastructure */
export enum InfrastructureState {
  /** 100% functional */
  Ok = 0,
  /** Still working, but partially failing */
  Stressed = 1,
  /** Not working anymore */
  Failed = 2
}

/** When the infrastructure is stressed or has failed, what was the cause of its failure. */
export enum FailureMode {
  None = 0,
  Unknown = 1,
  Flooded = 2,
  LimitedPower = 4,
  NoMainPower = 8,
  NoBackupPower = 16,
  NoComms = 32
}

/** Incident that has happened */
export enum Incident {
  Flooding,
  Earthquake,
  Fire,
  Explosion,
  GasDispersion,
  TerroristAttack,
  PowerFailure,
  CommunicationFailure,
  TrafficAccident
}

export interface IChangeEvent {
  id: string;
  value: Feature;
  type: ChangeType.Update;
}

export interface IIsoGrid {
  iso: FeatureCollection;
  grid: string;
}

export interface IFeatureCollectionDescription {
  fc: FeatureCollection;
  desc: string;
}

export interface IChainDataMessage {
  id: string;
  simulator: string;
  timestamp: number;
  isFinal: boolean;
  data: string;
}

export interface IChainUpdate {
  count: number;
  finished: boolean;
}
