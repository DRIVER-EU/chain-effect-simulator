import { uuid4 } from "node-test-bed-adapter";

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

/** WGS84-based standard representation of a location on earth */
export interface ILocation {
  /** Latitude in degrees (-90, 90] - 0 is equator */
  latitude: number;
  /**
   * Longitude in degrees (-180, 180] - 0 is line [geographic north - Greenwich -
   * geographic south]
   */
  longitude: number;
  /** Altitude in meters - 0 is surface of WGS84-based ellipsoid */
  altitude?: null | undefined | number;
}

/**
 * Common Simulation Space Post, representing a media entity inside the simulation
 * world (e.g. email, news article, facebook post, etc.). *Copyright (C)
 * 2017-2018 XVR Simulation B.V., Delft, The Netherlands, Martijn Hendriks
 * <hendriks @ xvrsim.com>. This file is part of DRIVER+ WP923 Test-bed
 * infrastructure project. This file is licensed under the MIT license :
 * https://github.com/DRIVER-EU/avro-schemas/blob/master/LICENSE*
 */
export interface IPost {
  /** Globally unique identifier for this post */
  guid: string;
  /** Name of this post */
  name: string;
  /** Identifier of the simulator currently responsible for this post */
  owner: string;
  /** Type of crisis media medium this post was placed on/in */
  mediumType: MediumTypes;
  /** Name of the medium this post was placed on/in */
  mediumName: string;
  /** Title of this post */
  header?: null | undefined | string;
  /** Introduction of this post */
  intro?: null | undefined | string;
  /** The body text of this post */
  body: string;
  /** Links to files attached to this post */
  files?: null | undefined | string[];
  /** Indication whether or not this post is visible for any participant */
  visibleForParticipant: boolean;
  /** Name of the sender sending this post */
  senderName: string;
  /** Reference to the role sending this post */
  senderRole?: null | undefined | string;
  /** List of references to the roles that should receive this post personally */
  recipients?: null | undefined | string[];
  /**
   * The fictive creation date and time of this post as the number of milliseconds
   * from the unix epoch, 1 January 1970 00:00:00.000 UTC.
   */
  date: number;
  /** Location of this item */
  location?: null | undefined | ILocation;
}

export const createDefaultMail = () => {
  const mail: IPost = { guid: uuid4(), senderName: ``, name: 'title', body: 'body', date: Date.now(), owner: 'sender', mediumType: MediumTypes.MAIL, mediumName: 'mail', recipients: [`admin@driver.eu`], visibleForParticipant: true };
  return JSON.parse(JSON.stringify(mail));
}