import dotenv from 'dotenv';
dotenv.config();
import Winston = require('winston');
import * as fs from 'fs';
import * as path from 'path';
import {NAPConverter} from './src/simulators/NAPConverter/NAPConverter';
import {ITestBedOptions, LogLevel, Logger} from 'node-test-bed-adapter';
import * as StaticTestBedConfig from './config/config.json';
import {ElectricitySim} from './src/simulators/ElectricitySim/ElectricitySim';
import {FloodSim} from './src/simulators/FloodSim/FloodSim';
import {ConsumerProducer} from './src/test-bed/consumerproducer';
import {CareObjectSim} from './src/simulators/CareObjectSim/CareObjectSim';
import {start} from 'repl';

const SIM_DATA_FOLDER = path.join('data', 'layers');

// INIT LOGGER
Winston.remove(Winston.transports.Console);
Winston.add(Winston.transports.Console, <Winston.ConsoleTransportOptions>{
  colorize: true,
  label: 'chain-effect-sim',
  prettyPrint: true
});
const log = Logger.instance;

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

const startFloodSim = () => {
  log.info('Preparing flood...');
  const floodSim = new FloodSim(SIM_DATA_FOLDER, clone(testBedOptions));
  floodSim.setFiles(['./data/demo/waterlevel_0min_40x40m.asc', './data/demo/waterlevel_60min_40x40m.asc']);
  floodSim.setInterval(60 * 60 * 1000);
  const startFlood = async () => {
    do {
      await floodSim.sleep(500);
    } while (!floodSim.isConnected);
    log.info('Publishing flood');
    floodSim.publishFlood();
  };
  startFlood();
};

const registerSims = () => {
  log.info('Registering simulators...');
  testBedOptions.autoRegisterSchemas = false;

  // REGISTER SIMULATORS
  var napConverter, electricitySim, careSim;
  napConverter = new NAPConverter(SIM_DATA_FOLDER, clone(testBedOptions), () => {
    electricitySim = new ElectricitySim(SIM_DATA_FOLDER, clone(testBedOptions), () => {
      startFloodSim();
    });
  });
  // careSim = new CareObjectSim(SIM_DATA_FOLDER, clone(testBedOptions));
};

testBedOptions.autoRegisterSchemas = true;
var temp = new ConsumerProducer(clone(testBedOptions), registerSims);
