import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  caption: string;
}

export function Table<T extends { id?: string }>({
  columns,
  data,
  caption,
}: TableProps<T>) {
  return (
    <table className="data-table" aria-label={caption}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} scope="col">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, rowIdx) => (
          <tr key={row.id ?? rowIdx}>
            {columns.map((col, colIdx) => (
              colIdx === 0 ? (
                <th key={col.key} scope="row" className="font-normal">
                  {col.render(row)}
                </th>
              ) : (
                <td key={col.key}>{col.render(row)}</td>
              )
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
