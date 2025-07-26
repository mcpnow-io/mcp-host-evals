#!/usr/bin/env node

import express from "express";

import { McpHostTestServer } from "./mcp-test-utils-server.js";
import { logger } from "./utils/logger.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || "localhost";

class HttpMcpServer {
  private httpServer: express.Express;
  private transports = {} as Record<string, StreamableHTTPServerTransport>;

  constructor() {
    this.httpServer = express();
    this.httpServer.use(express.json());
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.httpServer.get("/mcp", this.handleSessionRequest.bind(this));
    this.httpServer.delete("/mcp", this.handleSessionRequest.bind(this));
    this.httpServer.post("/mcp", async (req, res) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            this.transports[sessionId] = transport;
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete this.transports[transport.sessionId];
          }
        };

        const testServer = new McpHostTestServer();
        await testServer.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    });
  }

  handleSessionRequest = async (
    req: express.Request,
    res: express.Response
  ) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !this.transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const transport = this.transports[sessionId];
    await transport.handleRequest(req, res);
  };

  async start() {
    try {
      // 启动HTTP服务器
      this.httpServer.listen(PORT, HOST, () => {
        logger.info(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
        logger.info(`Health check: http://${HOST}:${PORT}/health`);
      });
    } catch (error) {
      logger.error("Start server failed:", error);
      throw error;
    }
  }
}

async function main() {
  const server = new HttpMcpServer();

  try {
    await server.start();
  } catch (error) {
    logger.error("Start server failed:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Main function execution error:", error);
    process.exit(1);
  });
}

export { HttpMcpServer };
