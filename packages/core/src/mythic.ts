const HEADER_XOR_KEY = 0x8e2c9a3d;
const FREQUENCY_HEADER_SIZE = 1024;

function moveToFrontDecode(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.length);
  const symbols = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    symbols[i] = i;
  }

  for (let i = 0; i < input.length; i++) {
    const index = input[i] as number;
    output[i] = symbols[index] as number;
    const element = output[i] as number;
    for (let j = index; j > 0; j--) {
      symbols[j] = symbols[j - 1] as number;
    }
    symbols[0] = element;
  }

  return output;
}

function frequency(partialInput: Int32Array, output: Uint8Array): void {
  const tmp = new Int32Array(256);
  tmp.set(partialInput.subarray(0, 256));

  for (let i = 0; i < 256; i++) {
    let value = 0;
    let index = 0;
    for (let j = 0; j < 256; j++) {
      if ((tmp[j] as number) > value) {
        index = j;
        value = tmp[j] as number;
      }
    }
    if (value === 0) {
      break;
    }
    output[i] = index;
    tmp[index] = 0;
  }
}

function shiftLeft(array: Uint8Array, element: number): void {
  for (let i = 0; i < element; i++) {
    array[i] = array[i + 1] as number;
  }
}

function tryInternalDecompress(input: Uint8Array, destination: Uint8Array): number {
  if (input.length < FREQUENCY_HEADER_SIZE) {
    return -1;
  }

  let sum = 0;
  const partialInput = new Int32Array(768);
  const view = new DataView(input.buffer, input.byteOffset, FREQUENCY_HEADER_SIZE);
  for (let i = 0; i < 256; i++) {
    const value = view.getInt32(i * 4, true);
    partialInput[i] = value;
    sum += value;
  }

  if (sum === 0) {
    return 0;
  }
  if (destination.length < sum) {
    return -1;
  }

  let nonZeroCount = 0;
  for (let i = 0; i < 256; i++) {
    if (partialInput[i] !== 0) {
      nonZeroCount++;
    }
  }

  const symbols = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    symbols[i] = i;
  }

  const frequencies = new Uint8Array(256);
  frequency(partialInput, frequencies);

  for (let i = 0, m = 0; i < nonZeroCount; i++) {
    const freq = frequencies[i] as number;
    symbols[input[m + FREQUENCY_HEADER_SIZE] as number] = freq;
    partialInput[freq + 256] = m + 1;
    m += partialInput[freq] as number;
    partialInput[freq + 512] = m;
  }

  let val = symbols[0] as number;
  let count = 0;
  let remaining = nonZeroCount;

  do {
    const pointer = partialInput[val + 256] as number;
    destination[count] = val;

    if (pointer < (partialInput[val + 512] as number)) {
      const index = input[pointer + FREQUENCY_HEADER_SIZE] as number;
      partialInput[val + 256] = pointer + 1;

      if (index !== 0) {
        shiftLeft(symbols, index);
        symbols[index] = val;
        val = symbols[0] as number;
      }
    } else if (remaining-- > 0) {
      shiftLeft(symbols, remaining);
      val = symbols[0] as number;
    }

    count++;
  } while (count < sum);

  return sum;
}

export function peekMythicDecompressedLength(source: Uint8Array): number {
  if (source.length < 4) {
    return 0;
  }
  const view = new DataView(source.buffer, source.byteOffset, 4);
  return (view.getUint32(0, true) ^ HEADER_XOR_KEY) >>> 0;
}

export function mythicDecompress(source: Uint8Array): Uint8Array {
  const expected = peekMythicDecompressedLength(source);
  const output = new Uint8Array(expected);
  const written = tryMythicDecompress(source, output);
  if (written !== expected) {
    throw new Error(`mythic decompression produced ${written} bytes, expected ${expected}`);
  }
  return output;
}

export function tryMythicDecompress(source: Uint8Array, destination: Uint8Array): number {
  if (source.length < 4) {
    return -1;
  }
  const expected = peekMythicDecompressedLength(source);
  if (destination.length < expected) {
    return -1;
  }
  const mtfDecoded = moveToFrontDecode(source.subarray(4));
  const written = tryInternalDecompress(mtfDecoded, destination);
  if (written < 0 || written !== expected) {
    return -1;
  }
  return written;
}
