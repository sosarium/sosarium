export interface WritableFile {
  open(keepExistingData: boolean): Promise<void>;
  writeAt(position: number, data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
