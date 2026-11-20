type CollaboratorIdentity = { id?: unknown; telefone?: unknown; cpf?: unknown; nome?: unknown; funcao?: unknown };
import { parseCsv } from "./csv-exchange";

export function parseCollaboratorsCsv(text: string) {
  const lines = parseCsv(text);
  if (lines.length < 2) throw new Error("O CSV precisa ter cabeçalho e pelo menos uma pessoa.");
  const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const headers = lines[0].map((header, index) => normalize(index === 0 ? header.replace(/^\uFEFF/, "") : header));
  const index = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const nomeIndex = index(["nome", "nomecompleto"]); const funcaoIndex = index(["funcao", "cargo"]);
  const telefoneIndex = index(["telefone", "celular", "whatsapp"]); const cpfIndex = index(["cpf"]);
  if (nomeIndex < 0 || funcaoIndex < 0) throw new Error("O cabeçalho precisa conter as colunas nome e funcao.");
  const errors: string[] = [];
  const rows = lines.slice(1).map((values, offset) => {
    const line = offset + 2; const nome = values[nomeIndex]?.trim() || ""; const funcao = values[funcaoIndex]?.trim() || "";
    if (!nome || !funcao) { errors.push("Linha " + line + ": nome e função são obrigatórios."); return null; }
    return { nome, funcao, telefone: telefoneIndex >= 0 ? values[telefoneIndex]?.trim() || null : null, cpf: cpfIndex >= 0 ? values[cpfIndex]?.replace(/\D/g, "") || null : null };
  }).filter((row): row is { nome: string; funcao: string; telefone: string | null; cpf: string | null } => Boolean(row));
  return { rows, errors };
}
export async function parseCollaboratorsFile(file: File) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("O arquivo deve ter no máximo 10 MB.");
  const filename = file.name.toLowerCase();
  let csv: string;
  if (filename.endsWith(".csv")) {
    csv = await file.text();
  } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("A planilha não tem uma primeira aba com dados.");
    csv = XLSX.utils.sheet_to_csv(sheet);
  } else {
    throw new Error("Selecione um arquivo CSV, XLSX ou XLS.");
  }
  return parseCollaboratorsCsv(csv);
}
function normalizedDuplicateText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
function normalizedDuplicateDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}
function normalizedDuplicatePhone(value: unknown) {
  const digits = normalizedDuplicateDigits(value);
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
}
export function findDuplicateCollaborator(candidate: CollaboratorIdentity, existing: CollaboratorIdentity[], ignoreId?: number): "telefone" | "cpf" | "pessoa" | null {
  const phone = normalizedDuplicatePhone(candidate.telefone);
  const cpf = normalizedDuplicateDigits(candidate.cpf);
  const name = normalizedDuplicateText(candidate.nome);
  const role = normalizedDuplicateText(candidate.funcao);
  for (const person of existing) {
    if (ignoreId && Number(person.id) === Number(ignoreId)) continue;
    const personPhone = normalizedDuplicatePhone(person.telefone);
    const personCpf = normalizedDuplicateDigits(person.cpf);
    if (phone && phone === personPhone) return "telefone";
    if (cpf && cpf === personCpf) return "cpf";
    if (name && role && name === normalizedDuplicateText(person.nome) && role === normalizedDuplicateText(person.funcao)) {
      const differentKnownPhone = phone && personPhone && phone !== personPhone;
      const differentKnownCpf = cpf && personCpf && cpf !== personCpf;
      if (!differentKnownPhone && !differentKnownCpf) return "pessoa";
    }
  }
  return null;
}
export function duplicateCollaboratorMessage(duplicate: ReturnType<typeof findDuplicateCollaborator>) {
  if (duplicate === "telefone") return "Este telefone já está cadastrado para outro colaborador.";
  if (duplicate === "cpf") return "Este CPF já está cadastrado para outro colaborador.";
  if (duplicate === "pessoa") return "Já existe um colaborador com este nome e função. Confira o cadastro ou informe CPF/telefone para diferenciar pessoas com nomes iguais.";
  return "";
}
