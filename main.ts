import Winston = require('winston');
import * as fs from 'fs';
import {Consumer} from './src/test-bed/consumer';
import {Producer} from './src/test-bed/producer';
import {NAPConverter} from './src/converter/NAPConverter';
import {ITestBedOptions, LogLevel, IAdapterMessage, Logger} from 'node-test-bed-adapter';
import {IFloodDataMessage} from './src/models/Interfaces';
import * as StaticTestBedConfig from './config/config.json';

const log = Logger.instance;

Winston.remove(Winston.transports.Console);
Winston.add(Winston.transports.Console, <Winston.ConsoleTransportOptions>{
  colorize: true,
  label: 'chain-effect-sim',
  prettyPrint: true
});

var DynamicTestBedConfig;
if (fs.existsSync('./config/dynamic-config.json')) {
  let configText = fs.readFileSync('./config/dynamic-config.json', {encoding: 'utf8'});
  DynamicTestBedConfig = JSON.parse(configText);
  console.warn('Using config/dynamic-config.json (overwrites default config)');
}
const TestBedConfig = DynamicTestBedConfig || StaticTestBedConfig;

// const host = process.env.CHAINEFFECTSIM_SERVER || 'http://localhost';
var testBedOptions: ITestBedOptions = <any>TestBedConfig;
testBedOptions.logging = {
  logToConsole: LogLevel.Info,
  logToFile: LogLevel.Debug,
  logToKafka: LogLevel.Error,
  logFile: 'log.txt'
};

const FLOOD_TOPIC = 'chain_flood';

const napConverter = new NAPConverter();

const consumer = new Consumer(testBedOptions);
const convertNAP = (msg: IAdapterMessage) => {
  log.info(`${JSON.stringify(msg).substr(0, 500)}`);
  const value = msg.value as IFloodDataMessage;
  napConverter.convertLayer(value, result => {
    log.info(`Converted ${value.id}`);
    log.info(`Result ${JSON.stringify(result).substr(0, 500)}`);
  });
};
consumer.addHandler(FLOOD_TOPIC, convertNAP);

const producer = new Producer(testBedOptions, () => {
  sendDemoData();
});

const sendDemoData = () => {
  const demoFile0 = './data/demo/waterlevel_0min_40x40m.asc';
  const demoFile1 = './data/demo/waterlevel_60min_40x40m.asc';
  setTimeout(() => sendFile(demoFile0, 0), 2000);
  setTimeout(() => sendFile(demoFile1, 60 * 60 * 1000), 4000);
};

const sendFile = (demoFile: string, timestamp: number) => {
  if (fs.existsSync(demoFile)) {
    const demoData = fs.readFileSync(demoFile, {encoding: 'utf8'});
    const demoMsg: IFloodDataMessage = {id: 'demo', timestamp: timestamp, data: demoData};
    producer.sendData(FLOOD_TOPIC, demoMsg);
    log.info(`Sent demo data ${timestamp} on topic ${FLOOD_TOPIC}`);
  } else {
    log.info(`demoFile ${demoFile} not found`);
  }
};
