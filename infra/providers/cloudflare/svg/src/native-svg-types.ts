export interface NativeSvgCard {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly svg: string;
  readonly background?: { readonly color: string; readonly radius: number };
}

export interface NativeSvgScene {
  readonly profile: NativeSvgCard;
  readonly widgets: readonly NativeSvgCard[];
}
