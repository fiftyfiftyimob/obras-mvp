import type { Data } from "../lib/operacional";
import { date } from "../lib/operacional";
import { estimarImpactoImpedimentos } from "../lib/impacto-prazo";

function dataHora(value: string) {
  const parsed = new Date(value.endsWith("Z") ? value : value + "Z");
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

function formatarDuracao(totalHoras: number) {
  const minutos = Math.max(0, Math.round(totalHoras * 60));
  const dias = Math.floor(minutos / (24 * 60));
  const horas = Math.floor((minutos % (24 * 60)) / 60);
  const restoMinutos = minutos % 60;
  if (dias) return `${dias} d ${horas} h`;
  if (horas) return `${horas} h ${restoMinutos} min`;
  return `${restoMinutos} min`;
}

export default function ImpactoImpedimentos({
  data,
  asOf,
  today,
  onOpenTask,
}: {
  data: Data;
  asOf: string;
  today: string;
  onOpenTask: (taskId: number) => void;
}) {
  const items = estimarImpactoImpedimentos(data, asOf, today);

  return (
    <section className="panel editor" aria-labelledby="delay-impact-title">
      <div className="section-heading">
        <div>
          <h2 id="delay-impact-title">Impacto de chuva e falta de material</h2>
          <p className="muted">
            Duração entre o impedimento e a retomada, atividades afetadas e
            previsão de prazo recalculada a partir do planejamento semanal.
          </p>
        </div>
      </div>

      <p className="notice">
        A duração usa dias corridos; períodos simultâneos na mesma frente contam uma vez.
        A previsão é uma estimativa simples e não calcula dependências entre serviços.
      </p>

      {items.length > 0 ? (
        <div className="panel table-wrap responsive-table">
          <table>
            <thead>
              <tr>
                <th>Frente afetada</th>
                <th>Motivo e atividades</th>
                <th>Duração registrada</th>
                <th>Prazo base</th>
                <th>Previsão atualizada</th>
                <th>Acompanhar</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.frenteId}>
                  <td data-label="Frente afetada">
                    <strong>{item.frente}</strong>
                    <br />
                    <small>
                      {item.eventos} evento(s) · {item.atividades.length} atividade(s)
                    </small>
                  </td>
                  <td data-label="Motivo e atividades">
                    <strong>{item.motivos.join(", ")}</strong>
                    <br />
                    <small>{item.atividades.join("; ")}</small>
                    <details>
                      <summary>Detalhes dos {item.eventos} impedimentos</summary>
                      <ul>
                        {item.incidentes.map((incident) => (
                          <li key={incident.id}>
                            <small>
                              {incident.motivo} · {incident.atividade}
                              <br />
                              Início: {dataHora(incident.inicio)}
                              <br />
                              {incident.emAberto
                                ? "Em aberto até " + dataHora(incident.fim)
                                : "Retomada: " + dataHora(incident.fim)}
                              {" · "}{formatarDuracao(incident.duracaoHoras)}
                              {incident.observacao ? <><br />{incident.observacao}</> : null}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td data-label="Duração registrada">
                    {formatarDuracao(item.horasImpedidas)}
                    <br />
                    <small>Impacto estimado: +{item.diasAdicionados} dia(s) corridos</small>
                    {item.impedimentosAbertos > 0 && (
                      <>
                        <br />
                        <span className="status">
                          {item.impedimentosAbertos} aguardando retomada
                        </span>
                      </>
                    )}
                  </td>
                  <td data-label="Prazo base">
                    {item.prazoBase ? date(item.prazoBase) : "Sem prazo semanal"}
                  </td>
                  <td data-label="Previsão atualizada">
                    {item.previsaoAtualizada ? (
                      <>
                        <strong>{date(item.previsaoAtualizada)}</strong>
                        <br />
                        <small>
                          {item.impedimentosAbertos > 0
                            ? `Estimativa parcial até ${date(asOf)}`
                            : "Estimativa com os impedimentos registrados"}
                        </small>
                      </>
                    ) : (
                      <small>Cadastre um compromisso semanal para estimar o prazo.</small>
                    )}
                  </td>
                  <td data-label="Acompanhar">
                    {item.tarefaIds.length > 0 ? (
                      <button
                        className="inline-link"
                        onClick={() => onOpenTask(item.tarefaIds[0])}
                      >
                        Ver atividade
                      </button>
                    ) : (
                      <small>Sem tarefa relacionada</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="notice">
          Nenhum impedimento por chuva ou falta de material foi registrado até {date(asOf)}.
        </p>
      )}
    </section>
  );
}
