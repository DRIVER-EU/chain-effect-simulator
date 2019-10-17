import dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import {NAPConverter} from './src/simulators/NAPConverter/NAPConverter';
import {ITestBedOptions, LogLevel, Logger} from 'node-test-bed-adapter';
import * as StaticTestBedConfig from './config/config.json';
import {ElectricitySim} from './src/simulators/ElectricitySim/ElectricitySim';
import {FloodSim} from './src/simulators/FloodSim/FloodSim';
import {CareObjectSim} from './src/simulators/CareObjectSim/CareObjectSim';

const FLOOD_DATA_FOLDER = path.join(__dirname, 'data', 'demo');
const SIM_DATA_FOLDER = path.join(__dirname, 'data', 'layers');
const BATCH_RUN_MODE = process.argv.some(val => val === '-b' || val === '--batch');
const log = Logger.instance;
log.info(`Start chain-effect-simulator. (batch mode=${BATCH_RUN_MODE}, layers=${SIM_DATA_FOLDER}, flood=${FLOOD_DATA_FOLDER})`);

// READ (TEST-BED) CONFIGURATION FILE
var DynamicTestBedConfig;
if (fs.existsSync('./config/dynamic-config.json')) {
  let configText = fs.readFileSync('./config/dynamic-config.json', {encoding: 'utf8'});
  DynamicTestBedConfig = JSON.parse(configText);
  console.warn('Using config/dynamic-config.json (overwrites default config)');
}

const clone = o => JSON.parse(JSON.stringify(o));

const TestBedConfig = DynamicTestBedConfig || StaticTestBedConfig;

var testBedOptions: ITestBedOptions = <any>TestBedConfig;
testBedOptions.logging = {
  logToConsole: LogLevel.Info,
  logToFile: LogLevel.Debug,
  logToKafka: LogLevel.Error,
  logFile: 'log.txt'
};

const startFlood = async (floodSim: FloodSim, startImmediately = false) => {
  if (!startImmediately) {
    do {
      await floodSim.sleep(500);
    } while (!floodSim.isConnected);
    log.info('Publishing flood');
    floodSim.publishFlood();
  }
};

const startFloodSim = cb => {
  log.info('Preparing flood...');
  const floodSim = new FloodSim(FLOOD_DATA_FOLDER, clone(testBedOptions), () => {
    floodSim.setFiles(['./waterlevel_0min_40x40m.asc', './waterlevel_60min_40x40m.asc', './waterlevel_120min_40x40m.asc', './waterlevel_240min_40x40m.asc', './waterlevel_360min_40x40m.asc']);
    floodSim.setInterval(60 * 60 * 1000);
    cb(floodSim);
  });
};

const registerSims = () => {
  log.info('Registering simulators...');
  testBedOptions.autoRegisterSchemas = true;

  // REGISTER SIMULATORS
  var napConverter, electricitySim, careSim;
  napConverter = new NAPConverter(SIM_DATA_FOLDER, clone(testBedOptions), () => {
    testBedOptions.autoRegisterSchemas = false; //only register schemas once
    electricitySim = new ElectricitySim(SIM_DATA_FOLDER, clone(testBedOptions), () => {
      careSim = new CareObjectSim(SIM_DATA_FOLDER, clone(testBedOptions), () => {
        // when all simulators are created, start the flood
        startFloodSim(floodSim => {
          if (BATCH_RUN_MODE) {
            startFlood(floodSim, true);
          } else {
            console.log(`Wait for simulation time to start running...`);
          }
        });
      });
    });
  });
};

// Register the simulators
registerSims();
