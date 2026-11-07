import {
  assignmentsFromSkillGroups,
  type SkillEntry,
  type SkillGroupsFile,
  serializeSkillGroups,
  skillAssignmentsEqual
} from '@sosarium/formats';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { type DragState, SkillGroupSection } from '@/components/skillgroups/skill-group-section';
import { loadSkills } from '@/lib/misc-session';
import { useSession } from '@/lib/session';
import { writeSessionFile } from '@/lib/session-files';
import {
  addGroup,
  type EditableGroup,
  groupNameError,
  moveGroup,
  moveSkill,
  removeGroup,
  toEditableGroups
} from '@/lib/skillgroups-edit';

export const Route = createFileRoute('/_shell/skillgroups')({
  component: SkillGroupsPage
});

interface SkillGroupsModel {
  unicode: boolean;
  nameStride: number;
  groups: EditableGroup[];
}

interface SkillGroupsSnapshot {
  names: string[];
  skillList: number[];
}

function toLoadedState(skills: SkillEntry[], groups: SkillGroupsFile) {
  const model: SkillGroupsModel = {
    unicode: groups.unicode,
    nameStride: groups.nameStride,
    groups: toEditableGroups(skills, groups)
  };
  const snapshot: SkillGroupsSnapshot = {
    names: groups.groups.map((group) => group.name),
    skillList: [...groups.skillList]
  };
  return { model, snapshot, skills };
}

function SkillGroupsPage() {
  const session = useSession();
  const [model, setModel] = useState<SkillGroupsModel | null>(null);
  const [snapshot, setSnapshot] = useState<SkillGroupsSnapshot | null>(null);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (session.status !== 'ready') {
      setModel(null);
      return;
    }
    let cancelled = false;
    setStatus('loading skillgrp.mul…');
    loadSkills()
      .then((value) => {
        if (cancelled) {
          return;
        }
        if (!value?.groups) {
          setModel(null);
          setStatus('skillgrp.mul not found');
          return;
        }
        const loaded = toLoadedState(value.skills, value.groups);
        setModel(loaded.model);
        setSnapshot(loaded.snapshot);
        setSkills(loaded.skills);
        setStatus(`${value.skills.length} skills · ${value.groups.groups.length} groups`);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setStatus(cause instanceof Error ? cause.message : 'load failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const skillsById = useMemo(
    () => new Map(skills.map((skill): [number, SkillEntry] => [skill.index, skill])),
    [skills]
  );

  const dirty = useMemo(() => {
    if (!model || !snapshot) {
      return false;
    }
    const derived = assignmentsFromSkillGroups(
      snapshot.skillList,
      model.groups.map((group) => group.skills)
    );
    const groupsChanged =
      model.groups.length !== snapshot.names.length ||
      model.groups.some((group, index) => group.name !== snapshot.names[index]);
    return groupsChanged || !skillAssignmentsEqual(derived, snapshot.skillList);
  }, [model, snapshot]);

  const updateGroups = (groups: EditableGroup[]) => {
    setModel((current) => (current ? { ...current, groups } : current));
  };

  const handleToggle = (index: number) => {
    if (!model) {
      return;
    }
    updateGroups(model.groups.map((group, i) => (i === index ? { ...group, expanded: !group.expanded } : group)));
  };

  const handleMoveSkill = (from: number, fromIndex: number, to: number, toIndex: number) => {
    if (!model) {
      return;
    }
    const next = moveSkill(model.groups, from, fromIndex, to, toIndex);
    if (next === model.groups) {
      return;
    }
    const movedId = model.groups[from]?.skills[fromIndex];
    const name = movedId !== undefined ? (skillsById.get(movedId)?.name ?? `skill ${movedId}`) : 'skill';
    updateGroups(next);
    setStatus(
      from === to
        ? `moved ${name} in ${model.groups[to]?.name} — in-group order isn't stored`
        : `moved ${name} to ${model.groups[to]?.name} — save to write`
    );
  };

  const handleMoveGroup = (from: number, to: number) => {
    if (!model) {
      return;
    }
    const next = moveGroup(model.groups, from, to);
    if (next === model.groups) {
      return;
    }
    updateGroups(next);
    setStatus('reordered groups — save to write');
  };

  const handleDelete = (index: number) => {
    if (!model) {
      return;
    }
    const removed = model.groups[index];
    const next = removeGroup(model.groups, index);
    if (next === model.groups) {
      return;
    }
    updateGroups(next);
    setEditId((current) => (current === removed?.id ? null : current));
    setStatus('removed group — its skills moved to Misc');
  };

  const handleAdd = () => {
    if (!model) {
      return;
    }
    const next = addGroup(model.groups);
    updateGroups(next);
    setEditId(next[next.length - 1]?.id ?? null);
    setStatus('added group — name it, then save');
  };

  const handleRenameCommit = (id: number, value: string): boolean => {
    if (!model) {
      return false;
    }
    const error = groupNameError(value);
    if (error) {
      setStatus(error);
      return false;
    }
    updateGroups(model.groups.map((group) => (group.id === id ? { ...group, name: value.trim() } : group)));
    setEditId(null);
    setStatus('renamed group — save to write');
    return true;
  };

  const handleSave = async () => {
    if (!model || !snapshot || session.mode !== 'readwrite') {
      return;
    }
    setStatus('saving…');
    try {
      const skillList = assignmentsFromSkillGroups(
        snapshot.skillList,
        model.groups.map((group) => group.skills)
      );
      const bytes = serializeSkillGroups({
        unicode: model.unicode,
        nameStride: model.nameStride,
        groups: model.groups.map((group) => ({ name: group.name, skills: group.skills })),
        skillList
      });
      const name = await writeSessionFile('skillgrp.mul', bytes);
      const fresh = await loadSkills();
      if (fresh?.groups) {
        const loaded = toLoadedState(fresh.skills, fresh.groups);
        setModel(loaded.model);
        setSnapshot(loaded.snapshot);
        setSkills(loaded.skills);
      }
      setStatus(`saved ${name}`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'save failed');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Skill groups</h1>
        <button
          className="rounded border border-bronze/30 px-3 py-1.5 text-xs text-parchment/70 disabled:opacity-40"
          disabled={!model}
          onClick={handleAdd}
          type="button"
        >
          Add group
        </button>
        <div className="flex-1" />
        <span className="text-xs text-parchment/40">
          {status}
          {session.mode === 'readwrite' ? '' : ' · read-only session'}
        </span>
        <button
          className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
            dirty && session.mode === 'readwrite'
              ? 'border-bronze text-bronze-bright'
              : 'border-bronze/20 text-parchment/30'
          }`}
          disabled={!dirty || session.mode !== 'readwrite'}
          onClick={() => {
            handleSave().catch(() => undefined);
          }}
          type="button"
        >
          Save
        </button>
        <GitHubButton />
      </header>

      <ul className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto">
        {model ? (
          model.groups.map((group, index) => (
            <SkillGroupSection
              drag={drag}
              editing={group.id === editId}
              group={group}
              index={index}
              key={group.id}
              onDelete={() => handleDelete(index)}
              onDragState={setDrag}
              onMoveGroup={handleMoveGroup}
              onMoveSkill={handleMoveSkill}
              onRenameCancel={() => setEditId(null)}
              onRenameCommit={(value) => handleRenameCommit(group.id, value)}
              onRenameStart={() => setEditId(group.id)}
              onToggle={() => handleToggle(index)}
              skillsById={skillsById}
            />
          ))
        ) : (
          <li className="p-8 text-xs text-parchment/40">{status}</li>
        )}
      </ul>

      <footer className="mt-auto flex min-h-11 items-center gap-3 border-t border-bronze/20 px-4 py-2 text-xs">
        <span className="text-parchment/40">{dirty ? 'unsaved changes' : 'no unsaved changes'}</span>
        <div className="flex-1" />
        <span className="text-parchment/30">
          order inside a group is visual only — skillgrp.mul stores just which group each skill belongs to
        </span>
      </footer>
    </div>
  );
}
