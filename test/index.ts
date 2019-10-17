import {ITestBedOptions, IAdapterMessage} from 'node-test-bed-adapter';
import path from 'path';
import fs from 'fs';
import { IChainDataMessage } from '../src/models/Interfaces';
require('./TestFloodSim');
require('./TestNAPConverter');
require('./TestElectricitySim');
require('./TestCareObjectSim');

export const FLOOD_DATA_INITIAL = () => fs.readFileSync(path.join('.', 'test', 'testdata', 'demo', 'waterlevel_0min.asc'), 'utf8');
export const FLOOD_DATA_FINAL = () => fs.readFileSync(path.join('.', 'test', 'testdata', 'demo', 'waterlevel_60min.asc'), 'utf8');
export const NAP_DATA_INITIAL = () => fs.readFileSync(path.join('.', 'test', 'testdata', 'NAPConverter', 'chain-0.json'), 'utf8');
export const NAP_DATA_FINAL = () => fs.readFileSync(path.join('.', 'test', 'testdata', 'NAPConverter', 'chain-3600000.json'), 'utf8');
export const POWER_DATA_INITIAL = () => fs.readFileSync(path.join('.', 'test', 'testdata', 'ElectricitySim', 'chain--1.json'), 'utf8');
export const POWER_DATA_UPDATE = () => fs.readFileSync(path.join('.', 'test', 'testdata', 'ElectricitySim', 'chain-0.json'), 'utf8');
export const POWER_DATA_FINAL = () => fs.readFileSync(path.join('.', 'test', 'testdata', 'ElectricitySim', 'chain-3600000.json'), 'utf8');
export const DEMO_SCENARIO: string = 'demo-scenario';
export const TEST_DATA_FOLDER = path.join('.', 'test', 'testdata');

export const WRITE_OUTPUT = (sim: string, file: string, data: IChainDataMessage) => {
  fs.writeFileSync(path.join('.', 'test', 'testdata', sim, file), data.data, 'utf8');
};

export const TEST_BED_OPTS: ITestBedOptions = {
  clientId: 'chain-effect-sim',
  kafkaHost: null,
  schemaRegistry: null,
  wrapUnions: 'auto',
  heartbeatInterval: 10000,
  fromOffset: true,
  fetchAllSchemas: false,
  fetchAllVersions: false,
  autoRegisterSchemas: false,
  schemaFolder: './data/schemas',
  consume: [
    {
      topic: 'chain_scenario',
      offset: -1
    },
    {
      topic: 'chain_flood',
      offset: -1
    },
    {
      topic: 'chain_power',
      offset: -1
    },
    {
      topic: 'chain_waterheight',
      offset: -1
    },
    {
      topic: 'standard_cap',
      offset: -1
    }
  ],
  produce: ['chain_scenario', 'chain_flood', 'chain_power', 'chain_waterheight', 'standard_cap']
};
