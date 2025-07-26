import { EventEmitter } from "events";
import { omit } from "lodash-es";

export const PASSIVE_FEATURES = [
  "initialize",

  // tools, skip test, it always implemented.
  "tools/list",
  "tools/call",

  // resources
  "resources/list",
  "resources/read",
  "resources/templates/list",

  // TODO: unimplemented. resources subscribe, unimplemented.
  // "resources/subscribe",
  // "resources/unsubscribe",

  "prompts/list",
  "prompts/get",

  "completion/complete",

  "logging/setLevel",
] as const;
type PassiveFeature = (typeof PASSIVE_FEATURES)[number];

export const ACTIVE_FEATURES = [
  // initialzie
  "notifications/initialized",

  // active features with standard callback event
  "notifications/resources/list_changed",
  // "notifications/resources/updated", // TODO: unimplemented.
  "notifications/tools/list_changed",
  "notifications/prompts/list_changed",
  // "notifications/roots/list_changed", // cant implement, only trigger by client, not server.

  // active features without callback
  "roots/list",
  "sampling/createMessage",
  "elicitation/create",

  // active features with custom callback
  "notifications/progress",
  "notifications/message",


  // others
  "ping",
  "pong",
  // "notifications/cancelled", // TODO unimplemented.

] as const;
export type ActiveFeature = (typeof ACTIVE_FEATURES)[number];

export class FeatureTracker extends EventEmitter {
  // 记录所有功能的状态
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
        {} as Record<PassiveFeature, { name: PassiveFeature; isPassed: boolean }>
      ),
      ...ACTIVE_FEATURES.reduce(
        (acc, feature) => ({
          ...acc,
          [feature]: {
            name: feature,
            isPassed: false,
          },
        }),
        {} as Record<ActiveFeature, { name: ActiveFeature; isPassed: boolean }>
      ),
    };

  constructor() {
    super();
  }

  recordFeatureCall(feature: ActiveFeature | PassiveFeature, success: boolean) {
    if (!this._featuresStatus[feature] || this._featuresStatus[feature].isPassed) {
      return;
    }
    console.log("recordFeatureCall", feature, success);
    this._featuresStatus[feature].isPassed = success;
  }

  get featuresStatus() {
    return this._featuresStatus;
  }

  reset() {
    // 重置除初始化外的所有功能状态
    Object.values(omit(this._featuresStatus, ['notifications/initialized', 'initialize', 'ping', 'pong'])).forEach((feature) => {
      feature.isPassed = false;
    });
  }
}
