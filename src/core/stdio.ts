import { Logger } from "@/logger/logger.js";
import { McpHostProtocolEvalsServer } from "./host-evals-server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { container } from "tsyringe";

class StdioMcpServer {
    private server: McpHostProtocolEvalsServer;
    private transport: StdioServerTransport;
    private logger: Logger = container.resolve(Logger);

    constructor() {
        this.server = new McpHostProtocolEvalsServer();
        this.transport = new StdioServerTransport();
    }

    async start(): Promise<void> {
        try {
            await this.server.connect(this.transport);

            process.on('SIGINT', this.handleShutdown.bind(this));
            process.on('SIGTERM', this.handleShutdown.bind(this));
            process.on('exit', this.handleShutdown.bind(this));

            this.logger.info('MCP Host Protocol Evals Server (stdio) started successfully');
            this.logger.info('Ready to receive MCP messages via stdin/stdout');
        } catch (error) {
            this.logger.error('Failed to start stdio MCP server:', error);
            throw error;
        }
    }

    /**
     * 优雅关闭服务器
     */
    private async handleShutdown(): Promise<void> {
        try {
            this.logger.info('Shutting down stdio MCP server...');
            await this.server.close();
            process.exit(0);
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

export { StdioMcpServer };
