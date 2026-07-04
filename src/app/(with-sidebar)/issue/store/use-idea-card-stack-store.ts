import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IdeaCardStackState {
  cardStack: string[];
  setInitialCardData: (cardIds: string[]) => void;
  bringToFront: (cardId: string) => void;
  addCard: (cardId: string) => void;
  removeCard: (cardId: string) => void;
  getZIndex: (cardId: string) => number;
}

const createIdeaCardStackStore = (issueId: string) => {
  return create<IdeaCardStackState>()(
    persist(
      (set, get) => ({
        cardStack: [],

        setInitialCardData: (cardIds: string[]) =>
          set((state) => {
            const valid = new Set(cardIds);
            const newIds = cardIds.filter((id) => !state.cardStack.includes(id));
            // 로딩 중(빈 목록)엔 pruning 금지 — persist된 순서 보호
            const pruned =
              cardIds.length > 0
                ? state.cardStack.filter((id) => valid.has(id))
                : state.cardStack;

            if (newIds.length === 0 && pruned.length === state.cardStack.length) {
              return state;
            }

            return {
              cardStack: [...pruned, ...newIds],
            };
          }),

        bringToFront: (cardId: string) =>
          set((state) => {
            if (state.cardStack[state.cardStack.length - 1] === cardId) {
              return state;
            }
            return {
              cardStack: [...state.cardStack.filter((id) => id !== cardId), cardId],
            };
          }),

        addCard: (cardId: string) =>
          set((state) => {
            if (state.cardStack.includes(cardId)) {
              return state;
            }
            return {
              cardStack: [...state.cardStack, cardId],
            };
          }),

        removeCard: (cardId: string) =>
          set((state) => ({
            cardStack: state.cardStack.filter((id) => id !== cardId),
          })),

        getZIndex: (cardId: string) => {
          const index = get().cardStack.indexOf(cardId);
          return index === -1 ? 0 : index + 1; // 1부터 시작
        },
      }),
      {
        name: `idea-card-stack-storage-${issueId}`,
        partialize: (state) => ({
          cardStack: state.cardStack,
        }),
      },
    ),
  );
};

const storeCache = new Map<string, ReturnType<typeof createIdeaCardStackStore>>();

export function useIdeaCardStackStore(issueId?: string): IdeaCardStackState;
export function useIdeaCardStackStore<T>(
  issueId: string,
  selector: (state: IdeaCardStackState) => T,
): T;
export function useIdeaCardStackStore<T>(
  issueId: string = 'default',
  selector?: (state: IdeaCardStackState) => T,
) {
  if (!storeCache.has(issueId)) {
    storeCache.set(issueId, createIdeaCardStackStore(issueId));
  }
  const store = storeCache.get(issueId)!;
  return selector ? store(selector) : store();
}
