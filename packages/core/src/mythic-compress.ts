const HEADER_XOR_KEY = 0x8e2c9a3d;
const FREQUENCY_HEADER_SIZE = 1024;

function moveToFront(array: Uint8Array, element: number): number {
  if (array[0] === element) {
    return 0;
  }
  let index = 0;
  while (array[index] !== element) {
    index++;
  }
  for (let i = index; i >= 1; i--) {
    array[i] = array[i - 1] as number;
  }
  array[0] = element;
  return index;
}

export function moveToFrontEncode(input: Uint8Array): Uint8Array {
  const symbols = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    symbols[i] = i;
  }
  const output = new Uint8Array(input.byteLength);
  for (let i = 0; i < input.byteLength; i++) {
    output[i] = moveToFront(symbols, input[i] as number);
  }
  return output;
}

export function moveToFrontDecode(input: Uint8Array): Uint8Array {
  const symbols = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    symbols[i] = i;
  }
  const output = new Uint8Array(input.byteLength);
  for (let i = 0; i < input.byteLength; i++) {
    const index = input[i] as number;
    output[i] = symbols[index] as number;
    moveToFront(symbols, index);
  }
  return output;
}

function frequency(input: Int32Array, output: Uint8Array): void {
  const tmp = input.slice(0, 256);
  for (let i = 0; i < 256; i++) {
    let value = 0;
    let index = 0;
    for (let j = 0; j < 256; j++) {
      const candidate = tmp[j] as number;
      if (candidate > value) {
        index = j;
        value = candidate;
      }
    }
    if (value === 0) {
      break;
    }
    output[i] = index;
    tmp[index] = 0;
  }
}

function shiftRight(array: Uint8Array, element: number): void {
  for (let i = element; i >= 1; i--) {
    array[i] = array[i - 1] as number;
  }
}

function getIndex(array: Uint8Array, value: number, limit: number): number {
  for (let i = 0; i < array.length && i < limit; i++) {
    if (array[i] === value) {
      return i;
    }
  }
  return 0;
}

export function mythicInternalCompress(input: Uint8Array): Uint8Array {
  const partialInput = new Int32Array(768);
  for (let i = 0; i < input.byteLength; i++) {
    const byte = input[i] as number;
    partialInput[byte] = (partialInput[byte] as number) + 1;
  }

  const freq = new Uint8Array(256);
  frequency(partialInput, freq);

  let nonZeroCount = 0;
  for (let i = 0; i < 256; i++) {
    if (partialInput[i] !== 0) {
      nonZeroCount++;
    }
  }

  const output = new Uint8Array(input.byteLength + nonZeroCount + FREQUENCY_HEADER_SIZE);

  let m = 0;
  for (let i = 0; i < nonZeroCount; i++) {
    const freqIndex = freq[i] as number;
    partialInput[freqIndex + 256] = m + 1;
    m += partialInput[freqIndex] as number;
    partialInput[freqIndex + 512] = m;
  }

  const headerView = new DataView(output.buffer, output.byteOffset, FREQUENCY_HEADER_SIZE);
  for (let i = 0; i < 256; i++) {
    headerView.setInt32(i * 4, partialInput[i] as number, true);
  }

  let count = input.byteLength - 1;
  const symbols = new Uint8Array(256);
  const added = new Uint8Array(256);
  let addedCount = 0;

  while (count >= 0) {
    const val = input[count] as number;
    const outputAddress = (partialInput[val + 512] as number) + 1024;

    if (added[val] === 0) {
      shiftRight(symbols, addedCount);
      symbols[0] = val;
      added[val] = 1;
      addedCount++;
      output[outputAddress] = 0;
    } else if ((partialInput[val + 512] as number) >= (partialInput[val + 256] as number)) {
      const index = getIndex(symbols, val, addedCount);
      shiftRight(symbols, index);
      symbols[0] = val;
      output[outputAddress] = index;
    }
    partialInput[val + 512] = (partialInput[val + 512] as number) - 1;
    count--;
  }

  m = 0;
  for (let i = 0; i < nonZeroCount; i++) {
    const freqIndex = freq[i] as number;
    output[m + 1024] = getIndex(symbols, freqIndex, nonZeroCount);
    m += partialInput[freqIndex] as number;
  }

  return output;
}

export function mythicCompress(payload: Uint8Array): Uint8Array {
  return moveToFrontEncode(mythicInternalCompress(payload));
}

export function clilocCompressedLength(bytes: Uint8Array): number {
  if (bytes.byteLength < 4) {
    return 0;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (view.getUint32(0, true) ^ HEADER_XOR_KEY) >>> 0;
}

export function wrapCompressedCliloc(payload: Uint8Array): Uint8Array {
  const transformed = mythicCompress(payload);
  const out = new Uint8Array(4 + transformed.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, (payload.byteLength ^ HEADER_XOR_KEY) >>> 0, true);
  out.set(transformed, 4);
  return out;
}
