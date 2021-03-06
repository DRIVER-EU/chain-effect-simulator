import {CareObjectSim} from '../src/simulators/CareObjectSim/CareObjectSim';
import {expect} from 'chai';
import {mock, when, anyString, anything, anyFunction, instance, spy, verify} from 'ts-mockito';
import {TEST_BED_OPTS, TEST_DATA_FOLDER, DEMO_SCENARIO, FLOOD_DATA_INITIAL, FLOOD_DATA_FINAL, WRITE_OUTPUT, NAP_DATA_INITIAL, NAP_DATA_FINAL, POWER_DATA_INITIAL, POWER_DATA_FINAL, POWER_DATA_UPDATE} from '.';
import {IAdapterMessage} from 'node-test-bed-adapter';
import {IChainScenario, SimStatus} from '../src/models/schemas';
import {FloodSim} from '../src/simulators/FloodSim/FloodSim';
import {IChainDataMessage} from '../src/models/Interfaces';
import {NAPConverter} from '../src/simulators/NAPConverter/NAPConverter';
import { ElectricitySim } from '../src/simulators/ElectricitySim/ElectricitySim';

// Creating mock
// const mockSim: Simulator = mock(Simulator);
// when(mockSim.sendData(anyString(), anything(), anyFunction())).thenCall((topic: string, data: any) => {
//   console.log(`Sending data on topic ${topic}: ${data}`);
// });
// const mockedSim: Simulator = instance(mockSim);

var sim: CareObjectSim;
var spiedSim: CareObjectSim;

beforeEach(() => {
  sim = new CareObjectSim(TEST_DATA_FOLDER, TEST_BED_OPTS);
  spiedSim = spy(sim);
  when(spiedSim.sendData(anyString(), anything(), anyFunction())).thenCall((topic: string, data: any) => {
    console.log(`Sending data on topic ${topic}: ${JSON.stringify(data).substr(0, 500)}`);
    WRITE_OUTPUT(CareObjectSim.id, `${topic}-${data.timestamp}.json`, data);
  });
});

describe('CareObjectSim', () => {
  it('can be initialized with an initializer', () => {
    expect(sim).to.not.be.undefined;
  });
  it('has 1 consumertopics', () => {
    expect(sim.getConsumerTopics()).to.have.length(1);
  });
  it('has 2 producertopics', () => {
    expect(sim.getProducerTopics()).to.have.length(2);
  });

  describe('process scenario', () => {
    it('should convert a scenario', () => {
      const flood0: IAdapterMessage = {
        topic: 'test',
        value: {id: DEMO_SCENARIO, simulator: NAPConverter.id, isFinal: false, timestamp: 0, data: NAP_DATA_INITIAL()} as IChainDataMessage,
        key: 'testkey'
      };
      sim.processMessage(flood0);
      expect(sim.hasScenario(DEMO_SCENARIO)).to.be.true;

      const flood60: IAdapterMessage = {
        topic: 'test',
        value: {id: DEMO_SCENARIO, simulator: NAPConverter.id, isFinal: true, timestamp: 60 * 60 * 1000, data: NAP_DATA_INITIAL()} as IChainDataMessage,
        key: 'testkey'
      };
      sim.processMessage(flood60);

      const power_1: IAdapterMessage = {
        topic: 'test',
        value: {id: DEMO_SCENARIO, simulator: ElectricitySim.id, isFinal: false, timestamp: -1, data: POWER_DATA_INITIAL()} as IChainDataMessage,
        key: 'testkey'
      };
      sim.processMessage(power_1);
      expect(sim.hasScenario(DEMO_SCENARIO)).to.be.true;

      const power0: IAdapterMessage = {
        topic: 'test',
        value: {id: DEMO_SCENARIO, simulator: ElectricitySim.id, isFinal: false, timestamp: 0, data: POWER_DATA_UPDATE()} as IChainDataMessage,
        key: 'testkey'
      };
      sim.processMessage(power0);
      expect(sim.hasScenario(DEMO_SCENARIO)).to.be.true;

      const power60: IAdapterMessage = {
        topic: 'test',
        value: {id: DEMO_SCENARIO, simulator: ElectricitySim.id, isFinal: true, timestamp: 60 * 60 * 1000, data: POWER_DATA_FINAL()} as IChainDataMessage,
        key: 'testkey'
      };
      sim.processMessage(power60);

      verify(spiedSim.sendData(anyString(), anything(), anything())).times(3);
    });
  });
});
