import { Logger } from "@/logger/logger";
import { omit } from "lodash-es";
import { container } from "tsyringe";

export const PASSIVE_FEATURES = [
  "initialize",

  // tools, skip test, it always implemented.
  "tools/list",
  "tools/call",

  // resources
  "resources/list",
  "resources/read",
  "resources/templates/list",

  "resources/subscribe",
  "resources/unsubscribe",

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
  "notifications/resources/updated",
  "notifications/tools/list_changed",
  "notifications/prompts/list_changed",
  // "notifications/roots/list_changed", // can't implement, only trigger by client, server cant trigger it.

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

export class FeatureTracker {
  private logger: Logger = container.resolve(Logger);
  public _eventCallbackMap: Record<string, string> = {
    "notifications/resources/list_changed": "resources/list",
    "notifications/prompts/list_changed": "prompts/list",
    "notifications/tools/list_changed": "tools/list",
    "notifications/resources/updated": "resources/read",
  };
  private _pendingEvents: Map<string, {
    eventType: string;
    expectedCallback: string;
    timestamp: number;
    data?: any;
    timer?: NodeJS.Timeout;
  }> = new Map();
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

  recordFeatureCall(feature: ActiveFeature | PassiveFeature, success: boolean) {
    if (!this._featuresStatus[feature] || this._featuresStatus[feature].isPassed) {
      return;
    }
    this.logger.info(`feature「${feature}」 will be record to ${success}`);
    this._featuresStatus[feature].isPassed = success;
  }

  recordPendingEvent(event_type: string, data?: any) {
    if (this.eventCallbackMap[event_type]) {
      const timer = setTimeout(() => {
        this.logger.info(`pending event_type: ${event_type} will be deleted`);
        this.pendingEvents.delete(event_type);
      }, 5000)
      this.pendingEvents.set(event_type, {
        eventType: event_type,
        expectedCallback: this.eventCallbackMap[event_type],
        timestamp: Date.now(),
        data,
        timer,
      });
    }
  }

  getPendingEvent(event_type: string) {
    return this._pendingEvents.get(event_type);
  }

  getPendingEventByMethod(method: string) {
    for (const [eventId, pendingEvent] of this._pendingEvents.entries()) {
      if (pendingEvent.expectedCallback === method) {
        return { eventId, pendingEvent };
      }
    }
    return null;
  }

  clearPendingEvent(eventId: string) {
    const pendingEvent = this._pendingEvents.get(eventId);
    if (pendingEvent) {
      if (pendingEvent.timer) {
        clearTimeout(pendingEvent.timer);
      }
      this._pendingEvents.delete(eventId);
      return pendingEvent;
    }
    return null;
  }

  get featuresStatus() {
    return this._featuresStatus;
  }

  get eventCallbackMap() {
    return this._eventCallbackMap;
  }

  get pendingEvents() {
    return this._pendingEvents;
  }

  reset() {
    // 重置除初始化外的所有功能状态
    Object.values(omit(this._featuresStatus, ['notifications/initialized', 'initialize', 'tools/list', 'tools/call'])).forEach((feature) => {
      feature.isPassed = false;
    });
  }
}
