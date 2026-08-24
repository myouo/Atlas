import type { WidgetProjection } from "@nivalis/api-client";

export type WidgetPresentationControl =
  | {
      readonly defaultValue: boolean;
      readonly description: string;
      readonly key: string;
      readonly kind: "toggle";
      readonly label: string;
    }
  | {
      readonly defaultValue: string;
      readonly description: string;
      readonly key: string;
      readonly kind: "select";
      readonly label: string;
      readonly options: readonly { readonly label: string; readonly value: string }[];
    };

type PresentationConfig = WidgetProjection["presentationConfig"];

export function presentationToggle(config: PresentationConfig, key: string, defaultValue = true) {
  const value = config[key];
  return typeof value === "boolean" ? value : defaultValue;
}

export function presentationSelection(
  config: PresentationConfig,
  key: string,
  defaultValue: string,
  allowed: readonly string[]
) {
  const value = config[key];
  return typeof value === "string" && allowed.includes(value) ? value : defaultValue;
}

export function withPresentationValue(
  config: PresentationConfig,
  key: string,
  value: boolean | string
): PresentationConfig {
  return { ...config, [key]: value };
}
