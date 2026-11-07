import type { SkillEntry, SkillGroupsFile } from '@sosarium/formats';
import { describe, expect, it } from 'vitest';

import {
  addGroup,
  type EditableGroup,
  groupNameError,
  moveGroup,
  moveSkill,
  removeGroup,
  toEditableGroups
} from './skillgroups-edit';

let nextTestId = 0;

function group(name: string, skills: number[]): EditableGroup {
  nextTestId += 1;
  return { expanded: true, id: nextTestId, name, skills };
}

function shape(groups: EditableGroup[]): { expanded: boolean; name: string; skills: number[] }[] {
  return groups.map(({ expanded, name, skills }) => ({ expanded, name, skills }));
}

describe('toEditableGroups', () => {
  it('builds id-ordered editable groups with unique ids from assignments', () => {
    const skills: SkillEntry[] = [
      { index: 0, isAction: true, name: 'Alchemy', extra: 0 },
      { index: 1, isAction: false, name: 'Anatomy', extra: 0 },
      { index: 2, isAction: false, name: 'Mining', extra: 0 }
    ];
    const file: SkillGroupsFile = {
      unicode: false,
      nameStride: 17,
      groups: [
        { name: 'Misc', skills: [] },
        { name: 'Combat', skills: [] }
      ],
      skillList: [1, 1, 0]
    };
    const editable = toEditableGroups(skills, file);
    expect(new Set(editable.map((entry) => entry.id)).size).toBe(2);
    expect(shape(editable)).toEqual([
      { expanded: true, name: 'Misc', skills: [2] },
      { expanded: true, name: 'Combat', skills: [0, 1] }
    ]);
  });
});

describe('moveSkill', () => {
  it('moves a skill between groups at the drop slot', () => {
    const groups = [group('Misc', [0, 3]), group('Combat', [1, 2])];
    expect(shape(moveSkill(groups, 0, 1, 1, 1))).toEqual([
      { expanded: true, name: 'Misc', skills: [0] },
      { expanded: true, name: 'Combat', skills: [1, 3, 2] }
    ]);
  });

  it('reorders within a group', () => {
    const groups = [group('Misc', [0, 1, 2])];
    expect(moveSkill(groups, 0, 0, 0, 2)[0]?.skills).toEqual([1, 0, 2]);
    expect(moveSkill(groups, 0, 2, 0, 0)[0]?.skills).toEqual([2, 0, 1]);
  });

  it('does not mutate the input', () => {
    const groups = [group('Misc', [0, 1])];
    moveSkill(groups, 0, 0, 0, 1);
    expect(groups[0]?.skills).toEqual([0, 1]);
  });
});

describe('moveGroup', () => {
  it('reorders groups, keeps Misc pinned first and stable ids', () => {
    const groups = [group('Misc', []), group('A', []), group('B', []), group('C', [])];
    expect(moveGroup(groups, 2, 1)).toEqual([groups[0], groups[2], groups[1], groups[3]]);
    expect(moveGroup(groups, 1, 4)).toEqual([groups[0], groups[2], groups[3], groups[1]]);
    expect(moveGroup(groups, 1, 0)).toBe(groups);
    expect(moveGroup(groups, 0, 2)).toBe(groups);
    expect(moveGroup(groups, 2, 2)).toBe(groups);
  });
});

describe('removeGroup', () => {
  it('moves the removed group skills into misc', () => {
    const groups = [group('Misc', [0]), group('Combat', [1, 2]), group('Magic', [3])];
    expect(shape(removeGroup(groups, 1))).toEqual([
      { expanded: true, name: 'Misc', skills: [0, 1, 2] },
      { expanded: true, name: 'Magic', skills: [3] }
    ]);
  });

  it('refuses to remove misc', () => {
    const groups = [group('Misc', []), group('Combat', [])];
    expect(removeGroup(groups, 0)).toBe(groups);
  });
});

describe('addGroup', () => {
  it('appends an empty expanded group with a fresh id', () => {
    const groups = [group('Misc', [])];
    const next = addGroup(groups);
    expect(shape(next)).toEqual([
      { expanded: true, name: 'Misc', skills: [] },
      { expanded: true, name: 'New group', skills: [] }
    ]);
    expect(next[1]?.id).not.toBe(next[0]?.id);
  });
});

describe('groupNameError', () => {
  it('validates names', () => {
    expect(groupNameError('Combat')).toBeNull();
    expect(groupNameError('  Combat  ')).toBeNull();
    expect(groupNameError('Abcdefghijklmnop')).toBeNull();
    expect(groupNameError('AbcdefghijklmnopQ')).toContain('16');
    expect(groupNameError('   ')).not.toBeNull();
    expect(groupNameError('Misc')).not.toBeNull();
  });
});
