export enum SimStatus {
  INITIAL = 'INITIAL',
  UPDATE = 'UPDATE',
  FINISHED = 'FINISHED'
}

export interface IChainScenario {
  scenarioId: string;
  simId: string;
  simStatus: SimStatus;
}
