const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCollaboratorsCsv,
  findDuplicateCollaborator,
} = require("../.tmp-tests/lib/collaborators-import.js");

test("CSV de colaboradores aceita aspas, separador e quebra de linha", () => {
  const csv = 'nome;funcao;telefone;cpf\r\n"Ana; Maria";"Mestre\nde obras";27999999999;123.456.789-00\r\n';
  const result = parseCollaboratorsCsv(csv);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [{
    nome: "Ana; Maria", funcao: "Mestre\nde obras",
    telefone: "27999999999", cpf: "12345678900",
  }]);
});

test("CSV inválido não é aceito para importação", () => {
  assert.throws(() => parseCollaboratorsCsv('nome,funcao\n"Ana,Pedreiro'), /aspas sem fechamento/i);
  assert.throws(() => parseCollaboratorsCsv("nome,funcao\nAna,Pedreiro,extra"), /número de colunas/i);
});

test("duplicidade normaliza DDI, CPF e acentos", () => {
  const existing = [{ id: 4, nome: "José Silva", funcao: "Pedreiro", telefone: "27999999999", cpf: "12345678900" }];
  assert.equal(findDuplicateCollaborator({ nome: "Outra", funcao: "Pintor", telefone: "+55 (27) 99999-9999" }, existing), "telefone");
  assert.equal(findDuplicateCollaborator({ nome: "Outra", funcao: "Pintor", cpf: "123.456.789-00" }, existing), "cpf");
  assert.equal(findDuplicateCollaborator({ nome: "Jose  Silva", funcao: "pedreiro" }, existing), "pessoa");
  assert.equal(findDuplicateCollaborator({ nome: "Jose Silva", funcao: "Pedreiro", telefone: "27988888888" }, existing), null);
  assert.equal(findDuplicateCollaborator({ nome: "José Silva", funcao: "Pedreiro", telefone: "27999999999" }, existing, 4), null);
});
