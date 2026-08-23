export interface PutObjectInput {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly key: string;
}

export interface ObjectRef {
  readonly key: string;
  readonly etag?: string;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<ObjectRef>;
  getObject(key: string): Promise<Uint8Array>;
  deleteObject(key: string): Promise<void>;
  createSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}

export interface AssetUrlResolver {
  resolve(objectKey: string): string;
}
