import type { SkillEntry } from '@sosarium/formats';
import { type DragEvent, Fragment, useEffect, useRef, useState } from 'react';

import type { EditableGroup } from '@/lib/skillgroups-edit';

export type DragState = { kind: 'skill'; group: number; index: number } | { kind: 'group'; index: number };

interface SkillGroupSectionProps {
  drag: DragState | null;
  editing: boolean;
  group: EditableGroup;
  index: number;
  skillsById: Map<number, SkillEntry>;
  onDelete: () => void;
  onDragState: (drag: DragState | null) => void;
  onMoveGroup: (from: number, to: number) => void;
  onMoveSkill: (from: number, fromIndex: number, to: number, toIndex: number) => void;
  onRenameCancel: () => void;
  onRenameCommit: (value: string) => boolean;
  onRenameStart: () => void;
  onToggle: () => void;
}

export function SkillGroupSection({
  drag,
  editing,
  group,
  index,
  skillsById,
  onDelete,
  onDragState,
  onMoveGroup,
  onMoveSkill,
  onRenameCancel,
  onRenameCommit,
  onRenameStart,
  onToggle
}: SkillGroupSectionProps) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [groupSlot, setGroupSlot] = useState<number | null>(null);
  const [draft, setDraft] = useState(group.name);
  const headerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!drag) {
      setDropIndex(null);
      setGroupSlot(null);
    }
  }, [drag]);

  useEffect(() => {
    if (editing) {
      setDraft(group.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, group.name]);

  const clearDrop = () => {
    setDropIndex(null);
    setGroupSlot(null);
  };

  const slotFromPointer = (event: DragEvent<HTMLElement>, position: number): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? position + 1 : position;
  };

  const headerSlot = (event: DragEvent<HTMLElement>): number | null => {
    const rect = headerRef.current?.getBoundingClientRect();
    if (!rect || event.clientY < rect.top || event.clientY > rect.bottom) {
      return null;
    }
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  };

  const handleSkillDragStart = (event: DragEvent<HTMLElement>, skillId: number, position: number) => {
    event.stopPropagation();
    event.dataTransfer.setData('text/plain', String(skillId));
    event.dataTransfer.effectAllowed = 'move';
    onDragState({ kind: 'skill', group: index, index: position });
  };

  const handleGroupDragStart = (event: DragEvent<HTMLElement>) => {
    if (index === 0) {
      return;
    }
    if (headerRef.current) {
      event.dataTransfer.setDragImage(headerRef.current, 12, 12);
    }
    event.dataTransfer.setData('text/plain', group.name);
    event.dataTransfer.effectAllowed = 'move';
    onDragState({ kind: 'group', index });
  };

  const handleSectionDragOver = (event: DragEvent<HTMLElement>) => {
    if (!drag) {
      return;
    }
    if (drag.kind === 'group') {
      if (index === 0) {
        return;
      }
      const slot = headerSlot(event);
      if (slot === null) {
        setGroupSlot(null);
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setGroupSlot(slot);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropIndex(group.skills.length);
  };

  const handleSectionDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    clearDrop();
  };

  const handleSectionDrop = (event: DragEvent<HTMLElement>) => {
    if (!drag) {
      return;
    }
    if (drag.kind === 'group') {
      if (index === 0) {
        return;
      }
      const slot = headerSlot(event);
      if (slot === null) {
        return;
      }
      event.preventDefault();
      onMoveGroup(drag.index, slot);
      clearDrop();
      return;
    }
    event.preventDefault();
    onMoveSkill(drag.group, drag.index, index, group.skills.length);
    clearDrop();
  };

  const handleRowDragOver = (event: DragEvent<HTMLElement>, position: number) => {
    if (drag?.kind !== 'skill') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropIndex(slotFromPointer(event, position));
  };

  const handleRowDrop = (event: DragEvent<HTMLElement>, position: number) => {
    if (drag?.kind !== 'skill') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onMoveSkill(drag.group, drag.index, index, slotFromPointer(event, position));
    clearDrop();
  };

  const skillDrag = drag?.kind === 'skill' ? drag : null;
  const highlighted = dropIndex !== null || groupSlot !== null;

  return (
    <li
      className={highlighted ? 'bg-bronze/10' : ''}
      draggable={index > 0}
      onDragEnd={() => onDragState(null)}
      onDragLeave={handleSectionDragLeave}
      onDragOver={handleSectionDragOver}
      onDragStart={handleGroupDragStart}
      onDrop={handleSectionDrop}
    >
      <header
        className={`flex min-h-9 items-center gap-2 border-b border-bronze/20 px-4 py-1.5 ${
          index > 0 ? 'cursor-grab' : ''
        } ${highlighted ? '' : 'bg-ink/30'}`}
        ref={headerRef}
        title={index > 0 ? 'drag to reorder the group' : undefined}
      >
        <button className="w-5 text-left text-xs text-parchment/50" onClick={onToggle} type="button">
          {group.expanded ? '▾' : '▸'}
        </button>
        {editing ? (
          <input
            className="w-40 rounded border border-bronze/30 bg-ink px-1.5 py-0.5 text-xs text-parchment/80"
            onBlur={() => {
              if (!onRenameCommit(draft)) {
                onRenameCancel();
              }
            }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onRenameCommit(draft);
              } else if (event.key === 'Escape') {
                onRenameCancel();
              }
            }}
            ref={inputRef}
            value={draft}
          />
        ) : (
          <span
            className={`text-xs tracking-widest uppercase ${
              index === 0 ? 'text-bronze-bright/80' : 'text-parchment/80'
            }`}
          >
            {group.name}
          </span>
        )}
        <span className="text-[10px] text-parchment/30">{group.skills.length}</span>
        <div className="flex-1" />
        {index > 0 && !editing ? (
          <button
            className="rounded border border-bronze/20 px-2 py-0.5 text-[10px] text-parchment/50"
            onClick={onRenameStart}
            type="button"
          >
            rename
          </button>
        ) : null}
        {index > 0 ? (
          <button
            className="rounded border border-bronze/20 px-2 py-0.5 text-[10px] text-parchment/50"
            onClick={onDelete}
            type="button"
          >
            delete
          </button>
        ) : null}
      </header>
      {group.expanded ? (
        <ul className="pt-0.5 pb-1">
          {group.skills.map((skillId, position) => (
            <Fragment key={skillId}>
              {dropIndex === position ? <li aria-hidden="true" className="mx-4 h-0.5 bg-bronze-bright/70" /> : null}
              <li
                className={`flex cursor-grab items-center py-1 pr-3 pl-9 text-xs hover:bg-bronze/10 ${
                  skillDrag?.group === index && skillDrag.index === position ? 'opacity-40' : ''
                }`}
                draggable
                onDragEnd={() => onDragState(null)}
                onDragOver={(event) => handleRowDragOver(event, position)}
                onDragStart={(event) => handleSkillDragStart(event, skillId, position)}
                onDrop={(event) => handleRowDrop(event, position)}
              >
                <span className="w-10 flex-none font-mono text-parchment/40">{skillId}</span>
                <span className="flex-1 text-parchment/75">{skillsById.get(skillId)?.name ?? `skill ${skillId}`}</span>
              </li>
            </Fragment>
          ))}
          {dropIndex === group.skills.length && group.skills.length > 0 ? (
            <li aria-hidden="true" className="mx-4 h-0.5 bg-bronze-bright/70" />
          ) : null}
          {group.skills.length === 0 ? (
            <li
              className={`mx-4 my-1 rounded border border-dashed px-3 py-2 text-xs ${
                dropIndex === 0 ? 'border-bronze-bright/60 text-parchment/60' : 'border-bronze/20 text-parchment/30'
              }`}
            >
              drop skills here
            </li>
          ) : null}
          <li aria-hidden="true" className="h-3" />
        </ul>
      ) : null}
    </li>
  );
}
