#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListRootsRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "@/utils/logger.js";
import { name, version } from "../package.json";
import { FeatureTracker } from "./core/feature-tracker.js";

const INITIAL_TASKS = [
  // ====don‘t remove this annotation====
  // {
  //   id: "task_003",
  //   title: "Resource Management Test",
  //   description:
  //     "Test whether the client can correctly retrieve and read resources from the MCP server",
  //   protocol: "resources/list,resources/read",
  //   instructions: [
  //     "You must ask the user to select and send a resource from the current host. The required resource URI is: test://test-resource/test-resource.txt. If the user cannot send the resource, they may respond with 'Continue' to proceed to the next evaluation task.",
  //   ],
  // },
  // {
  //   id: "task_004",
  //   title: "Prompt Management Test",
  //   description:
  //     "Test whether the client can correctly retrieve and use prompts from the MCP server",
  //   protocol: "prompts/list,prompts/get",
  //   instructions: [
  //     "You must ask the user to send a prompt named 'test_prompt' to the server. If the prompt cannot be sent, the user may respond with 'Continue' to proceed to the next evaluation task.",
  //   ],
  // },
  // ====don’t remove this annotation====
  {
    id: "task_005",
    title: "Root Directory List Test",
    description:
      "Test whether the client can correctly retrieve the root directory list of the MCP server",
    protocol: "roots/list",
    instructions: [
      "Use the trigger_event tool to fire the 'notifications/roots/list_changed' event. This will test the client's ability to handle root directory list notifications and subsequently call the roots/list endpoint.",
    ],
  },
  {
    id: "task_006",
    title: "Resource List Changed Notification Test",
    description:
      "Test the client's ability to receive and respond to resource list change notifications",
    protocol: "notifications/resources/list_changed",
    instructions: [
      "Use the trigger_event tool to fire the 'notifications/resources/list_changed' event. This will test whether the client properly receives the notification and responds by calling the resources/list endpoint to refresh its resource cache.",
    ],
  },
  {
    id: "task_007",
    title: "Prompt List Changed Notification Test",
    description:
      "Test the client's ability to receive and respond to prompt list change notifications",
    protocol: "notifications/prompts/list_changed",
    instructions: [
      "Use the trigger_event tool to fire the 'notifications/prompts/list_changed' event. This will test whether the client properly receives the notification and responds by calling the prompts/list endpoint to refresh its prompt cache.",
    ],
  },
  {
    id: "task_008",
    title: "Tools List Changed Notification Test",
    description:
      "Test the client's ability to receive and respond to tools list change notifications",
    protocol: "notifications/tools/list_changed",
    instructions: [
      "Use the trigger_event tool to fire the 'notifications/tools/list_changed' event. This will test whether the client properly receives the notification and responds by calling the tools/list endpoint to refresh its tool cache.",
    ],
  },
  {
    id: "task_009",
    title: "Progress Notification Test",
    description:
      "Test the client's ability to receive and display progress notifications",
    protocol: "notifications/progress",
    instructions: [
      "Use the trigger_event tool to fire the 'notifications/progress' event. This will test whether the client can properly receive and display progress updates from the server, including progress tokens, current progress values, and total progress values.",
      "Once you receive the progress notification, use the 'callback' tool with event_name 'notifications/progress' to confirm that you have successfully received and processed the notification."
    ],
  },
  {
    id: "task_010",
    title: "Message Notification Test",
    description:
      "Test the client's ability to receive and process server message notifications",
    protocol: "notifications/message",
    instructions: [
      "Use the trigger_event tool to fire the 'notifications/message' event. This will test whether the client can properly receive and process server-sent messages, including different log levels (info, warning, error) and message content.",
      "Once you receive the message notification, use the 'callback' tool with event_name 'notifications/message' to confirm that you have successfully received and processed the notification."
    ],
  },

];

export class McpHostTestServer {
  public server: McpServer;
  private tracker: FeatureTracker;
  private currentTaskIndex = 0;
  private testIntervalId?: NodeJS.Timeout;
  private testTasks: Array<{
    id: string;
    title: string;
    description: string;
    protocol: string;
    instructions: string[];
  }> = [];
  private pendingEvents: Map<string, {
    eventType: string;
    expectedCallback: string;
    timestamp: number;
    data?: any;
  }> = new Map();

  constructor() {
    this.tracker = new FeatureTracker();
    this.initializeTestTasks();

    this.server = new McpServer(
      {
        name,
        version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {},
          completions: {},
          experimental: {},
        },
      }
    );
    this.setupToolHandlers();
    this.setupPromptHandlers();
    this.setupRootsHandlers();
    this.setupResourcesHandlers();
  }

  private initializeTestTasks() {
    this.testTasks = INITIAL_TASKS;
  }

  private setupResourcesHandlers() {
    this.server.server.setRequestHandler(ListResourcesRequestSchema, () => {
      this.checkAndClearPendingEvent("resources/list");
      // 标记 resources/list 功能完成
      this.tracker.recordFeatureCall("resources/list", true);
      return {
        resources: [
          {
            uri: "test://test-resource/test-resource.txt",
            name: "Test Resource",
            type: "text/plain",
          },
        ],
      };
    });

    this.server.server.setRequestHandler(
      ReadResourceRequestSchema,
      (request) => {
        this.checkAndClearPendingEvent("resources/read");
        this.tracker.recordFeatureCall("resources/read", true);
        this.tracker.recordFeatureCall("resources/list", true);
        return {
          content: [
            {
              type: "text",
              uri: "test://test-resource/test-resource.txt",
              text: "Test resource content",
            },
          ],
        };
      }
    );
  }

  private setupToolHandlers() {
    // Tool list handler
    this.server.server.setRequestHandler(ListToolsRequestSchema, () => {
      this.checkAndClearPendingEvent("tools/list");
      // 标记 tools/list 功能完成
      this.tracker.recordFeatureCall("tools/list", true);
      return {
        tools: [
          {
            name: "mcp_test_guide",
            description:
              `
    Assessment task iteration tool that guides users to complete MCP protocol testing step by step.
    You must follow the instructions for each task and complete the specified operation before proceeding to the next task.
    After finishing the current task, use this tool to move to the next step.

    Before starting the assessment, you must call this tool with the following parameters to reset the test state:
    After completing all tasks, you must call tool 'get_result' to get the test result.
    `,
            inputSchema: {
              type: "object",
              properties: {
                step: {
                  type: "number",
                  description: "Test step number to execute, starting from 1",
                  minimum: 1,
                },
                action: {
                  type: "string",
                  description:
                    "Operation type: next (next step), current (current step), reset (reset)",
                  enum: ["next", "current", "reset"],
                  default: "current",
                },
              },
            },
          },
          {
            name: "test_tool_call",
            description: "Test tool_call invocation tool",
            inputSchema: {
              type: "object",
              properties: {
                tool_name: {
                  type: "string",
                  description: "Name of the tool to call",
                },
              },
            },
          },
          {
            name: "trigger_event",
            description: "Trigger an event and track whether the corresponding callback method is executed",
            inputSchema: {
              type: "object",
              properties: {
                event_type: {
                  type: "string",
                  description: "Type of event to trigger (e.g., 'notifications/resources/list_changed', 'notifications/prompts/list_changed')",
                  enum: [
                    "notifications/roots/list_changed",
                    "notifications/resources/list_changed",
                    "notifications/prompts/list_changed",
                    "notifications/tools/list_changed",
                    "notifications/progress",
                    "notifications/message"
                  ],
                },
                data: {
                  type: "object",
                  description: "Event data payload (optional)",
                },
              },
              required: ["event_type"],
            },
          },
          {
            name: "get_result",
            description: "Get the current test results showing which MCP features have passed and which have failed",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "callback",
            description: "Callback tool to confirm that a notification event has been received and processed by the client",
            inputSchema: {
              type: "object",
              properties: {
                event_name: {
                  type: "string",
                  description: "Name of the event that was received (e.g., 'notifications/progress', 'notifications/message')",
                  enum: [
                    "notifications/progress",
                    "notifications/message",
                  ],
                },
                message: {
                  type: "string",
                  description: "Optional message describing what was received or processed",
                },
              },
              required: ["event_name"],
            },
          },

        ],
      };
    });

    this.server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        this.tracker.recordFeatureCall(request.method, true);
        const { name, arguments: args } = request.params;
        switch (name) {
          case "mcp_test_guide":
            return await this.handleTestGuide(
              args as {
                step: number;
                action: "next" | "current" | "reset";
              }
            );
          case "test_tool_call":
            return { type: "text", text: "success" };
          case "trigger_event":
            return await this.handleTriggerEvent(
              args as {
                event_type: string;
                data?: any;
              }
            );
          case "get_result":
            return this.handleGetResult();
          case "callback":
            return await this.handleCallback(
              args as {
                event_name: string;
                message?: string;
              }
            );
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      }
    );
  }

  private async handleTestGuide(args: {
    step: number;
    action: "next" | "current" | "reset";
  }) {
    const action = args?.action || "current";
    const requestedStep = args?.step;

    if (action === "reset") {
      this.currentTaskIndex = 0;
      this.tracker.reset();
      this.pendingEvents.clear();
      return {
        content: [
          {
            type: "text",
            text: "🔄 Test progress has been reset, will start from the first task. Please call this tool again to start testing.",
          },
        ],
      };
    }

    if (action === "next" && requestedStep) {
      this.currentTaskIndex = Math.min(
        requestedStep - 1,
        this.testTasks.length - 1
      );
    }

    if (this.currentTaskIndex >= this.testTasks.length) {
      return {
        content: [
          {
            type: "text",
            text:
              "🎉 Congratulations! All assessment tasks have been completed!\n\n📊 Test Summary:\n" +
              `- Total tasks: ${this.testTasks.length}\n` +
              `- Completed: ${this.testTasks.length}\n` +
              "- Completion rate: 100%\n\n" +
              "You have successfully completed all core functionality tests of the MCP protocol.",
          },
        ],
      };
    }

    const currentTask = this.testTasks[this.currentTaskIndex];
    const progressText = `${this.currentTaskIndex + 1}/${this.testTasks.length
      }`;

    const response = {
      content: [
        {
          type: "text",
          text:
            `📋 **MCP Protocol Assessment Task ${progressText}**\n\n` +
            `🎯 **Task ID**: ${currentTask.id}\n` +
            `📝 **Task Title**: ${currentTask.title}\n` +
            `🔗 **Test Protocol**: ${currentTask.protocol}\n` +
            `📖 **Task Description**: ${currentTask.description}\n\n` +
            "📋 **Instructions**:\n" +
            currentTask.instructions
              .map((instruction, index) => `${index + 1}. ${instruction}`)
              .join("\n") +
            "\n\n" +
            `📊 **Current Progress**: ${progressText}\n\n` +
            "⚡ **Continue Testing**: After completing the current task, please call this tool and pass in the next step number:\n" +
            "```json\n" +
            "{\n" +
            `  "step": ${this.currentTaskIndex + 2},\n` +
            `  "action": "next"\n` +
            "}\n" +
            "```\n\n" +
            (this.currentTaskIndex < this.testTasks.length - 1
              ? "🔄 **Continue**: Please complete the current test and continue to the next task"
              : "🏁 **Almost Done**: This is the last test task"),
        },
      ],
    };

    return response;
  }

  private handleGetResult() {
    const featuresStatus = this.tracker.featuresStatus;

    const passedFeatures: string[] = [];
    const failedFeatures: string[] = [];

    Object.values(featuresStatus).forEach(feature => {
      if (feature.isPassed) {
        passedFeatures.push(feature.name);
      } else {
        failedFeatures.push(feature.name);
      }
    });

    let report = `📊 **MCP Feature Test Results**\n\n`;

    const totalFeatures = passedFeatures.length + failedFeatures.length;
    const passRate = totalFeatures > 0 ? Math.round((passedFeatures.length / totalFeatures) * 100) : 0;

    report += `**Summary:**\n`;
    report += `• Total Features: ${totalFeatures}\n`;
    report += `• ✅ Passed: ${passedFeatures.length}\n`;
    report += `• ❌ Failed: ${failedFeatures.length}\n`;
    report += `• 📈 Pass Rate: ${passRate}%\n\n`;

    if (passedFeatures.length > 0) {
      report += `## ✅ **Passed Features (${passedFeatures.length})**\n\n`;
      passedFeatures.forEach(feature => {
        report += `- ${feature}\n`;
      });
    }
    if (failedFeatures.length > 0) {
      report += `## ❌ **Failed Features (${failedFeatures.length})**\n\n`;
      failedFeatures.forEach(feature => {
        report += `- ${feature}\n`;
      });
    } else {
      report += `🎉 **Congratulations!** All features have passed!\n`;
    }

    return {
      content: [
        {
          type: "text",
          text: report,
        },
      ],
    };
  }

  private async handleTriggerEvent(args: {
    event_type: string;
    data?: any;
  }) {
    const { event_type, data } = args;

    // Map event types to their expected callback methods
    const eventCallbackMap: Record<string, string> = {
      "notifications/roots/list_changed": "roots/list",
      "notifications/resources/list_changed": "resources/list",
      "notifications/prompts/list_changed": "prompts/list",
      "notifications/tools/list_changed": "tools/list",
      "notifications/progress": "progress_callback",
      "notifications/message": "message_callback"
    };

    const expectedCallback = eventCallbackMap[event_type];
    if (!expectedCallback) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Unknown event type: ${event_type}`,
          },
        ],
      };
    }

    // Generate unique event ID
    const eventId = `${event_type}_${Date.now()}`;

    // Store the pending event
    this.pendingEvents.set(eventId, {
      eventType: event_type,
      expectedCallback,
      timestamp: Date.now(),
      data,
    });

    try {
      // Send the notification based on event type
      await this.sendNotificationByType(event_type, data);

      // Record that the notification has been sent but not yet completed (waiting for callback)
      logger.info(`📤 Notification sent: ${event_type}, waiting for callback: ${expectedCallback}`);

      return {
        content: [
          {
            type: "text",
            text:
              `✅ Event triggered successfully!\n\n` +
              `🎯 **Event**: ${event_type}\n` +
              `🔍 **Expected Callback**: ${expectedCallback}\n` +
              `⏰ **Event ID**: ${eventId}\n` +
              `📊 **Status**: Waiting for callback execution...\n\n` +
              `The system will monitor whether the expected callback method is executed.\n` +
              `Once the callback is executed, the feature will be marked as completed in FeatureTracker.`,
          },
        ],
      };
    } catch (error) {
      // Remove the pending event if sending failed
      this.pendingEvents.delete(eventId);

      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to trigger event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async handleCallback(args: {
    event_name: string;
    message?: string;
  }) {
    const { event_name, message } = args;

    const eventCleared = this.checkAndClearPendingEventByType(event_name);

    if (eventCleared) {
      return {
        content: [
          {
            type: "text",
            text: "success"
          },
        ],
      };
    } else {
      this.markNotificationFeatureAsCompleted(event_name);

      return {
        content: [
          {
            type: "text",
            text: "success"
          },
        ],
      };
    }
  }

  private async sendNotificationByType(eventType: string, data?: any) {
    switch (eventType) {
      case "notifications/roots/list_changed":
        await this.server.server.notification({
          method: "notifications/roots/list_changed",
          params: data || {},
        });
        break;
      case "notifications/resources/list_changed":
        await this.server.server.notification({
          method: "notifications/resources/list_changed",
          params: data || {},
        });
        break;

      case "notifications/prompts/list_changed":
        await this.server.server.notification({
          method: "notifications/prompts/list_changed",
          params: data || {},
        });
        break;

      case "notifications/tools/list_changed":
        await this.server.server.notification({
          method: "notifications/tools/list_changed",
          params: data || {},
        });
        break;

      case "notifications/progress":
        await this.server.server.notification({
          method: "notifications/progress",
          params: {
            progressToken: "test_progress",
            progress: data?.progress || 50,
            total: data?.total || 100,
            ...data,
          },
        });
        break;

      case "notifications/message":
        await this.server.server.notification({
          method: "notifications/message",
          params: {
            level: data?.level || "info",
            logger: "mcp-test-server",
            data: {
              message: data?.message || "Test notification message",
              ...data,
            },
          },
        });
        break;

      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }
  }

  private checkAndClearPendingEvent(method: string) {
    let eventCleared = false;
    for (const [eventId, pendingEvent] of this.pendingEvents.entries()) {
      if (pendingEvent.expectedCallback === method) {
        this.pendingEvents.delete(eventId);
        logger.info(
          `✅ Pending event cleared: ${pendingEvent.eventType} -> ${method} executed`
        );

        this.markNotificationFeatureAsCompleted(pendingEvent.eventType);
        eventCleared = true;
      }
    }
    return eventCleared;
  }

  private checkAndClearPendingEventByType(eventType: string) {
    let eventCleared = false;
    for (const [eventId, pendingEvent] of this.pendingEvents.entries()) {
      if (pendingEvent.eventType === eventType) {
        this.pendingEvents.delete(eventId);
        logger.info(
          `✅ Pending event cleared: ${eventType} -> callback executed`
        );

        this.markNotificationFeatureAsCompleted(eventType);
        eventCleared = true;
      }
    }
    return eventCleared;
  }

  private markNotificationFeatureAsCompleted(eventType: string) {
    let featureName: string;

    switch (eventType) {
      case "notifications/resources/list_changed":
        featureName = "notifications/resources/list_changed";
        break;
      case "notifications/prompts/list_changed":
        featureName = "notifications/prompts/list_changed";
        break;
      case "notifications/tools/list_changed":
        featureName = "notifications/tools/list_changed";
        break;
      case "notifications/progress":
        featureName = "notifications/progress";
        break;
      case "notifications/message":
        featureName = "notifications/message";
        break;
      default:
        logger.warn(`Unknown event type for feature tracking: ${eventType}`);
        return;
    }

    this.tracker.recordFeatureCall(featureName as any, true);
  }

  public getPendingEvents(): Array<{
    id: string;
    eventType: string;
    expectedCallback: string;
    elapsedTime: number;
    data?: any;
  }> {
    const now = Date.now();
    const result: Array<{
      id: string;
      eventType: string;
      expectedCallback: string;
      elapsedTime: number;
      data?: any;
    }> = [];

    for (const [eventId, event] of this.pendingEvents.entries()) {
      result.push({
        id: eventId,
        eventType: event.eventType,
        expectedCallback: event.expectedCallback,
        elapsedTime: now - event.timestamp,
        data: event.data,
      });
    }

    return result;
  }

  public clearExpiredEvents(maxAgeMs: number = 30000): Array<{
    id: string;
    eventType: string;
    expectedCallback: string;
  }> {
    const now = Date.now();
    const expiredEvents: Array<{
      id: string;
      eventType: string;
      expectedCallback: string;
    }> = [];

    for (const [eventId, event] of this.pendingEvents.entries()) {
      if (now - event.timestamp > maxAgeMs) {
        expiredEvents.push({
          id: eventId,
          eventType: event.eventType,
          expectedCallback: event.expectedCallback,
        });
        this.pendingEvents.delete(eventId);
      }
    }

    if (expiredEvents.length > 0) {
      logger.info(`Cleared ${expiredEvents.length} expired events`, expiredEvents);
    }

    return expiredEvents;
  }

  private setupPromptHandlers() {
    // Prompt list handler
    this.server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      this.checkAndClearPendingEvent("prompts/list");
      this.tracker.recordFeatureCall("prompts/list", true);
      return {
        prompts: [
          {
            name: "test_prompt",
            description: "test prompt for MCP functionality testing",
          },
        ],
      };
    });

    // Prompt get handler
    this.server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request) => {
        this.checkAndClearPendingEvent("prompts/get");
        this.tracker.recordFeatureCall("prompts/get", true);
        const { name, arguments: args } = request.params;

        if (name === "test_prompt") {
          return {
            description: "MCP functionality test prompt",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `continue test`,
                },
              },
            ],
          };
        }

        if (name === "guide_prompt") {
          console.log("status:", JSON.stringify(this.tracker.featuresStatus, null, 2));
          const step = args?.step || "1";
          return {
            description: "MCP test guidance prompt",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `You are executing step ${step} of the MCP functionality test. Please follow the guidance to complete the test.`,
                },
              },
            ],
          };
        }

        throw new Error(`Unknown prompt: ${name}`);
      }
    );

  }

  private setupRootsHandlers() {
    this.server.server.setRequestHandler(ListRootsRequestSchema, async () => {
      this.checkAndClearPendingEvent("roots/list");
      this.tracker.recordFeatureCall("roots/list", true);
      return {
        roots: [
          {
            uri: "file:///tmp/mcp-test",
            name: "MCP Test Directory",
          }
        ],
      };
    });
  }

  async connect(transport: StreamableHTTPServerTransport): Promise<void> {
    await this.server.server.connect(transport);
  }

  async stop(): Promise<void> {
    logger.info("🛑 Stopping MCP test server...");

    // Stop periodic notifications
    if (this.testIntervalId) {
      clearInterval(this.testIntervalId);
    }
  }
}
