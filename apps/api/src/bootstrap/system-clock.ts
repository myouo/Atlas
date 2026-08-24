import type { Clock } from "@nivalis/application";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
