import { EventEmitter } from "events";

export const PASSIVE_FEATURES = [
  // "initialize",
  // "notifications/initialized",
  // 核心工具功能
  "tools/list",
  "tools/call",

  // 资源管理功能
  "resources/list",
  "resources/read",
  "resources/templates/list",

  "resources/subscribe",
  "resources/unsubscribe",

  // 提示功能
  "prompts/list",
  "prompts/get",

  // 根目录功能
  "roots/list",

  // 补全功能
  "completion/complete",

  // 日志功能
  "logging/setLevel",

  // Ping/Pong机制
  "ping",
  "pong",
] as const;
type PassiveFeature = (typeof PASSIVE_FEATURES)[number];

export const ACTIVE_FEATURES = [
  // 基础通知
  "notifications/progress",
  "notifications/message",
  "notifications/cancelled",
  "notifications/initialized",

  // 变更通知
  "notifications/resources/list_changed",
  "notifications/resources/updated",
  "notifications/tools/list_changed",
  "notifications/prompts/list_changed",
  "notifications/roots/list_changed",
  "notifications/logging/message",

  // 采样请求（服务器主动发起）
  "sampling/createMessage",

  // 用户交互请求（可选）
  "elicitation/create",

  // Ping/Pong机制
  "ping",
  "pong",
];
type ActiveFeature = (typeof ACTIVE_FEATURES)[number];

export class FeatureTracker extends EventEmitter {
  private _featuresStatus: Record<
    ActiveFeature | PassiveFeature,
    { name: ActiveFeature | PassiveFeature; isPassed: boolean }
  > = {
      ...PASSIVE_FEATURES.reduce(
        (acc, feature) => ({
          ...acc,
          [feature]: {
            name: feature,
            isPassed: false,
          },
        }),
        {}
      ),
      ...ACTIVE_FEATURES.reduce(
        (acc, feature) => ({
          ...acc,
          [feature]: {
            name: feature,
            isPassed: false,
          },
        }),
        {}
      ),
    };

  constructor() {
    super();
  }

  recordFeatureCall(feature: ActiveFeature | PassiveFeature, success: boolean) {
    console.log("recordFeatureCall", feature, success);
    this._featuresStatus[feature].isPassed = success;
  }

  get featuresStatus() {
    return this._featuresStatus;
  }

  reset() {
    Object.values(this._featuresStatus).forEach((feature) => {
      feature.isPassed = false;
    });
  }
}
