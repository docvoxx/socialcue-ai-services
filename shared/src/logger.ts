// Logger utility for all services
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create a base logger
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${service || 'app'}] ${level}: ${message} ${metaStr}`;
        })
      )
    })
  ]
});

// Create service-specific logger
export function createServiceLogger(serviceName: string) {
  return baseLogger.child({ service: serviceName });
}

// Export default logger
export const logger = baseLogger;
