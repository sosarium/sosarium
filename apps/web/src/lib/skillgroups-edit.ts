import { type SkillEntry, type SkillGroupsFile, skillGroupsFromAssignments } from '@sosarium/formats';

export interface EditableGroup {
  id: number;
  name: string;
  skills: number[];
  expanded: boolean;
}

const MAX_GROUP_NAME_LENGTH = 16;

let nextGroupId = 0;

function groupId(): number {
  nextGroupId += 1;
  return nextGroupId;
}

export function toEditableGroups(skills: SkillEntry[], groups: SkillGroupsFile): EditableGroup[] {
  const skillIds = skills.map((skill) => skill.index).sort((a, b) => a - b);
  const lists = skillGroupsFromAssignments(groups.skillList, groups.groups.length, skillIds);
  return groups.groups.map((group, index) => ({
    expanded: true,
    id: groupId(),
    name: group.name,
    skills: lists[index] ?? []
  }));
}

export function moveSkill(
  groups: EditableGroup[],
  from: number,
  fromIndex: number,
  to: number,
  toIndex: number
): EditableGroup[] {
  const source = groups[from];
  const target = groups[to];
  if (!source || !target || fromIndex < 0 || fromIndex >= source.skills.length) {
    return groups;
  }
  const next = groups.map((group) => ({ ...group, skills: [...group.skills] }));
  const sourceSkills = next[from]?.skills;
  const targetSkills = next[to]?.skills;
  if (!sourceSkills || !targetSkills) {
    return groups;
  }
  const [skill] = sourceSkills.splice(fromIndex, 1);
  if (skill === undefined) {
    return groups;
  }
  const insert = from === to && fromIndex < toIndex ? toIndex - 1 : toIndex;
  targetSkills.splice(Math.max(0, Math.min(insert, targetSkills.length)), 0, skill);
  return next;
}

export function moveGroup(groups: EditableGroup[], from: number, to: number): EditableGroup[] {
  const moved = groups[from];
  if (!moved || from === 0 || to < 1 || to > groups.length) {
    return groups;
  }
  const insert = from < to ? to - 1 : to;
  if (insert === from) {
    return groups;
  }
  const next = [...groups];
  next.splice(from, 1);
  next.splice(insert, 0, moved);
  return next;
}

export function removeGroup(groups: EditableGroup[], index: number): EditableGroup[] {
  const removed = groups[index];
  if (!removed || index === 0) {
    return groups;
  }
  const next = groups.map((group) => ({ ...group, skills: [...group.skills] }));
  next.splice(index, 1);
  next[0]?.skills.push(...removed.skills);
  return next;
}

export function addGroup(groups: EditableGroup[]): EditableGroup[] {
  return [...groups, { expanded: true, id: groupId(), name: 'New group', skills: [] }];
}

export function groupNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'group name cannot be empty';
  }
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return `group names are limited to ${MAX_GROUP_NAME_LENGTH} characters`;
  }
  if (trimmed === 'Misc') {
    return 'Misc is reserved for the default group';
  }
  return null;
}
