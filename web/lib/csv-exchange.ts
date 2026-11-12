export type CsvCell = string | number | null | undefined;

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (!quoted && cell === "") quoted = true;
      else if (quoted) quoted = false;
      else throw new Error("Aspas fora de um campo CSV.");
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("Campo CSV com aspas sem fechamento.");
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) throw new Error("O arquivo CSV está vazio.");
  if (rows.some((values) => values.length !== rows[0].length))
    throw new Error("Algumas linhas têm um número de colunas diferente do cabeçalho.");
  return rows;
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const encode = (value: CsvCell) => {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(encode).join(";")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
