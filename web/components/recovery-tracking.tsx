"use client";

import { useState } from "react";
import type { Data } from "../lib/operacional";
import { date } from "../lib/operacional";
import { acompanharRecuperacao } from "../lib/recuperacao";

function quantidade(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

export default function RecoveryTracking({
  data,
  today,
  onOpenTask,
}: {
  data: Data;
  today: string;
  onOpenTask: (taskId: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [asOf, setAsOf] = useState(today);
  const items = acompanharRecuperacao(data, asOf);
  const delayed = items.filter((item) => item.status === "atrasada").length;
  const belowTarget = items.filter((item) => item.status === "meta_nao_atingida").length;
  const recovered = items.filter((item) => item.status === "recuperada").length;
  const visible = showAll ? items : items.slice(0, 8);

  return (
    <section className="panel editor" aria-labelledby="recovery-title">
      <div className="section-heading">
        <div>
          <h2 id="recovery-title">Atrasos e recuperação de frentes</h2>
          <p className="muted">
            Compara a meta semanal com a produção lançada até a data escolhida e
            relaciona impedimentos, retomadas e novos vínculos de equipe após o prazo.
          </p>
        </div>
        <label className="form-field" htmlFor="recovery-as-of">
          Data de análise
          <input
            id="recovery-as-of"
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value || today)}
          />
        </label>
      </div>
      {asOf > today && (
        <p className="notice">
          A data escolhida é futura. A análise considera lançamentos já registrados para esse período.
        </p>
      )}

      {items.length > 0 ? (
        <>
          <div className="stats">
            <div className="panel stat">
              <span>Em atraso</span>
              <strong>{delayed}</strong>
              <small>Metas vencidas ainda não atingidas</small>
            </div>
            <div className="panel stat">
              <span>Meta não atingida</span>
              <strong>{belowTarget}</strong>
              <small>Tarefas concluídas abaixo do planejado</small>
            </div>
            <div className="panel stat">
              <span>Recuperadas</span>
              <strong>{recovered}</strong>
              <small>Meta atingida depois do prazo</small>
            </div>
          </div>

          <div className="panel table-wrap responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Frente e serviço</th>
                  <th>Equipe</th>
                  <th>Prazo semanal</th>
                  <th>Meta / produção</th>
                  <th>Impedimento e retomada</th>
                  <th>Resultado</th>
                  <th>Acompanhar</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Frente e serviço">
                      <strong>{item.frente}</strong>
                      <br />
                      {item.servico}
                    </td>
                    <td data-label="Equipe">{item.equipe}</td>
                    <td data-label="Prazo semanal">
                      {date(item.semana_inicio)} – {date(item.semana_fim)}
                    </td>
                    <td data-label="Meta / produção">
                      {quantidade(item.meta)} / {quantidade(item.executado)} {item.unidade}
                      <br />
                      <small>
                        {item.status === "atrasada"
                          ? `Faltam ${quantidade(Math.max(0, item.meta - item.executado))} ${item.unidade}`
                          : `Meta atingida ${quantidade(item.executado)} ${item.unidade}`}
                      </small>
                    </td>
                    <td data-label="Impedimento e retomada">
                      {item.motivo || "Nenhum impedimento registrado"}
                      {item.observacao && <><br /><small>{item.observacao}</small></>}
                      {item.retomada_em && <><br /><small>Produção retomada em {date(item.retomada_em)}</small></>}
                    </td>
                    <td data-label="Resultado">
                      {item.status === "atrasada" ? (
                        <span className="status">Atrasada há {item.dias_atraso} dia(s)</span>
                      ) : item.status === "meta_nao_atingida" ? (
                        <span className="status">
                          Tarefas concluídas · meta abaixo
                        </span>
                      ) : (
                        <span className="status green">
                          Recuperada em {date(item.recuperada_em || "")}
                        </span>
                      )}
                      <br />
                      <small>
                        {item.novos_vinculos
                          ? `${item.novos_vinculos} novo(s) vínculo(s) de equipe após o prazo`
                          : "Nenhum novo vínculo de equipe após o prazo"}
                      </small>
                    </td>
                    <td data-label="Acompanhar">
                      {item.tarefa_ids.length > 0 ? (
                        <button
                          className="inline-link"
                          onClick={() => onOpenTask(item.tarefa_ids[0])}
                        >
                          Ver tarefa
                        </button>
                      ) : (
                        <small>Sem tarefa diária vinculada</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length > 8 && (
            <button className="secondary" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Mostrar apenas 8" : `Mostrar todos os ${items.length} registros`}
            </button>
          )}
        </>
      ) : (
        <p className="notice">
          Não há meta semanal vencida e pendente até {date(asOf)}.
          Os prazos posteriores à data de análise não aparecem nesta lista.
        </p>
      )}
    </section>
  );
}
