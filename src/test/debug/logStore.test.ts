import { beforeEach, describe, expect, it } from 'vitest';
import { useLogStore } from '../../debug/logStore';

describe('logStore', () => {
  beforeEach(() => {
    useLogStore.setState({ entries: [], nextId: 1 });
  });

  it('holds at most 2000 entries, evicting the oldest first', () => {
    for (let i = 0; i < 2100; i++) {
      useLogStore.getState().log('info', 'db', `entry ${i}`);
    }

    const { entries } = useLogStore.getState();
    expect(entries).toHaveLength(2000);
    expect(entries[0].message).toBe('entry 100');
    expect(entries[entries.length - 1].message).toBe('entry 2099');
  });

  it('clear empties the buffer', () => {
    useLogStore.getState().log('info', 'db', 'one');
    useLogStore.getState().clear();
    expect(useLogStore.getState().entries).toHaveLength(0);
  });

  it('assigns incrementing ids and captures category/level/data', () => {
    useLogStore.getState().log('warn', 'pantry', 'shortfall', { needed: 400, have: 300 });
    const [entry] = useLogStore.getState().entries;
    expect(entry.id).toBe(1);
    expect(entry.level).toBe('warn');
    expect(entry.category).toBe('pantry');
    expect(entry.data).toEqual({ needed: 400, have: 300 });
    expect(entry.ts).toEqual(expect.any(String));
  });
});
