import {FeatureCollection, Feature, Polygon} from 'geojson';
import {Dictionary} from '../../test-bed/consumer';
import {IFloodDataMessage, IChainUpdate} from '../../models/Interfaces';
import {Logger, IAdapterMessage, ITestBedOptions} from 'node-test-bed-adapter';
import {Simulator} from '../Simulator';
import {IChainScenario, SimStatus} from '../../models/schemas';
import {NAPConverter} from '../NAPConverter/NAPConverter';
require('dotenv').load({path: './.env'});

const POWER_TOPIC = process.env.POWER_TOPIC || 'chain_power';
const WATERHEIGHT_TOPIC = process.env.WATERHEIGHT_TOPIC || 'chain_waterheight';

const dependentSims = [NAPConverter.id];

const log = Logger.instance;
/**
 * Electrical Network Simulator.
 *
 * It listens to flooding.metadata. When a new scenario is published, it creates an accompanying power topic for that scenario
 * and it starts listening to the flooding.scen.scenario topic. When a flooding update is consumed, the effect of the flood on the
 * power-network is calculated. Finally, a new power network layer is published on the power topic.
 */
export class ElectricitySim extends Simulator {
  static readonly id = 'ElectricitySim';
  private receivedUpdateCount: Dictionary<IChainUpdate> = {};
  private sentUpdateCount: Dictionary<IChainUpdate> = {};

  private inputLayers: Dictionary<IFloodDataMessage[]> = {};

  constructor(options: ITestBedOptions) {
    super(ElectricitySim.id, options);
  }

  public getConsumerTopics(): string[] {
    return [WATERHEIGHT_TOPIC];
  }

  public getProducerTopics(): string[] {
    return [POWER_TOPIC];
  }

  public processScenarioUpdate(msg: IAdapterMessage) {
    const value = msg.value as IChainScenario;
    if (dependentSims.indexOf(value.simId) >= 0) {
      if (value.simStatus === SimStatus.INITIAL) {
        this.receivedUpdateCount[value.scenarioId] = {count: 0, finished: false};
        this.inputLayers[value.scenarioId] = [];
        this.sentUpdateCount[value.scenarioId] = {count: 0, finished: false};
        this.sendScenarioUpdate(value.scenarioId, ElectricitySim.id, SimStatus.INITIAL);
      }
      if (value.simStatus === SimStatus.UPDATE) {
        this.receivedUpdateCount[value.scenarioId].count += 1;
      }
      if (value.simStatus === SimStatus.FINISHED) {
        this.receivedUpdateCount[value.scenarioId].finished = true;
        this.processAllMessages(value.scenarioId);
      }
    }
  }

  public processMessage(msg: IAdapterMessage) {
    log.info(`ElectricSim processes msg: ${JSON.stringify(msg).substr(0, 500)}`);
    const value = msg.value as IFloodDataMessage;
    this.inputLayers[value.id].push(value);
  }

  public processAllMessages(id: string) {
    const floodLayers = this.inputLayers[id].sort((a, b) => a.timestamp - b.timestamp);
    floodLayers.forEach(flood => {
      this.convertLayer(flood, result => {
        log.info(`Converted ${flood.id}`);
        const powerResult: IFloodDataMessage = {id: flood.id, timestamp: flood.timestamp, data: result};
        this.sendData(POWER_TOPIC, powerResult);
        this.sentUpdateCount[flood.id].count += 1;
        if (this.receivedUpdateCount[flood.id].finished === true && this.receivedUpdateCount[flood.id].count === this.sentUpdateCount[flood.id].count) {
          this.sendScenarioUpdate(flood.id, ElectricitySim.id, SimStatus.FINISHED);
        }
      });
    });
  }

  public convertLayer(msg: IFloodDataMessage, callback: (result: string) => void) {
    let powerLayer: {[key: string]: any} = {};
    powerLayer.features = [];
    powerLayer.data = '';
    powerLayer.id = 'electricity';
    powerLayer.title = 'Electricity';
    this.sendScenarioUpdate(msg.id, ElectricitySim.id, SimStatus.UPDATE);
    callback(JSON.stringify(powerLayer));
  }
}
