export interface SkillEntry {
  index: number;
  isAction: boolean;
  name: string;
  extra: number;
}

export function parseSkill(bytes: Uint8Array, index: number, extra: number): SkillEntry | null {
  if (bytes.byteLength < 2) {
    return null;
  }
  const isAction = (bytes[0] as number) !== 0;
  let end = 1;
  while (end < bytes.byteLength && bytes[end] !== 0) {
    end++;
  }
  const name = new TextDecoder('ascii').decode(bytes.subarray(1, end));
  return { index, isAction, name, extra };
}

export function encodeSkill(skill: SkillEntry): Uint8Array {
  const name = new TextEncoder().encode(skill.name);
  const bytes = new Uint8Array(1 + name.byteLength + 1);
  bytes[0] = skill.isAction ? 1 : 0;
  bytes.set(name, 1);
  return bytes;
}

export interface SkillGroupEntry {
  name: string;
  skills: number[];
}

export interface SkillGroupsFile {
  unicode: boolean;
  nameStride: number;
  groups: SkillGroupEntry[];
  skillList: number[];
}

export function parseSkillGroups(bytes: Uint8Array): SkillGroupsFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let count = view.getInt32(0, true);
  const unicode = count === -1;
  let start = 4;
  let nameStride = 17;
  if (unicode) {
    count = view.getInt32(4, true);
    start = 8;
    nameStride = 34;
  }

  const groups: SkillGroupEntry[] = [{ name: 'Misc', skills: [] }];
  for (let i = 0; i < count - 1; i++) {
    const offset = start + i * nameStride;
    let name = '';
    if (unicode) {
      let position = offset;
      while (position + 1 < bytes.byteLength) {
        const code = view.getUint16(position, true);
        if (code === 0) {
          break;
        }
        name += String.fromCharCode(code);
        position += 2;
      }
    } else {
      let position = offset;
      while (position < bytes.byteLength) {
        const code = bytes[position] as number;
        if (code === 0) {
          break;
        }
        name += String.fromCharCode(code);
        position++;
      }
    }
    groups.push({ name, skills: [] });
  }

  let cursor = start + (count - 1) * nameStride;
  const skillList: number[] = [];
  while (cursor + 4 <= bytes.byteLength) {
    skillList.push(view.getInt32(cursor, true));
    cursor += 4;
  }

  return { unicode, nameStride, groups, skillList };
}

export function serializeSkillGroups(file: SkillGroupsFile): Uint8Array {
  const count = file.groups.length;
  const headers = file.unicode ? 8 : 4;
  const stride = file.unicode ? 34 : 17;
  const size = headers + Math.max(0, count - 1) * stride + file.skillList.length * 4;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);

  if (file.unicode) {
    view.setInt32(0, -1, true);
    view.setInt32(4, count, true);
  } else {
    view.setInt32(0, count, true);
  }

  for (let i = 1; i < count; i++) {
    const offset = headers + (i - 1) * stride;
    const name = file.groups[i]?.name ?? '';
    if (file.unicode) {
      for (let c = 0; c < name.length && c * 2 + 2 < stride; c++) {
        view.setUint16(offset + c * 2, name.charCodeAt(c), true);
      }
    } else {
      for (let c = 0; c < name.length && c < stride - 1; c++) {
        out[offset + c] = name.charCodeAt(c) & 0xff;
      }
    }
  }

  let cursor = headers + Math.max(0, count - 1) * stride;
  for (const skill of file.skillList) {
    view.setInt32(cursor, skill, true);
    cursor += 4;
  }
  return out;
}

// skillList is indexed by skill id; each value is the index of the group that skill belongs to (0 = Misc).
export function skillGroupsFromAssignments(
  skillList: readonly number[],
  groupCount: number,
  skillIds: readonly number[]
): number[][] {
  const groups: number[][] = Array.from({ length: Math.max(1, groupCount) }, () => []);
  for (const skillId of skillIds) {
    const assigned = skillList[skillId] ?? 0;
    const group = assigned >= 0 && assigned < groups.length ? assigned : 0;
    groups[group]?.push(skillId);
  }
  return groups;
}

export function assignmentsFromSkillGroups(
  base: readonly number[],
  groupSkills: readonly (readonly number[])[]
): number[] {
  const assignments = [...base];
  for (let group = 0; group < groupSkills.length; group++) {
    for (const skillId of groupSkills[group] ?? []) {
      while (assignments.length <= skillId) {
        assignments.push(0);
      }
      assignments[skillId] = group;
    }
  }
  return assignments;
}

export function skillAssignmentsEqual(a: readonly number[], b: readonly number[]): boolean {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) {
      return false;
    }
  }
  return true;
}
