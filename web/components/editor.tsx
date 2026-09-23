"use client";
import { FormEvent, useState } from "react";
import { mensagemErro } from "../lib/supabase";
export type Row = Record<string, any>;
export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string | number; label: string }[];
  min?: string;
  step?: string;
  maxLength?: number;
  allowCustom?: boolean;
  quickCreate?: {
    table: "frentes" | "equipes" | "servicos";
    label: string;
    placeholder: string;
    withUnit?: boolean;
  };
};
export default function Editor({
  title,
  fields,
  initial = {},
  onSave,
  onCreateOption,
  onCancel,
}: {
  title: string;
  fields: Field[];
  initial?: Row;
  onSave: (data: Row) => Promise<void>;
  onCreateOption?: (
    field: Field,
    data: { nome: string; unidade?: string },
  ) => Promise<{ value: string | number; label: string }>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState("");
  const [error, setError] = useState("");
  const [values, setValues] = useState<Row>(() => ({ ...initial }));
  const [customFields, setCustomFields] = useState<string[]>(() =>
    fields
      .filter(
        (field) =>
          field.allowCustom &&
          initial[field.name] &&
          !field.options?.some(
            (option) => String(option.value) === String(initial[field.name]),
          ),
      )
      .map((field) => field.name),
  );
  const [extraOptions, setExtraOptions] = useState<
    Record<string, { value: string | number; label: string }[]>
  >({});
  const [drafts, setDrafts] = useState<
    Record<string, { nome: string; unidade: string }>
  >({});

  async function createOption(field: Field) {
    if (!onCreateOption || !field.quickCreate) return;
    const draft = drafts[field.name] || { nome: "", unidade: "m²" };
    if (!draft.nome.trim()) return setError("Informe o nome do novo item.");
    setBusy(true);
    setError("");
    try {
      const option = await onCreateOption(field, {
        nome: draft.nome.trim(),
        unidade: field.quickCreate.withUnit ? draft.unidade || "m²" : undefined,
      });
      setExtraOptions((current) => ({
        ...current,
        [field.name]: [...(current[field.name] || []), option].filter(
          (candidate, index, all) =>
            all.findIndex(
              (item) => String(item.value) === String(candidate.value),
            ) === index &&
            !field.options?.some(
              (item) => String(item.value) === String(candidate.value),
            ),
        ),
      }));
      setValues((current) => ({ ...current, [field.name]: option.value }));
      setCreating("");
    } catch (cause) {
      setError(mensagemErro(cause));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data: Row = {};
    fields.forEach((field) => {
      const v = String(f.get(field.name) || "").trim();
      data[field.name] =
        v === ""
          ? null
          : field.type === "number" || field.name.endsWith("_id")
            ? Number(v)
            : v;
    });
    setBusy(true);
    setError("");
    try {
      await onSave(data);
      onCancel();
    } catch (e) {
      setError(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel editor">
      <div className="section-heading">
        <h2>{title}</h2>
        <button className="secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <form onSubmit={save}>
        <div className="form-grid">
          {fields.map((f) => {
            const options = [
              ...(f.options || []),
              ...(extraOptions[f.name] || []),
            ];
            const custom = customFields.includes(f.name);
            return (
              <div className="form-field" key={f.name}>
              <label htmlFor={`field-${f.name}`}>
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.options && !custom ? (
                <select
                  id={`field-${f.name}`}
                  name={f.name}
                  required={f.required}
                  value={values[f.name] ?? ""}
                  onChange={(event) => {
                    if (event.target.value === "__custom__") {
                      setCustomFields((current) => [...current, f.name]);
                      setValues((current) => ({ ...current, [f.name]: "" }));
                    } else if (event.target.value === "__create__") {
                      setCreating(f.name);
                      setDrafts((current) => ({
                        ...current,
                        [f.name]: current[f.name] || { nome: "", unidade: "m²" },
                      }));
                    } else {
                      setValues((current) => ({
                        ...current,
                        [f.name]: event.target.value,
                      }));
                    }
                  }}
                >
                  <option value="">Selecione</option>
                  {initial[f.name] &&
                    !options.some(
                      (o) => String(o.value) === String(initial[f.name]),
                    ) && (
                      <option value={initial[f.name]}>
                        Registro arquivado (#{initial[f.name]})
                      </option>
                    )}
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {f.allowCustom && (
                    <option value="__custom__">+ Acrescentar uma nova</option>
                  )}
                  {f.quickCreate && (
                    <option value="__create__">+ Acrescentar um novo</option>
                  )}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  id={`field-${f.name}`}
                  name={f.name}
                  defaultValue={initial[f.name] ?? ""}
                  maxLength={4000}
                />
              ) : (
                <input
                  id={`field-${f.name}`}
                  name={f.name}
                  type={f.type || "text"}
                  required={f.required}
                  defaultValue={initial[f.name] ?? ""}
                  min={f.min}
                  step={f.step}
                  maxLength={f.maxLength ?? 200}
                />
              )}
              {custom && (
                <button
                  className="inline-link"
                  type="button"
                  onClick={() => {
                    setCustomFields((current) =>
                      current.filter((name) => name !== f.name),
                    );
                    setValues((current) => ({ ...current, [f.name]: "" }));
                  }}
                >
                  Voltar para a lista
                </button>
              )}
              {creating === f.name && f.quickCreate && (
                <div className="quick-create">
                  <input
                    aria-label={f.quickCreate.label}
                    placeholder={f.quickCreate.placeholder}
                    value={drafts[f.name]?.nome || ""}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [f.name]: {
                          nome: event.target.value,
                          unidade: current[f.name]?.unidade || "m²",
                        },
                      }))
                    }
                  />
                  {f.quickCreate.withUnit && (
                    <select
                      aria-label="Unidade do novo serviço"
                      value={drafts[f.name]?.unidade || "m²"}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [f.name]: {
                            nome: current[f.name]?.nome || "",
                            unidade: event.target.value,
                          },
                        }))
                      }
                    >
                      {["m²", "m³", "m", "un", "kg", "h", "%"].map((unit) => (
                        <option value={unit} key={unit}>{unit}</option>
                      ))}
                    </select>
                  )}
                  <div className="task-actions">
                    <button
                      className="primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void createOption(f)}
                    >
                      Adicionar e selecionar
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => setCreating("")}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              </div>
            );
          })}
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </form>
    </section>
  );
}
