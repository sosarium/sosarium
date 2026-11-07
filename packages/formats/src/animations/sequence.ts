export const MAX_ANIM_ACTIONS = 80;
const GROUP_FIXED_SIZE = 64;
const GROUP_PROP_SIZE = 32;

export function parseAnimationSequence(data: Uint8Array): number[] {
  const replacements = Array.from({ length: MAX_ANIM_ACTIONS }, (_, index) => index);
  if (data.byteLength < 56) {
    return replacements;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const groupCount = view.getInt32(52, true);
  let position = 56;

  for (let i = 0; i < groupCount; i++) {
    if (position + GROUP_FIXED_SIZE > data.byteLength) {
      break;
    }
    const group = view.getInt32(position, true);
    const frameCount = view.getInt32(position + 4, true);
    const replacementGroup = view.getInt32(position + 8, true);
    if (frameCount === 0 && group >= 0 && group < MAX_ANIM_ACTIONS && replacementGroup >= 0) {
      replacements[group] = replacementGroup;
    }
    position += GROUP_FIXED_SIZE;

    if (position + 4 > data.byteLength) {
      break;
    }
    const propCount = view.getInt32(position, true);
    if (propCount < 0 || position + 4 + propCount * GROUP_PROP_SIZE > data.byteLength) {
      break;
    }
    position += 4 + propCount * GROUP_PROP_SIZE;

    if (position + 4 > data.byteLength) {
      break;
    }
    const intCount = view.getInt32(position, true);
    if (intCount < 0 || position + 4 + intCount * 4 > data.byteLength) {
      break;
    }
    position += 4 + intCount * 4;
  }

  return replacements;
}
