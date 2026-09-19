import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, taskList } from "../src/commands.js";

test("interpreta ativacao e menu", () => {
  assert.deepEqual(parseCommand("ATIVAR 123456"), { kind: "activate", code: "123456" });
  assert.deepEqual(parseCommand("oi"), { kind: "menu" });
});

test("interpreta producao com virgula", () => {
  assert.deepEqual(parseCommand("PRODUÇÃO 42 3,5 parede norte"), {
    kind: "action",
    action: "producao",
    taskId: 42,
    amount: 3.5,
    motive: null,
    note: "parede norte",
  });
});

test("recusa motivo desconhecido", () => {
  assert.equal(parseCommand("IMPEDIMENTO 7 qualquer").kind, "invalid");
});

test("formata lista vazia e lista com tarefa", () => {
  assert.match(taskList([]), /não tem tarefas/);
  assert.match(taskList([{ id: 8, data: "2026-09-19", servico: "Alvenaria", frente: "Torre", quantidade_meta: 10, unidade: "m²", status: "nao_iniciada" }]), /#8/);
});
