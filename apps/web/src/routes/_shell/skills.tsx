import type { SkillEntry } from '@sosarium/formats';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { useDocumentMeta } from '@/lib/document-meta';
import { loadSkills } from '@/lib/misc-session';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_shell/skills')({
  component: SkillsPage
});

function SkillsPage() {
  useDocumentMeta('Skills — Sosarium');
  const session = useSession();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (session.status !== 'ready') {
      return;
    }
    let cancelled = false;
    setStatus('loading skills…');
    loadSkills()
      .then((value) => {
        if (cancelled) {
          return;
        }
        setSkills(value?.skills ?? []);
        setStatus(value ? `${value.skills.length} skills` : 'skills files not found');
      })
      .catch((cause: unknown) => setStatus(cause instanceof Error ? cause.message : 'load failed'));
    return () => {
      cancelled = true;
    };
  }, [session]);

  const needle = search.trim().toLowerCase();
  const filtered = skills.filter((skill) => needle.length === 0 || skill.name.toLowerCase().includes(needle));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Skills</h1>
        <input
          className="w-56 rounded border border-bronze/30 bg-ink py-1.5 px-2 text-xs text-parchment/80"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="search skill…"
          value={search}
        />
        <div className="flex-1" />
        <span className="text-xs text-parchment/40">{status}</span>
        <GitHubButton />
      </header>
      <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-parchment/40">
            <tr>
              <th className="text-left">#</th>
              <th className="text-left">name</th>
              <th className="text-left">action</th>
              <th className="text-left">extra</th>
            </tr>
          </thead>
          <tbody className="text-parchment/70">
            {filtered.map((skill) => (
              <tr className="border-b border-parchment/5" key={skill.index}>
                <td className="w-16 px-3 py-1 font-mono">{skill.index}</td>
                <td className="px-3 py-1">{skill.name}</td>
                <td className="px-3 py-1">{skill.isAction ? 'yes' : ''}</td>
                <td className="px-3 py-1">{skill.extra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
