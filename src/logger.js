'use strict';

const { createLogger, transports, format } = require('winston');
const path = require('path');
const fs   = require('fs');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}] ${message}${extra}`;
        })
      ),
    }),
    new transports.File({
      filename: path.join(LOG_DIR, 'app.log'),
      maxsize:  10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    new transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});

module.exports = logger;
