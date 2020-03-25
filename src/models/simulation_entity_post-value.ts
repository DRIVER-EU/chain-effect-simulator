import { uuid4 } from "node-test-bed-adapter";
import { IPost } from 'test-bed-schemas';

export enum MediumTypes {
  CHAT = 'CHAT',
  INCIDENT_REPORT = 'INCIDENT_REPORT',
  MAIL = 'MAIL',
  MICROBLOG = 'MICROBLOG',
  NEWS = 'NEWS',
  SITUATION_REPORT = 'SITUATION_REPORT',
  SOCIAL_NETWORK = 'SOCIAL_NETWORK',
  VIDEO = 'VIDEO'
}

export const createDefaultMail = () => {
  const mail: IPost = { id: uuid4(), name: 'title', body: 'body', timestamp: Date.now(), owner: 'sender', type: MediumTypes.MAIL, tags: {mediumName: 'mail', recipients: `["admin@driver.eu"]`, visibleForParticipant: 'true' }} ;
  return JSON.parse(JSON.stringify(mail));
}