import { create } from 'zustand';

export interface ListState {
  page: number;
  sort: 'updatedAt' | 'createdAt' | 'title';
  order: 'asc' | 'desc';
  trash: boolean;
  tagIds: string[];
  setPage: (page: number) => void;
  setSort: (sort: ListState['sort'], order: ListState['order']) => void;
  setTrash: (trash: boolean) => void;
  toggleTag: (id: string) => void;
  clearTags: () => void;
  reset: () => void;
}

const initial = {
  page: 1,
  sort: 'updatedAt' as const,
  order: 'desc' as const,
  trash: false,
  tagIds: [],
};

export const useListState = create<ListState>((set) => ({
  ...initial,
  setPage: (page) => set({ page }),
  setSort: (sort, order) => set({ sort, order, page: 1 }),
  setTrash: (trash) => set({ trash, page: 1 }),
  toggleTag: (id) =>
    set((state) => ({
      page: 1,
      tagIds: state.tagIds.includes(id)
        ? state.tagIds.filter((tagId) => tagId !== id)
        : [...state.tagIds, id],
    })),
  clearTags: () => set({ tagIds: [], page: 1 }),
  reset: () => set(initial),
}));
