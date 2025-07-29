import "reflect-metadata";
import { cac } from "cac";
import { HttpMcpServer } from "../core/http-server.js";
import { StdioMcpServer } from "../core/stdio.js";

import { fileURLToPath } from 'url';
import path from "node:path";
import { initLogger, TransportType } from "@/logger/logger.js";
import { version, name } from "../../package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const DEFAULT_LOG_DIR = path.join(__dirname, './logs');

(async () => {
    const cli = cac(name);
    /* server mode */
    cli
        .command("http", "Start MCP host evals server over streamable HTTP")
        .option("--port <port>", "Port to listen", { default: 3000 })
        .option("--host <host>", "Host to bind", { default: "127.0.0.1" })
        .example("protocol-evals http --port 4000 --host 0.0.0.0")
        .action(async (options: { port: string | number; host: string }) => {
            initLogger({
                transportType: TransportType.STREAMABLE_HTTP,
                logDir: DEFAULT_LOG_DIR,
            })
            const portRaw = options.port;
            const port = typeof portRaw === "string" ? parseInt(portRaw, 10) : portRaw;
            const host = options.host;

            if (Number.isNaN(port) || port <= 0 || port > 65535) {
                console.error(`Invalid port: ${portRaw}`);
                process.exit(1);
            }

            try {
                const server = new HttpMcpServer({ port, host });
                await server.start();
            } catch (error) {
                console.error("Failed to start HTTP MCP server:", error);
                process.exit(1);
            }
        });

    /**
     * stdio mode
     */
    cli
        .command("stdio", "Start MCP host evals server over stdio")
        .action(async () => {
            try {
                initLogger({
                    transportType: TransportType.STDIO,
                    logDir: DEFAULT_LOG_DIR,
                });
                const server = new StdioMcpServer();
                await server.start();
            } catch (error) {
                console.error("Failed to start stdio MCP server:", error);
                process.exit(1);
            }
        });

    cli.version(version).help();
    cli.parse();
})();
