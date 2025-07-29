#!/usr/bin/env node

import express from "express";

import { McpHostProtocolEvalsServer } from "./host-evals-server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { Logger } from "@/logger/logger.js";
import { container } from "tsyringe";

interface HttpMcpServerOptions {
  port: number;
  host: string;
}

class HttpMcpServer {
  private httpServer: express.Application;
  private transports = {} as Record<string, StreamableHTTPServerTransport>;
  private logger: Logger = container.resolve(Logger);

  constructor(private options: HttpMcpServerOptions) {
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

        const testServer = new McpHostProtocolEvalsServer();
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
      this.httpServer.listen(this.options.port, this.options.host, (error) => {
        if ((error as any)?.code === "EADDRINUSE") {
          this.logger.warn("Start server failed, port is already in use, try next port");
          this.options.port++;
          this.start();
        } else {
          this.logger.info(`MCP endpoint: http://${this.options.host}:${this.options.port}/mcp`);
          this.logger.info(`Health check: http://${this.options.host}:${this.options.port}/health`);
        }
      });
    } catch (error) {
      this.logger.error("Start server failed:", error);
      throw error;
    }
  }
}

export { HttpMcpServer };
