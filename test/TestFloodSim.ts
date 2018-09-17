import {FloodSim} from '../src/simulators/FloodSim/FloodSim';
import {expect} from 'chai';
import {TEST_BED_OPTS, TEST_DATA_FOLDER, WRITE_OUTPUT} from '.';
import {spy, when, anyString, anything, anyFunction, verify} from 'ts-mockito/lib/ts-mockito';
import path from 'path';

var sim: FloodSim;
var spiedSim: FloodSim;


beforeEach(() => {
  sim = new FloodSim(TEST_DATA_FOLDER, TEST_BED_OPTS);
  spiedSim = spy(sim);
  when(spiedSim.sendData(anyString(), anything(), anything())).thenCall((topic: string, data: any, cb: Function) => {
    console.log(`Sending data on topic ${topic}: ${JSON.stringify(data).substr(0, 500)}`);
    WRITE_OUTPUT(FloodSim.id, `${topic}-${data.timestamp}.json`, data);
    if (cb) cb();
  });
});

describe('FloodSim', () => {
  it('can be initialized with an initializer', () => {
    expect(sim).to.not.be.undefined;
  });
  it('has no consumertopics', () => {
    expect(sim.getConsumerTopics()).to.have.length(0);
  });
  it('has 1 producertopics', () => {
    expect(sim.getProducerTopics()).to.have.length(1);
  });

  describe('publish flood', () => {
    it('should send a flood', async () => {
      sim.setFiles([path.join('.', 'test', 'testdata', 'demo', 'waterlevel_0min.asc'), path.join('.', 'test', 'testdata', 'demo', 'waterlevel_60min.asc')]);
      sim.setInterval(60 * 60 * 1000);
      await sim.publishFlood(true);
      verify(spiedSim.sendData(anyString(), anything(), anything())).times(6);
    });
  });
});
