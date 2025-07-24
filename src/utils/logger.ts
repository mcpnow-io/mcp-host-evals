import fs from 'node:fs';

import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logfile = path.resolve(__dirname, '../logs/app.log')
if (!fs.existsSync(logfile)) {
  fs.mkdirSync(path.dirname(logfile), { recursive: true });
}

const logFile = fs.createWriteStream(logfile, { flags: 'a' });

export class logger {
  static info(...args: any[]) {
    const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
    logFile.write(msg);
    console.log(...args);
  }

  static error(...args: any[]) {
    const msg = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}\n`;
    logFile.write(msg);
    console.error(...args);
  }

  static warn(...args: any[]) {
    const msg = `[${new Date().toISOString()}] WARN: ${args.join(' ')}\n`;
    logFile.write(msg);
    console.warn(...args);
  }

  static debug(...args: any[]) {
    const msg = `[${new Date().toISOString()}] DEBUG: ${args.join(' ')}\n`;
    logFile.write(msg);
    console.debug(...args);
  }
}