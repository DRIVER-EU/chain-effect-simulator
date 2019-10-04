import {createLogger, transports, format} from 'winston';
import Transport = require('winston-transport');
import {Logger} from 'node-test-bed-adapter';

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class YourCustomTransport extends Transport {
  constructor() {
      super();
  }

  log(info, callback) {
    Logger.instance.info(info);

    // Perform the writing to the remote service
    callback();
  }
}

export const getLogger = (label: string = '') => {
  return createLogger({
    format: format.combine(format.label({label: `${label}`}), format.timestamp(), format.colorize()),
    transports: [new transports.Console(), new YourCustomTransport()]
  });
};
