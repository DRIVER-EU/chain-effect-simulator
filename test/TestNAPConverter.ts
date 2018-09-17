import {NAPConverter} from '../src/simulators/NAPConverter/NAPConverter';
import {expect} from 'chai';
import {mock, when, anyString, anything, anyFunction, instance, spy, verify} from 'ts-mockito';
import {TEST_BED_OPTS, TEST_DATA_FOLDER, DEMO_SCENARIO, FLOOD_DATA_INITIAL, FLOOD_DATA_FINAL, WRITE_OUTPUT} from '.';
import {IAdapterMessage} from 'node-test-bed-adapter';
import {IChainScenario, SimStatus} from '../src/models/schemas';
import {FloodSim} from '../src/simulators/FloodSim/FloodSim';
import {IFloodDataMessage} from '../src/models/Interfaces';
import {Simulator} from '../src/simulators/Simulator';

// Creating mock
// const mockSim: Simulator = mock(Simulator);
// when(mockSim.sendData(anyString(), anything(), anyFunction())).thenCall((topic: string, data: any) => {
//   console.log(`Sending data on topic ${topic}: ${data}`);
// });
// const mockedSim: Simulator = instance(mockSim);

var sim: NAPConverter;
var spiedSim: NAPConverter;

beforeEach(() => {
  sim = new NAPConverter(TEST_DATA_FOLDER, TEST_BED_OPTS);
  spiedSim = spy(sim);
  when(spiedSim.sendData(anyString(), anything(), anyFunction())).thenCall((topic: string, data: any, cb: Function) => {
    console.log(`Sending data on topic ${topic}: ${JSON.stringify(data).substr(0, 500)}`);
    WRITE_OUTPUT(NAPConverter.id, `${topic}-${data.timestamp}.json`, data);
    if (cb) cb();
  });
});

describe('NAPConverter', () => {
  it('can be initialized with an initializer', () => {
    expect(sim).to.not.be.undefined;
  });
  it('has 1 consumertopics', () => {
    expect(sim.getConsumerTopics()).to.have.length(1);
  });
  it('has 1 producertopics', () => {
    expect(sim.getProducerTopics()).to.have.length(1);
  });

  describe('process scenario', () => {
    it('should convert a scenario', () => {
      const initMsg: IAdapterMessage = {
        topic: 'test',
        value: {simId: FloodSim.id, simStatus: SimStatus.INITIAL, scenarioId: DEMO_SCENARIO} as IChainScenario,
        key: 'testkey'
      };
      sim.processScenarioUpdate(initMsg);
      expect(sim.hasScenario(DEMO_SCENARIO)).to.be.true;

      const updateMsg: IAdapterMessage = {
        topic: 'test',
        value: {simId: FloodSim.id, simStatus: SimStatus.UPDATE, scenarioId: DEMO_SCENARIO} as IChainScenario,
        key: 'testkey'
      };
      sim.processScenarioUpdate(updateMsg);

      const flood0: IAdapterMessage = {
        topic: 'test',
        value: {id: DEMO_SCENARIO, timestamp: 0, data: FLOOD_DATA_INITIAL()} as IFloodDataMessage,
        key: 'testkey'
      };
      sim.processMessage(flood0);

      sim.processScenarioUpdate(updateMsg);
      expect(sim.hasScenario(DEMO_SCENARIO)).to.be.true;

      const flood60: IAdapterMessage = {
        topic: 'test',
        value: {id: DEMO_SCENARIO, timestamp: 60 * 60 * 1000, data: FLOOD_DATA_FINAL()} as IFloodDataMessage,
        key: 'testkey'
      };
      sim.processMessage(flood60);

      const finalMsg: IAdapterMessage = {
        topic: 'test',
        value: {simId: FloodSim.id, simStatus: SimStatus.FINISHED, scenarioId: DEMO_SCENARIO} as IChainScenario,
        key: 'testkey'
      };
      sim.processScenarioUpdate(finalMsg);
      verify(spiedSim.sendData(anyString(), anything(), anything())).times(6);
    });
  });
});
