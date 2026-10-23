export interface NoteRow {
  id: string;
  title: string;
  updatedAt: string;
}

export function NoteList({
  items,
  empty,
  error,
  page,
  totalPages,
  onPage,
}: {
  items: NoteRow[];
  empty: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (error) return <p role="alert">{error}</p>;
  if (empty) return <p>No notes</p>;
  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`/notes/${item.id}`}>{item.title}</a>
          </li>
        ))}
      </ul>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
