import winston from 'winston';
import path from 'path';
import { container, injectable } from 'tsyringe';

export enum TransportType {
    STDIO = 'stdio',
    STREAMABLE_HTTP = 'streamable-http',
}
export enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    DEBUG = 'debug'
}

interface LoggerOptions {
    transportType: TransportType;
    logDir: string;
}

@injectable()
class Logger {
    private logger: winston.Logger;
    private transportType: TransportType;

    constructor(options: LoggerOptions) {
        this.transportType = options.transportType;

        const logLevel = LogLevel.INFO;
        const logDir = options.logDir;

        // 创建自定义格式
        const customFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                let logMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.transportType}] ${message}`;

                // 添加额外的元数据
                if (Object.keys(meta).length > 0) {
                    logMessage += ` ${JSON.stringify(meta)}`;
                }

                // 添加错误堆栈
                if (stack) {
                    logMessage += `\n${stack}`;
                }

                return logMessage;
            })
        );

        // 根据传输类型配置不同的输出方式
        const transports = this.createTransports(logDir, customFormat);

        this.logger = winston.createLogger({
            level: logLevel,
            format: customFormat,
            transports
        });
    }

    /**
     * 根据传输类型创建不同的 winston transports
     */
    private createTransports(
        logDir: string,
        format: winston.Logform.Format
    ): winston.transport[] {
        const transports: winston.transport[] = [];

        switch (this.transportType) {
            case TransportType.STDIO:
                transports.push(
                    new winston.transports.File({
                        filename: path.join(logDir, 'error.log'),
                        level: 'error',
                        maxsize: 5242880, // 5MB
                        maxFiles: 5,
                        format
                    }),
                    new winston.transports.File({
                        filename: path.join(logDir, 'runtime.log'),
                        maxsize: 5242880, // 5MB
                        maxFiles: 5,
                        format
                    })
                );
                break;

            case TransportType.STREAMABLE_HTTP:
                transports.push(
                    new winston.transports.Console({
                        format
                    })
                );

                transports.push(
                    new winston.transports.File({
                        filename: path.join(logDir, 'error.log'),
                        level: 'error',
                        maxsize: 5242880, // 5MB
                        maxFiles: 5,
                        format
                    }),
                    new winston.transports.File({
                        filename: path.join(logDir, 'runtime.log'),
                        maxsize: 5242880, // 5MB
                        maxFiles: 5,
                        format
                    })
                );
                break;

            default:
                throw new Error(`Unsupported transport type: ${this.transportType}`);
        }

        return transports;
    }

    error(message: string, meta?: any): void {
        this.logger.error(message, meta);
    }

    warn(message: string, meta?: any): void {
        this.logger.warn(message, meta);
    }

    info(message: string, meta?: any): void {
        this.logger.info(message, meta);
    }

    debug(message: string, meta?: any): void {
        this.logger.debug(message, meta);
    }
}

export function initLogger(options: LoggerOptions) {
    if (!container.isRegistered(Logger)) {
        container.registerInstance(Logger, new Logger(options));
    }
}

export { Logger };
