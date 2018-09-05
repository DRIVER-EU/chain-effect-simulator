import dotenv from 'dotenv';
dotenv.config();
import Winston = require('winston');
import * as fs from 'fs';
import {Consumer} from './src/test-bed/consumer';
import {Producer} from './src/test-bed/producer';
import {NAPConverter} from './src/simulators/NAPConverter/NAPConverter';
import {ITestBedOptions, LogLevel, IAdapterMessage, Logger} from 'node-test-bed-adapter';
import {IFloodDataMessage} from './src/models/Interfaces';
import * as StaticTestBedConfig from './config/config.json';
import {ElectricitySim} from './src/simulators/ElectricitySim/ElectricitySim';
import {Simulator} from './src/simulators/Simulator';
import {IChainScenario} from './src/models/schemas';
import {FloodSim} from './src/simulators/FloodSim/FloodSim';
import {ConsumerProducer} from './src/test-bed/consumerproducer';
const log = Logger.instance;

// INIT LOGGER
Winston.remove(Winston.transports.Console);
Winston.add(Winston.transports.Console, <Winston.ConsoleTransportOptions>{
  colorize: true,
  label: 'chain-effect-sim',
  prettyPrint: true
});

// READ (TEST-BED) CONFIGURATION FILE
var DynamicTestBedConfig;
if (fs.existsSync('./config/dynamic-config.json')) {
  let configText = fs.readFileSync('./config/dynamic-config.json', {encoding: 'utf8'});
  DynamicTestBedConfig = JSON.parse(configText);
  console.warn('Using config/dynamic-config.json (overwrites default config)');
}
const TestBedConfig = DynamicTestBedConfig || StaticTestBedConfig;

var testBedOptions: ITestBedOptions = <any>TestBedConfig;
testBedOptions.logging = {
  logToConsole: LogLevel.Info,
  logToFile: LogLevel.Debug,
  logToKafka: LogLevel.Error,
  logFile: 'log.txt'
};

const registerSims = () => {
  testBedOptions.autoRegisterSchemas = false;
  const clone = o => JSON.parse(JSON.stringify(o));

  // REGISTER SIMULATORS
  const napConverter = new NAPConverter(clone(testBedOptions));
  const electricitySim = new ElectricitySim(clone(testBedOptions));
  const simulators: Simulator[] = [napConverter, electricitySim];

  // REGISTER PRODUCER
  const floodSim = new FloodSim(clone(testBedOptions));
  floodSim.setFiles(['./data/demo/waterlevel_0min_40x40m.asc', './data/demo/waterlevel_60min_40x40m.asc']);
  floodSim.setInterval(60 * 60 * 1000);
  setTimeout(() => {
    floodSim.publishFlood();
  }, 3000);
  temp.stop();
};

testBedOptions.autoRegisterSchemas = true;
var temp = new ConsumerProducer(testBedOptions, registerSims);
