#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  CompleteRequest,
  CompleteRequestSchema,
  CompleteResult,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  PromptReference,
  ReadResourceRequestSchema,
  ResourceTemplateReference,
  ServerCapabilities,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { name, version } from "../../package.json";
import { ACTIVE_FEATURES, ActiveFeature, FeatureTracker } from "./feature-tracker.js";
import { v4 } from "uuid";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { Logger } from "@/logger/logger";
import { container } from "tsyringe";

enum TOOLS {
  mcp_test_guide = "mcp_test_guide",
  test_tool_call = "test_tool_call",
  trigger_event = "trigger_event",
  callback = "callback",
  get_result = "get_result",
}

const TEST_RESOURCE_URI = "file://test-resource/test-resource.txt";

const USER_HANDLER_PROMPT = "This test does not require calling any tools, it needs to wait for user operations, and when the user answers 'continue', it will continue to evaluate."


const INITIAL_TASKS = [
  {
    title: "Root Directory List Test",
    description:
      "Test whether the MCP server can correctly retrieve the root directory list of the client roots",
    protocol: "roots/list",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'roots/list' event. This will test the client's ability to handle root directory list notifications and subsequently call the roots/list endpoint.`,
    ],
    isManual: false,
  },
  {
    title: "Resource List Changed Notification Test",
    description:
      "Test the client's ability to receive and respond to resource list change notifications",
    protocol: "notifications/resources/list_changed",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'notifications/resources/list_changed' event. This will test whether the client properly receives the notification and responds by calling the resources/list endpoint to refresh its resource cache.`,
    ],
    isManual: false,
  },
  {
    title: "Prompt List Changed Notification Test",
    description:
      "Test the client's ability to receive and respond to prompt list change notifications",
    protocol: "notifications/prompts/list_changed",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'notifications/prompts/list_changed' event. This will test whether the client properly receives the notification and responds by calling the prompts/list endpoint to refresh its prompt cache.`,
    ],
    isManual: false,
  },
  {
    title: "Tools List Changed Notification Test",
    description:
      "Test the client's ability to receive and respond to tools list change notifications",
    protocol: "notifications/tools/list_changed",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'notifications/tools/list_changed' event. This will test whether the client properly receives the notification and responds by calling the tools/list endpoint to refresh its tool cache.`,
    ],
    isManual: false,
  },
  {
    title: "Ping Test",
    description:
      "Test the client's ability to ping the Mcp Server",
    protocol: "ping",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'ping' event. `,
    ],
    isManual: false,
  },
  {
    title: "Logging Set Level Test",
    description:
      "Test the client's ability to set the logging level of the Mcp Server",
    protocol: "logging/setLevel",
    instructions: [
      USER_HANDLER_PROMPT,
      `You must ask user to change the logging level (e.g. 'info', 'warning', 'error'), if user input 'continue', you should skip this step. `,
    ],
    isManual: true,
  },
  {
    title: "Resource Management Test",
    description:
      "Test whether the client can correctly retrieve and read resources from the MCP server",
    protocol: "resources/list,resources/read",
    instructions: [
      USER_HANDLER_PROMPT,
      "You must ask the user to select and send a resource from the current host. Before user send new message, you shouldn't do anything.",
      `The required resource URI is: ${TEST_RESOURCE_URI}.`,
    ],
    isManual: true,
  },
  {
    title: "Resource Subscribe Test",
    description:
      "Test whether the client can correctly subscribe to resources from the MCP server",
    protocol: "resources/subscribe, resources/unsubscribe",
    instructions: [
      USER_HANDLER_PROMPT,
      `You must ask the user to subscribe to the resource uri:'${TEST_RESOURCE_URI}' from the current host. `,
      "And Then When user input 'continue', you should call the tool '${TOOLS.trigger_event}' with event_type 'notifications/resources/updated' to trigger the subscription event. ",
      `And Then ask user to unsubscribe to the resource uri:'${TEST_RESOURCE_URI}' from the current host. `,
      "And Then When user input 'continue', continue to the next step.",
    ],
    isManual: true,
  },
  {
    title: "Prompt Management Test",
    description:
      "Test whether the client can correctly retrieve and use prompts from the MCP server",
    protocol: "prompts/list,prompts/get",
    instructions: [
      USER_HANDLER_PROMPT,
      "You must ask the user to send a prompt named 'test_prompt' to the server. ",
    ],
    isManual: true,
  },
  {
    title: "Completion Management Test",
    description:
      "Test whether the client can correctly retrieve and use completions from the MCP server",
    protocol: "completions/complete",
    instructions: [
      USER_HANDLER_PROMPT,
      "You must ask the user to send prompt named 'test_completion' to the server.",
      "test_completion is a prompt that will trigger a completion from the server, if host is support completion",
    ],
    isManual: true,
  },
  {
    title: "Progress Notification Test",
    description:
      "Test the client's ability to receive and display progress notifications",
    protocol: "notifications/progress",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'notifications/progress' event. This will test whether the client can properly receive and display progress updates from the server.`,
      "You Must ask user to input the progress message content (a float number, e.g. '0.52134213222121') to continue. if user input 'continue', you should skip this step. ",
      `If user input the progress message content, you should call the tool '${TOOLS.callback}' with event_name 'notifications/progress' and message content to confirm that you have successfully received and processed the notification.`,
    ],
    isManual: true,
  },
  {
    title: "Message Notification Test",
    description:
      "Test the client's ability to receive and process server message notifications",
    protocol: "notifications/message",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'notifications/message' event. This will test whether the client can properly receive and process server-sent messages, including different log levels (info, warning, error) and message content.`,
      `You Must ask user to input the message content (a string, e.g. ${v4()}) to continue. if user input 'continue', you should skip this step. `,
      `If user input the message, you Must call the tool '${TOOLS.callback}' with event_name 'notifications/message' with message content to confirm that you have successfully received and processed the notification.`,
    ],
    isManual: true,
  },
  {
    title: "Sampling Create Message Test",
    description:
      "Test the client's ability to create a message from the Mcp Server",
    protocol: "sampling/createMessage",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'sampling/createMessage' event. `,
      "Tell User if client has alert some message, must access the request of host application.",
      "If nothing alert, user should input 'continue' to skip this step."
    ],
    isManual: true,
  },
  {
    title: "Elicitation Create Test",
    description:
      "Test the client's ability to create a elicitation from the Mcp Server",
    protocol: "elicitation/create",
    instructions: [
      `Use the ${TOOLS.trigger_event} tool to fire the 'elicitation/create' event. `,
      "Tell User if client has alert some message, must access the request of host application.",
      "If nothing alert, user should input 'continue' to skip this step.",
    ],
    isManual: true,
  },
].sort((a, b) => a.isManual ? 1 : b.isManual ? -1 : 0);

const replyTextMessage = (message: string) => {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ]
  }
}



export class McpHostProtocolEvalsServer {
  public server: McpServer;
  private tracker: FeatureTracker;
  private testIntervalId?: NodeJS.Timeout;
  private testTasks: Array<{
    title: string;
    description: string;
    instructions: string[];
    protocol?: string;
    isManual?: boolean;
  }> = [];

  private logMessage: string = "";
  private progressMessage: string = "";
  private logLevel: string = "info";
  private logger: Logger = container.resolve(Logger);

  constructor() {
    this.tracker = new FeatureTracker();
    this.logMessage = "";
    this.progressMessage = "";
    this.logLevel = "info";
    this.initializeTestTasks();

    type T = keyof ServerCapabilities
    this.server = new McpServer(
      {
        name,
        version,
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
          resources: {
            listChanged: true,
            subscribe: true,
          },
          prompts: {
            listChanged: true,
          },
          completions: {},
          logging: {},
          experimental: {},
        },
      }
    );
    this.setupToolHandlers();
    this.setupPromptHandlers();
    this.setupResourcesHandlers();
    this.setupCompletionHandlers();
    this.setupLoggingHandlers();
  }

  private initializeTestTasks() {
    this.testTasks = INITIAL_TASKS;
  }

  private setupLoggingHandlers() {
    this.server.server.setRequestHandler(SetLevelRequestSchema, (request) => {
      this.logLevel = request.params.level;
      return replyTextMessage(`Logging level set to ${this.logLevel}`)
    });
  }


  private setupResourcesHandlers() {
    this.server.server.setRequestHandler(ListResourcesRequestSchema, () => {
      this.checkAndClearPendingEvent("resources/list");
      return {
        resources: [
          {
            uri: TEST_RESOURCE_URI,
            name: "Test Resource",
            type: "text/plain",
          },
        ],
      };
    });

    this.server.server.setRequestHandler(
      ReadResourceRequestSchema,
      (request) => {
        return {
          content: [
            {
              mimeType: "text/plain",
              uri: TEST_RESOURCE_URI,
              title: "Test Resource",
              text: "This is a test resource content. if you can see this message, it means the resource has been read successfully.",
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
      return {
        tools: [
          {
            name: TOOLS.mcp_test_guide,
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
                  description: "Test step number to execute, starting from 1, it means the first step",
                  minimum: 1,
                },
                action: {
                  type: "string",
                  description:
                    "Operation type: next (next step), reset (reset)",
                  enum: ["next", "reset"],
                  default: "next",
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
            name: TOOLS.trigger_event,
            description: "Trigger an event and track whether the corresponding callback method is executed",
            inputSchema: {
              type: "object",
              properties: {
                event_type: {
                  type: "string",
                  description: "Type of event to trigger",
                  enum: ACTIVE_FEATURES,
                },
              },
              required: ["event_type"],
            },
          },
          {
            name: TOOLS.callback,
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
          {
            name: TOOLS.get_result,
            description: "Get the test results showing which MCP features have passed and which have failed. This tool should be called after all tasks are completed.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    this.server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const { name, arguments: args } = request.params;
        switch (name) {
          case TOOLS.mcp_test_guide:
            return this.handleTestGuide(
              args as {
                step: number;
                action: "next" | "reset";
              }
            );
          case TOOLS.test_tool_call:
            return { type: "text", text: "success" };
          case TOOLS.trigger_event:
            return this.handleTriggerEvent(
              args as {
                event_type: ActiveFeature;
              }
            );
          case TOOLS.get_result:
            return this.handleGetResult();
          case TOOLS.callback:
            return this.handleCallback(
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
    action: "next" | "reset";
  }) {
    const action = args?.action || "current";
    const requestedStep = args?.step;

    if (action === "reset") {
      this.tracker.reset();
      this.tracker.pendingEvents.clear();
      this.logLevel = "info";
      this.logMessage = "";
      this.progressMessage = "";
      return replyTextMessage("Test progress has been reset, will start from the first task. Please call this tool again to start testing. step is 1.")
    }

    if (requestedStep > this.testTasks.length) {
      return replyTextMessage(`🎉 Congratulations! All assessment tasks have been completed! Please call the tool ${TOOLS.get_result} to get the test result. ensure ask user everything about the test result.`)
    }

    const currentTask = this.testTasks[requestedStep - 1];
    const progressText = `${requestedStep}/${this.testTasks.length}`;

    const response = {
      content: [
        {
          type: "text",
          text:
            `**Task ID**: ${requestedStep}\n` +
            `**MCP Protocol Assessment Task ${progressText}**\n\n` +
            `**Task Title**: ${currentTask.title}\n` +
            `**Test Protocol**: ${currentTask.protocol}\n` +
            `**Task Description**: ${currentTask.description}\n\n` +
            `**Task Instructions**: ${currentTask.instructions.join("\n")}\n\n` +
            (requestedStep < this.testTasks.length
              ? `🔄 **Continue**: Please complete the current test and continue to the next task, next step is ${requestedStep + 1}`
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

    const manualTasks = this.testTasks.filter(task => task.isManual);

    let report = `📊 **MCP Feature Test Results**\n\n`;

    const totalFeatures = passedFeatures.length + failedFeatures.length;
    const passRate = totalFeatures > 0 ? Math.round((passedFeatures.length / totalFeatures) * 100) : 0;

    if (manualTasks.length > 0) {
      report += `🚨 **⚠️ Test Result Reliability Warning ⚠️**\n\n`;
      report += `This test contains ${manualTasks.length} manual test cases. **The accuracy of test results may be affected by user operations**.\n`;
      report += `Please carefully read the manual test case descriptions below to understand factors that may affect test accuracy.\n\n`;
    }

    report += `**Summary:**\n`;
    report += `• Total Features: ${totalFeatures}\n`;
    report += `• ✅ Passed: ${passedFeatures.length}\n`;
    report += `• ❌ Failed: ${failedFeatures.length}\n`;
    report += `• 📈 Pass Rate: ${passRate}%\n\n`;

    return {
      content: [
        {
          type: "text",
          text: report,
        },
      ],
    };
  }


  private _replyTriggerEvent(type: 'success' | 'error', event_type: ActiveFeature) {
    const replySuccess = (event_type: ActiveFeature) => {
      return replyTextMessage(`Event triggered successfully! ${event_type}`)
    }

    const replyUnsupported = (event_type: ActiveFeature) => {
      return replyTextMessage(`Client does not support ${event_type}, please continue to the next step.`)
    }
    return type === 'success' ? replySuccess(event_type) : replyUnsupported(event_type)
  }

  private _replyAskUserInput() {
    return replyTextMessage(`Please ask user to input the following message to continue. if cant get this message, input "continue" to skip this step.
          if user input "continue", you should skip this step. if user input the message, you should call the tool "callback", pass the raw message (ensure the message is only include user input content) to confirm that the message has been received and processed by the client.
          `)
  }

  private _triggerRootList() {
    this.server.server.listRoots().then(roots => {
      this.tracker.recordFeatureCall("roots/list", true);
    });
  }

  private _triggerSamplingCreateMessage() {
    this.server.server.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Who are you?",
          },
        },
      ],
      maxTokens: 100,
    }).then(res => {
      this.tracker.recordFeatureCall("sampling/createMessage", true);
    })
  }

  private _triggerElicitationCreate() {
    this.server.server.elicitInput({
      message: `Can you get this message?`,
      requestedSchema: {
        type: "object",
        properties: {
          isGetElicitation: {
            type: "boolean",
            title: "Can get elicitation",
            description: "Can you get elicitation action?"
          },
        },
        required: ["isGetElicitation"]
      }
    }).then(res => {
      this.tracker.recordFeatureCall("elicitation/create", true);
    })
  }

  private _triggerManualEvent(event_type: ActiveFeature) {
    const capabilities = this.server.server.getClientCapabilities()

    if (event_type === "roots/list") {
      if (!capabilities?.roots) {
        return this._replyTriggerEvent('error', event_type)
      }
      this._triggerRootList()
      return this._replyTriggerEvent('success', event_type)
    }

    if (event_type === "sampling/createMessage") {
      if (!capabilities?.sampling) {
        return this._replyTriggerEvent('error', event_type)
      }
      this._triggerSamplingCreateMessage()
      return this._replyTriggerEvent('success', event_type)
    }

    if (event_type === 'elicitation/create') {
      if (!capabilities?.elicitation) {
        return this._replyTriggerEvent('error', event_type)
      }
      this._triggerElicitationCreate()
      return this._replyTriggerEvent('success', event_type)
    }
    throw new Error(`Unsupported event type: ${event_type}`)
  }

  private async _triggerEnsureCallbackEvent(event_type: ActiveFeature) {
    this.tracker.recordPendingEvent(event_type);
    try {
      await this.sendNotificationByType(event_type);
      return this._replyTriggerEvent('success', event_type)
    } catch (error) {
      return this._replyTriggerEvent('error', event_type)
    }
  }

  private async handleTriggerEvent(args: {
    event_type: ActiveFeature;
  }) {
    const { event_type } = args;

    if (["roots/list", "sampling/createMessage", "elicitation/create"].includes(event_type)) {
      return this._triggerManualEvent(event_type)
    }

    if (Object.keys(this.tracker.eventCallbackMap).includes(event_type)) {
      return this._triggerEnsureCallbackEvent(event_type)
    }

    if (["ping", "pong"].includes(event_type)) {
      this.server.server.ping().then(res => {
        this.tracker.recordFeatureCall("ping", true);
        this.tracker.recordFeatureCall("pong", true);
      })
      return this._replyTriggerEvent('success', event_type)
    }

    if (["notifications/message", "notifications/progress"].includes(event_type)) {
      this.sendNotificationByType(event_type)
      return this._replyAskUserInput()
    }

    throw new Error(`Unsupported event type: ${event_type}`)
  }

  private async handleCallback(args: {
    event_name: string;
    message?: string;
  }) {
    const { event_name, message } = args;

    if (event_name === "notifications/message") {
      if (message === this.logMessage) {
        this.markNotificationFeatureAsCompleted(event_name);
      } else {
        this.logger.info(`message not match, expected: ${this.logMessage}, actual: ${message}`);
      }
      return {
        content: [
          {
            type: "text",
            text: `Callback received: ${event_name}, message: ${message}`
          },
        ],
      };
    }

    if (event_name === "notifications/progress") {
      if (message === this.progressMessage) {
        this.markNotificationFeatureAsCompleted(event_name);
      } else {
        this.logger.info(`message not match, expected: ${this.progressMessage}, actual: ${message}`);
      }
      return {
        content: [
          {
            type: "text",
            text: `Callback received: ${event_name}, message: ${message}`
          },
        ],
      }
    }

    throw new Error(`Unsupported callback event name: ${event_name}`)
  }

  private async sendNotificationByType(eventType: string) {
    switch (eventType) {
      case "notifications/resources/list_changed":
      case "notifications/prompts/list_changed":
      case "notifications/tools/list_changed":
        await this.server.server.notification({
          method: eventType,
        });
        break;
      case "notifications/resources/updated":
        await this.server.server.notification({
          method: eventType,
          params: {
            uri: TEST_RESOURCE_URI,
            title: "Test Resource",
          }
        });
        break;

      case "notifications/progress":
        this.progressMessage = Math.random().toString();
        await this.server.server.notification({
          method: "notifications/progress",
          params: {
            progressMessage: this.progressMessage,
          },
        });
        break;
      case "notifications/message":
        this.logMessage = v4();
        await this.server.server.notification({
          method: "notifications/message",
          params: {
            level: "info",
            logger: "mcp-host-evals",
            data: {
              message: this.logMessage,
            },
          },
        });
        break;

      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }
  }

  private checkAndClearPendingEvent(method: string) {
    const eventData = this.tracker.getPendingEventByMethod(method);
    if (eventData) {
      const { eventId, pendingEvent } = eventData;
      this.tracker.clearPendingEvent(eventId);
      this.markNotificationFeatureAsCompleted(pendingEvent.eventType);
      return true;
    }
    return false;
  }

  private markNotificationFeatureAsCompleted(eventType: string) {
    this.tracker.recordFeatureCall(eventType as any, true);
  }

  private setupPromptHandlers() {
    this.server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      this.checkAndClearPendingEvent("prompts/list");
      return {
        prompts: [
          {
            name: "test_prompt",
            description: "test prompt for MCP functionality testing",
          },
          {
            name: "test_completion",
            description: "test completion for MCP functionality testing",
            arguments: [
              {
                name: "prompt",
                description: "test prompt for MCP functionality testing",
                type: "string",
              }
            ],
            required: ["prompt"],
          }
        ],
      };
    });

    this.server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request) => {
        const { name, arguments: args } = request.params;

        this.checkAndClearPendingEvent("prompts/get");
        if (name === "test_prompt") {
          return {
            description: "MCP functionality test prompt",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `test is passed,continue test`,
                },
              },
            ],
          };
        }

        if (name === "test_completion") {
          const { prompt } = args as { prompt: string };
          return {
            description: "MCP functionality test completion",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `continue test, with user input prompt: ${prompt}`,
                },
              }
            ]
          }
        }
        throw new Error(`Unknown prompt: ${name}`);
      }
    );
  }

  private setupCompletionHandlers() {
    this.server.server.setRequestHandler(
      CompleteRequestSchema,
      async (request) => {
        switch (request.params.ref.type) {
          case "ref/prompt":
            return this.handlePromptCompletion(request, request.params.ref);
          case "ref/resource":
            return this.handleResourceCompletion(request, request.params.ref);

          default:
            throw new McpError(
              ErrorCode.InvalidParams,
              `Invalid completion reference: ${request.params.ref}`,
            );
        }
      }
    )
  }


  private async handlePromptCompletion(
    request: CompleteRequest,
    ref: PromptReference,
  ): Promise<CompleteResult> {
    return {
      completion: {
        values: ["example prompt completion value"],
      },
    }
  }

  private async handleResourceCompletion(
    request: CompleteRequest,
    ref: ResourceTemplateReference,
  ): Promise<CompleteResult> {
    return {
      completion: {
        values: ["example resource completion value"],
      },
    }
  }

  async connect(transport: Transport): Promise<void> {
    const rawOnMessage = transport.onmessage?.bind(transport);
    transport.onmessage = (message) => {
      rawOnMessage?.(message);
      if ((message as any)?.method) {
        this.tracker.recordFeatureCall((message as any).method as any, true);
      }
    }


    await this.server.connect(transport);
  }

  async close(): Promise<void> {
    if (this.testIntervalId) {
      clearInterval(this.testIntervalId);
    }
    this.server.close();
  }
}
