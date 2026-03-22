"use client";

import { useFormState } from "react-dom";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { createTemplateAction, updateTemplateAction } from "@/app/actions";
import type { BuiltinEntityType, EntityFieldCategory, TemplateDefinition, TemplateMode } from "@/lib/types";
import type { EntityFieldInfo } from "@/lib/metadata";
import { LocalePicker } from "@/components/ui/locale-picker";

// ─── DB model types (mirrored from lib/db-model.ts for client use) ────────────

interface DbModelField {
  name: string;
  type: number;
  description: string | null;
  // Present for entity-mode fields discovered from FieldProperties
  fieldCategory?: EntityFieldCategory;
  serviceTypeName?: string;
}

interface DbModelTable {
  name: string;
  primaryKey: string;
  fields: DbModelField[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Strategy = "faker" | "static" | "list" | "sequence" | "fk" | "mdolist";
type FkSelect = "round-robin" | "random";

interface MdoListDef {
  id: number;
  name: string;
  listType: string;
}

interface FieldState {
  _id: string;
  field: string;
  strategy: Strategy;
  fakerPath: string;
  value: string;
  list: string; // comma-separated
  fkEntity: string;
  fkSelect: FkSelect;
  // mdolist
  mdoListId: number | null;
  mdoListType: string;
  mdoListName: string;
  // entity-agent mode hint (set when field is selected from FieldProperties-based picker)
  fieldCategory?: EntityFieldCategory;
}

interface SecondaryTableState {
  _id: string;
  tableName: string;
  primaryKey: string;
  parentFkColumn: string;
  fields: FieldState[];
  expanded: boolean;
}

interface EntityState {
  _id: string;
  name: string;
  builtinType: BuiltinEntityType | "";  // "" = custom
  tableName: string;   // used when builtinType === ""
  primaryKey: string;  // used when builtinType === ""
  quantityDefault: number;
  localeFallbacks: string; // comma-separated
  dependsOn: string;        // comma-separated entity names
  fields: FieldState[];
  secondaryTables: SecondaryTableState[];
  expanded: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BUILTIN_TYPES: BuiltinEntityType[] = ["company", "contact", "followUp", "project", "sale"];

/** Fallback field suggestions used when the SuperOffice API is unreachable */
const ENTITY_FIELD_FALLBACKS: Record<BuiltinEntityType, string[]> = {
  company:  ["name", "phone", "email", "orgNr", "department"],
  contact:  ["firstName", "lastName", "title", "phone", "mobile", "email"],
  followUp: ["title", "description"],
  project:  ["name", "number"],
  sale:     ["heading", "amount"]
};

const ENTITY_ICONS: Record<string, string> = {
  company: "🏢",
  contact: "👤",
  followUp: "📅",
  project: "📋",
  sale: "💰"
};

const DEFAULT_FIELDS: Record<BuiltinEntityType, Array<{ field: string; fakerPath: string }>> = {
  company: [
    { field: "name", fakerPath: "company.name" },
    { field: "phone", fakerPath: "phone.number" },
    { field: "email", fakerPath: "internet.email" }
  ],
  contact: [
    { field: "firstName", fakerPath: "person.firstName" },
    { field: "lastName", fakerPath: "person.lastName" },
    { field: "mobile", fakerPath: "phone.number" }
  ],
  followUp: [{ field: "title", fakerPath: "lorem.words" }],
  project: [{ field: "name", fakerPath: "commerce.productName" }],
  sale: [
    { field: "heading", fakerPath: "commerce.productName" },
    { field: "amount", fakerPath: "finance.amount" }
  ]
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function makeField(field = "", strategy: Strategy = "faker", fakerPath = "", fieldCategory?: EntityFieldCategory): FieldState {
  return { _id: uid(), field, strategy, fakerPath, value: "", list: "", fkEntity: "", fkSelect: "round-robin", mdoListId: null, mdoListType: "", mdoListName: "", fieldCategory };
}

function makeSecondaryTable(): SecondaryTableState {
  return { _id: uid(), tableName: "", primaryKey: "", parentFkColumn: "", fields: [], expanded: true };
}

function makeBuiltinEntity(builtinType: BuiltinEntityType): EntityState {
  return {
    _id: uid(),
    name: builtinType,
    builtinType,
    tableName: "",
    primaryKey: "",
    quantityDefault: 10,
    localeFallbacks: "en",
    dependsOn: "",
    fields: DEFAULT_FIELDS[builtinType].map((f) => makeField(f.field, "faker", f.fakerPath)),
    secondaryTables: [],
    expanded: true
  };
}

function makeCustomEntity(): EntityState {
  return {
    _id: uid(),
    name: "",
    builtinType: "",
    tableName: "",
    primaryKey: "",
    quantityDefault: 10,
    localeFallbacks: "en",
    dependsOn: "",
    fields: [],
    secondaryTables: [],
    expanded: true
  };
}

function fromTemplate(template: TemplateDefinition): EntityState[] {
  return template.entities.map((e) => ({
    _id: uid(),
    name: e.name,
    builtinType: (e.builtinType ?? "") as BuiltinEntityType | "",
    tableName: e.tableName ?? "",
    primaryKey: e.primaryKey ?? "",
    quantityDefault: e.quantityDefault,
    localeFallbacks: e.localeFallbacks.join(", "),
    dependsOn: (e.dependsOn ?? []).join(", "),
    fields: e.fields.map((f) => ({
      _id: uid(),
      field: f.field,
      strategy: f.strategy as Strategy,
      fakerPath: f.fakerPath ?? "",
      value: f.value ?? "",
      list: f.list?.join(", ") ?? "",
      fkEntity: f.fkEntity ?? "",
      fkSelect: (f.fkSelect ?? "round-robin") as FkSelect,
      mdoListId: f.listId ?? null,
      mdoListType: f.listType ?? "",
      mdoListName: f.listName ?? "",
      fieldCategory: f.fieldCategory
    })),
    secondaryTables: (e.secondaryTables ?? []).map((st) => ({
      _id: uid(),
      tableName: st.tableName,
      primaryKey: st.primaryKey,
      parentFkColumn: st.parentFkColumn,
      expanded: false,
      fields: st.fields.map((f) => ({
        _id: uid(),
        field: f.field,
        strategy: f.strategy as Strategy,
        fakerPath: f.fakerPath ?? "",
        value: f.value ?? "",
        list: f.list?.join(", ") ?? "",
        fkEntity: f.fkEntity ?? "",
        fkSelect: (f.fkSelect ?? "round-robin") as FkSelect,
        mdoListId: f.listId ?? null,
        mdoListType: f.listType ?? "",
        mdoListName: f.listName ?? "",
        fieldCategory: f.fieldCategory
      }))
    })),
    expanded: false
  }));
}

function serializeFields(fields: FieldState[]) {
  return fields.filter((f) => f.field.trim()).map((f) => {
    const base = {
      field: f.field.trim(),
      strategy: f.strategy,
      ...(f.fieldCategory && { fieldCategory: f.fieldCategory })
    };
    if (f.strategy === "faker") return { ...base, fakerPath: f.fakerPath };
    if (f.strategy === "static") return { ...base, value: f.value };
    if (f.strategy === "list")
      return { ...base, list: f.list.split(",").map((s) => s.trim()).filter(Boolean) };
    if (f.strategy === "fk")
      return { ...base, fkEntity: f.fkEntity, fkSelect: f.fkSelect };
    if (f.strategy === "mdolist")
      return { ...base, ...(f.mdoListId != null && { listId: f.mdoListId }), listType: f.mdoListType, listName: f.mdoListName };
    return base; // sequence
  });
}

function makeMassOpsEntity(tableName: string, primaryKey: string): EntityState {
  return {
    _id: uid(),
    name: tableName,
    builtinType: "",
    tableName,
    primaryKey,
    quantityDefault: 10,
    localeFallbacks: "en",
    dependsOn: "",
    fields: [],
    secondaryTables: [],
    expanded: true
  };
}

function buildJson(name: string, description: string, mode: TemplateMode, entities: EntityState[]) {
  return {
    name,
    description,
    mode,
    schemaVersion: 2,
    entities: entities.map((e) => {
      const base = {
        name: e.name.trim() || (e.builtinType || "entity"),
        builtinType: e.builtinType || undefined,
        tableName: e.builtinType ? undefined : e.tableName.trim() || undefined,
        primaryKey: e.builtinType ? undefined : e.primaryKey.trim() || undefined,
        quantityDefault: Math.max(1, e.quantityDefault),
        localeFallbacks: e.localeFallbacks.split(",").map((s) => s.trim()).filter(Boolean),
        dependsOn: e.dependsOn.split(",").map((s) => s.trim()).filter(Boolean),
        fields: serializeFields(e.fields)
      };
      const secondaryTables = e.secondaryTables
        .filter((st) => st.tableName.trim())
        .map((st) => ({
          tableName: st.tableName.trim(),
          primaryKey: st.primaryKey.trim() || "id",
          parentFkColumn: st.parentFkColumn.trim(),
          fields: serializeFields(st.fields)
        }));
      return secondaryTables.length ? { ...base, secondaryTables } : base;
    })
  };
}

const initialState = {
  error: null as null | string | Record<string, string[]>,
  success: false
};

// ─── Main component ───────────────────────────────────────────────────────────

interface TemplateFormProps {
  template?: TemplateDefinition;
}

export function TemplateForm({ template }: TemplateFormProps = {}) {
  const serverAction = template ? updateTemplateAction : createTemplateAction;
  const [state, formAction] = useFormState(serverAction, initialState);

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");

  // Derive field-level errors from Zod's flatten().fieldErrors for inline display
  const fieldErrors = typeof state.error === "object" && state.error !== null
    ? state.error as Record<string, string[]>
    : null;
  const [entities, setEntities] = useState<EntityState[]>(() =>
    template ? fromTemplate(template) : []
  );

  const [mode, setMode] = useState<TemplateMode>(template?.mode ?? "entity");
  const modeLocked = entities.length > 0;

  const [dbTables, setDbTables] = useState<DbModelTable[]>([]);
  const [dbModelLoading, setDbModelLoading] = useState(false);
  const [dbModelError, setDbModelError] = useState<string | null>(null);

  const [mdoLists, setMdoLists] = useState<MdoListDef[]>([]);
  const [entityFieldMap, setEntityFieldMap] = useState<Partial<Record<BuiltinEntityType, EntityFieldInfo[]>>>({});
  const [fakerPaths, setFakerPaths] = useState<string[]>([]);

  useEffect(() => {
    if (mode !== "massops" || dbTables.length > 0) return;
    setDbModelLoading(true);
    fetch("/api/metadata/db-model")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { tables: DbModelTable[] }) => setDbTables(d.tables))
      .catch((e: unknown) => setDbModelError(String(e)))
      .finally(() => setDbModelLoading(false));
  }, [mode, dbTables.length]);

  useEffect(() => {
    if (mdoLists.length > 0) return;
    fetch("/api/metadata/lists")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { lists: MdoListDef[] }) => setMdoLists(d.lists))
      .catch(() => { /* non-fatal — mdolist picker will be empty */ });
  }, [mdoLists.length]);

  useEffect(() => {
    if (Object.keys(entityFieldMap).length > 0) return;
    fetch("/api/metadata/entity-fields")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Record<string, EntityFieldInfo[]>) => setEntityFieldMap(d as Record<BuiltinEntityType, EntityFieldInfo[]>))
      .catch(() => { /* non-fatal — falls back to ENTITY_FIELD_FALLBACKS */ });
  }, [entityFieldMap]);

  useEffect(() => {
    if (fakerPaths.length > 0) return;
    fetch("/api/metadata/faker-paths")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { paths: string[] }) => setFakerPaths(d.paths))
      .catch(() => { /* non-fatal — faker path input still works as free text */ });
  }, [fakerPaths.length]);

  const jsonPayload = useMemo(
    () => JSON.stringify(buildJson(name, description, mode, entities), null, 2),
    [name, description, mode, entities]
  );

  // Names of all current entities (for FK / dependsOn pickers)
  const entityNames = useMemo(() => entities.map((e) => e.name.trim()).filter(Boolean), [entities]);

  function addBuiltinEntity() {
    const usedBuiltins = new Set(entities.map((e) => e.builtinType).filter(Boolean));
    const next = BUILTIN_TYPES.find((t) => !usedBuiltins.has(t));
    if (next) setEntities((prev) => [...prev, makeBuiltinEntity(next)]);
    else setEntities((prev) => [...prev, makeCustomEntity()]);
  }

  function addMassOpsEntity(tableName: string) {
    const tableInfo = dbTables.find((t) => t.name === tableName);
    if (!tableInfo) return;
    setEntities((prev) => [...prev, makeMassOpsEntity(tableInfo.name, tableInfo.primaryKey)]);
  }

  function removeEntity(id: string) {
    setEntities((prev) => prev.filter((e) => e._id !== id));
  }

  function toggleEntity(id: string) {
    setEntities((prev) => prev.map((e) => (e._id === id ? { ...e, expanded: !e.expanded } : e)));
  }

  function updateEntity(id: string, patch: Partial<EntityState>) {
    setEntities((prev) => prev.map((e) => (e._id === id ? { ...e, ...patch } : e)));
  }

  function changeBuiltinType(id: string, builtinType: BuiltinEntityType | "") {
    setEntities((prev) =>
      prev.map((e) => {
        if (e._id !== id) return e;
        if (builtinType === "") {
          return { ...e, builtinType: "", fields: [] };
        }
        return {
          ...e,
          builtinType,
          name: e.name === e.builtinType || !e.name ? builtinType : e.name,
          fields: DEFAULT_FIELDS[builtinType].map((f) => makeField(f.field, "faker", f.fakerPath))
        };
      })
    );
  }

  function addField(entityId: string) {
    setEntities((prev) =>
      prev.map((e) => (e._id === entityId ? { ...e, fields: [...e.fields, makeField()] } : e))
    );
  }

  function removeField(entityId: string, fieldId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId ? { ...e, fields: e.fields.filter((f) => f._id !== fieldId) } : e
      )
    );
  }

  function updateField(entityId: string, fieldId: string, patch: Partial<FieldState>) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? { ...e, fields: e.fields.map((f) => (f._id === fieldId ? { ...f, ...patch } : f)) }
          : e
      )
    );
  }

  function addSecondaryTable(entityId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? { ...e, secondaryTables: [...e.secondaryTables, makeSecondaryTable()] }
          : e
      )
    );
  }

  function removeSecondaryTable(entityId: string, stId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? { ...e, secondaryTables: e.secondaryTables.filter((st) => st._id !== stId) }
          : e
      )
    );
  }

  function toggleSecondaryTable(entityId: string, stId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? {
              ...e,
              secondaryTables: e.secondaryTables.map((st) =>
                st._id === stId ? { ...st, expanded: !st.expanded } : st
              )
            }
          : e
      )
    );
  }

  function updateSecondaryTable(entityId: string, stId: string, patch: Partial<SecondaryTableState>) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? {
              ...e,
              secondaryTables: e.secondaryTables.map((st) =>
                st._id === stId ? { ...st, ...patch } : st
              )
            }
          : e
      )
    );
  }

  function addSecondaryField(entityId: string, stId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? {
              ...e,
              secondaryTables: e.secondaryTables.map((st) =>
                st._id === stId ? { ...st, fields: [...st.fields, makeField()] } : st
              )
            }
          : e
      )
    );
  }

  function removeSecondaryField(entityId: string, stId: string, fieldId: string) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? {
              ...e,
              secondaryTables: e.secondaryTables.map((st) =>
                st._id === stId
                  ? { ...st, fields: st.fields.filter((f) => f._id !== fieldId) }
                  : st
              )
            }
          : e
      )
    );
  }

  function updateSecondaryField(entityId: string, stId: string, fieldId: string, patch: Partial<FieldState>) {
    setEntities((prev) =>
      prev.map((e) =>
        e._id === entityId
          ? {
              ...e,
              secondaryTables: e.secondaryTables.map((st) =>
                st._id === stId
                  ? {
                      ...st,
                      fields: st.fields.map((f) => (f._id === fieldId ? { ...f, ...patch } : f))
                    }
                  : st
              )
            }
          : e
      )
    );
  }

  return (
    <form action={formAction} className="card space-y-5">
      <input type="hidden" name="templateJson" value={jsonPayload} />
      {template && <input type="hidden" name="templateId" value={template.id} />}

      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {template ? "Edit template" : "Create template"}
          </h3>
          <p className="text-sm text-slate-500">
            Define entity payloads with faker-powered fields, per-type quantities, and locale
            fallbacks.
          </p>
        </div>
        {template && (
          <Link
            href="/templates"
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            ✕ Cancel
          </Link>
        )}
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Onboarding Burst"
          className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${fieldErrors?.name ? "border-rose-400 focus:border-rose-400" : "border-slate-200 focus:border-brand"}`}
        />
        {fieldErrors?.name && <p className="mt-1 text-xs text-rose-500">{fieldErrors.name[0]}</p>}
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Description
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Creates demo company/contact data for pilot tenants."
          className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${fieldErrors?.description ? "border-rose-400 focus:border-rose-400" : "border-slate-200 focus:border-brand"}`}
        />
        {fieldErrors?.description && <p className="mt-1 text-xs text-rose-500">{fieldErrors.description[0]}</p>}
      </label>

      {/* ── Mode selector ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">
          Template mode
          {modeLocked && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              — locked (remove all entities to change)
            </span>
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${mode === "entity" ? "border-brand bg-brand/5" : "border-slate-200"} ${modeLocked ? "cursor-not-allowed opacity-60" : ""}`}>
            <input
              type="radio"
              name="templateMode"
              value="entity"
              checked={mode === "entity"}
              disabled={modeLocked}
              onChange={() => setMode("entity")}
              className="mt-0.5 accent-brand"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">Entity agents</p>
              <p className="text-xs text-slate-500">
                5 builtin types via ContactAgent / PersonAgent etc. Works with any OIDC token.
              </p>
            </div>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${mode === "massops" ? "border-violet-400 bg-violet-50" : "border-slate-200"} ${modeLocked ? "cursor-not-allowed opacity-60" : ""}`}>
            <input
              type="radio"
              name="templateMode"
              value="massops"
              checked={mode === "massops"}
              disabled={modeLocked}
              onChange={() => setMode("massops")}
              className="mt-0.5 accent-violet-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">Mass operations</p>
              <p className="text-xs text-slate-500">
                Bulk-inserts via DatabaseTableAgent. Custom y_* tables supported. Requires System Design access.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* ── Entity list ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">Entities</p>

          {mode === "entity" && (
            <button
              type="button"
              onClick={addBuiltinEntity}
              className="rounded-lg border border-brand px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5"
            >
              + Add entity
            </button>
          )}

          {mode === "massops" && (
            <div className="flex items-center gap-2">
              {dbModelLoading && (
                <span className="text-xs text-slate-400">Loading DB model…</span>
              )}
              {dbModelError && (
                <span className="text-xs text-rose-500">Failed to load: {dbModelError}</span>
              )}
              <select
                aria-label="Select table to add"
                onChange={(e) => { if (e.target.value) { addMassOpsEntity(e.target.value); e.currentTarget.value = ""; } }}
                disabled={dbModelLoading || dbTables.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 focus:border-brand focus:outline-none disabled:opacity-50"
              >
                <option value="">+ Add table</option>
                {dbTables.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {entities.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
            {mode === "entity"
              ? 'No entities yet — click "+ Add entity" to begin.'
              : 'No tables yet — select a table from the dropdown above.'}
          </p>
        )}

        <div className="space-y-2">
          {entities.map((entity) => (
            <EntityCard
              key={entity._id}
              entity={entity}
              entityNames={entityNames}
              mode={mode}
              tableFields={
                mode === "massops" && !entity.builtinType
                  ? (dbTables.find((t) => t.name === entity.tableName)?.fields ?? [])
                  : mode === "entity" && entity.builtinType
                  ? (entityFieldMap[entity.builtinType] ?? []).length > 0
                    ? (entityFieldMap[entity.builtinType] as EntityFieldInfo[]).map((f) => ({
                        name: f.name,
                        type: 0,
                        description: f.mandatory ? "Required" : null,
                        fieldCategory: f.fieldType,
                        serviceTypeName: f.serviceTypeName
                      }))
                    : ENTITY_FIELD_FALLBACKS[entity.builtinType].map((n) => ({ name: n, type: 0, description: null }))
                  : undefined
              }
              mdoLists={mdoLists}
              fakerPaths={fakerPaths}
              onToggle={() => toggleEntity(entity._id)}
              onRemove={() => removeEntity(entity._id)}
              onChangeBuiltinType={(t) => changeBuiltinType(entity._id, t)}
              onUpdateEntity={(patch) => updateEntity(entity._id, patch)}
              onAddField={() => addField(entity._id)}
              onRemoveField={(fid) => removeField(entity._id, fid)}
              onUpdateField={(fid, patch) => updateField(entity._id, fid, patch)}
              onAddSecondaryTable={() => addSecondaryTable(entity._id)}
              onRemoveSecondaryTable={(stId) => removeSecondaryTable(entity._id, stId)}
              onToggleSecondaryTable={(stId) => toggleSecondaryTable(entity._id, stId)}
              onUpdateSecondaryTable={(stId, patch) => updateSecondaryTable(entity._id, stId, patch)}
              onAddSecondaryField={(stId) => addSecondaryField(entity._id, stId)}
              onRemoveSecondaryField={(stId, fid) => removeSecondaryField(entity._id, stId, fid)}
              onUpdateSecondaryField={(stId, fid, patch) => updateSecondaryField(entity._id, stId, fid, patch)}
            />
          ))}
        </div>
      </div>

      {typeof state.error === "string" && (
        <p className="text-sm text-rose-600">{state.error}</p>
      )}
      {fieldErrors && Object.keys(fieldErrors).some((k) => k !== "name" && k !== "description") && (
        <p className="text-sm text-rose-600">
          Validation failed — check entity types and field strategies.
        </p>
      )}
      {state.success && template && (
        <p className="text-sm text-emerald-600">Template updated successfully.</p>
      )}

      <button
        type="submit"
        className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
      >
        {template ? "Update template" : "Save template"}
      </button>
    </form>
  );
}

// ─── EntityCard ───────────────────────────────────────────────────────────────

interface EntityCardProps {
  entity: EntityState;
  entityNames: string[];
  mode: TemplateMode;
  tableFields?: DbModelField[];
  mdoLists: MdoListDef[];
  fakerPaths: string[];
  onToggle: () => void;
  onRemove: () => void;
  onChangeBuiltinType: (t: BuiltinEntityType | "") => void;
  onUpdateEntity: (patch: Partial<EntityState>) => void;
  onAddField: () => void;
  onRemoveField: (fid: string) => void;
  onUpdateField: (fid: string, patch: Partial<FieldState>) => void;
  onAddSecondaryTable: () => void;
  onRemoveSecondaryTable: (stId: string) => void;
  onToggleSecondaryTable: (stId: string) => void;
  onUpdateSecondaryTable: (stId: string, patch: Partial<SecondaryTableState>) => void;
  onAddSecondaryField: (stId: string) => void;
  onRemoveSecondaryField: (stId: string, fid: string) => void;
  onUpdateSecondaryField: (stId: string, fid: string, patch: Partial<FieldState>) => void;
}

function EntityCard({
  entity,
  entityNames,
  mode,
  tableFields,
  mdoLists,
  fakerPaths,
  onToggle,
  onRemove,
  onChangeBuiltinType,
  onUpdateEntity,
  onAddField,
  onRemoveField,
  onUpdateField,
  onAddSecondaryTable,
  onRemoveSecondaryTable,
  onToggleSecondaryTable,
  onUpdateSecondaryTable,
  onAddSecondaryField,
  onRemoveSecondaryField,
  onUpdateSecondaryField
}: EntityCardProps) {
  const icon = entity.builtinType ? (ENTITY_ICONS[entity.builtinType] ?? "📦") : "🗄️";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="w-4 font-mono text-xs text-slate-400 hover:text-slate-600"
        >
          {entity.expanded ? "▼" : "▶"}
        </button>
        <span className="text-base leading-none">{icon}</span>

        {/* Builtin type selector — only shown in entity mode */}
        {mode === "entity" && (
          <select
            aria-label="Builtin entity type"
            value={entity.builtinType}
            onChange={(e) => onChangeBuiltinType(e.target.value as BuiltinEntityType | "")}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none"
          >
            {BUILTIN_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        {/* Entity name */}
        <input
          type="text"
          value={entity.name}
          onChange={(e) => onUpdateEntity({ name: e.target.value })}
          placeholder="entity name"
          className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
        />

        <label className="flex items-center gap-1 text-xs text-slate-500">
          qty
          <input
            type="number"
            min={1}
            value={entity.quantityDefault}
            onChange={(e) => onUpdateEntity({ quantityDefault: Number(e.target.value) })}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-1 text-xs text-slate-300 hover:bg-rose-50 hover:text-rose-500"
        >
          ✕
        </button>
      </div>

      {/* Expanded body */}
      {entity.expanded && (
        <div className="space-y-3 px-3 pb-3 pt-2">
          {/* Custom entity fields */}
          {!entity.builtinType && (
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                table
                <input
                  type="text"
                  value={entity.tableName}
                  onChange={(e) => onUpdateEntity({ tableName: e.target.value })}
                  placeholder="my_table"
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                PK
                <input
                  type="text"
                  value={entity.primaryKey}
                  onChange={(e) => onUpdateEntity({ primaryKey: e.target.value })}
                  placeholder="id"
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
                />
              </label>
            </div>
          )}

          {/* Locales + dependsOn */}
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-1 items-start gap-1 text-xs text-slate-500">
              <span className="mt-1 shrink-0">locales</span>
              <div className="min-w-0 flex-1">
                <LocalePicker
                  value={entity.localeFallbacks.split(",").map((s) => s.trim()).filter(Boolean)}
                  onChange={(locs) => onUpdateEntity({ localeFallbacks: locs.join(", ") })}
                />
              </div>
            </div>
            <label className="flex flex-1 items-center gap-1 text-xs text-slate-500">
              depends on
              <input
                type="text"
                value={entity.dependsOn}
                onChange={(e) => onUpdateEntity({ dependsOn: e.target.value })}
                placeholder="company, contact"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
              />
            </label>
          </div>

          {/* Field rows */}
          <div>
            {entity.fields.length > 0 && (
              <div className="mb-1 grid grid-cols-[1fr_108px_1fr] gap-x-2 pr-8 text-xs font-medium text-slate-400">
                <span>Field name</span>
                <span>Strategy</span>
                <span>Value / path</span>
              </div>
            )}
            {entity.fields.length === 0 && (
              <p className="py-1 text-xs text-slate-400">No fields — click &ldquo;+ Add field&rdquo; below.</p>
            )}
            <div className="space-y-1.5">
              {entity.fields.map((field) => (
                <FieldRow
                  key={field._id}
                  field={field}
                  entityNames={entityNames}
                  tableFields={tableFields}
                  mdoLists={mdoLists}
                  fakerPaths={fakerPaths}
                  onUpdate={(patch) => onUpdateField(field._id, patch)}
                  onRemove={() => onRemoveField(field._id)}
                />
              ))}
            </div>
            <div className="pt-1 text-right">
              <button type="button" onClick={onAddField} className="text-xs text-brand hover:underline">
                + Add field
              </button>
            </div>
          </div>

          {/* Secondary tables */}
          <div>
            <div className="flex items-center justify-between py-1">
              <p className="text-xs font-medium text-slate-500">Secondary tables</p>
              <button
                type="button"
                onClick={onAddSecondaryTable}
                className="text-xs text-slate-500 hover:text-brand hover:underline"
              >
                + Add table
              </button>
            </div>
            {entity.secondaryTables.map((st) => (
              <SecondaryTableCard
                key={st._id}
                st={st}
                entityNames={entityNames}
                mdoLists={mdoLists}
                fakerPaths={fakerPaths}
                onToggle={() => onToggleSecondaryTable(st._id)}
                onRemove={() => onRemoveSecondaryTable(st._id)}
                onUpdate={(patch) => onUpdateSecondaryTable(st._id, patch)}
                onAddField={() => onAddSecondaryField(st._id)}
                onRemoveField={(fid) => onRemoveSecondaryField(st._id, fid)}
                onUpdateField={(fid, patch) => onUpdateSecondaryField(st._id, fid, patch)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SecondaryTableCard ───────────────────────────────────────────────────────

interface SecondaryTableCardProps {
  st: SecondaryTableState;
  entityNames: string[];
  mdoLists: MdoListDef[];
  fakerPaths: string[];
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<SecondaryTableState>) => void;
  onAddField: () => void;
  onRemoveField: (fid: string) => void;
  onUpdateField: (fid: string, patch: Partial<FieldState>) => void;
}

function SecondaryTableCard({
  st,
  entityNames,
  mdoLists,
  fakerPaths,
  onToggle,
  onRemove,
  onUpdate,
  onAddField,
  onRemoveField,
  onUpdateField
}: SecondaryTableCardProps) {
  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/50">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="w-3 font-mono text-xs text-slate-400 hover:text-slate-600"
        >
          {st.expanded ? "▼" : "▶"}
        </button>
        <span className="text-xs text-slate-400">🗄️</span>
        <input
          type="text"
          value={st.tableName}
          onChange={(e) => onUpdate({ tableName: e.target.value })}
          placeholder="table_name"
          className="w-28 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
        />
        <label className="flex items-center gap-1 text-xs text-slate-400">
          PK
          <input
            type="text"
            value={st.primaryKey}
            onChange={(e) => onUpdate({ primaryKey: e.target.value })}
            placeholder="id"
            className="w-16 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          FK col
          <input
            type="text"
            value={st.parentFkColumn}
            onChange={(e) => onUpdate({ parentFkColumn: e.target.value })}
            placeholder="parent_id"
            className="w-24 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded px-1 text-xs text-slate-300 hover:bg-rose-50 hover:text-rose-500"
        >
          ✕
        </button>
      </div>
      {st.expanded && (
        <div className="px-2 pb-2 pt-1">
          <div className="space-y-1.5">
            {st.fields.map((field) => (
              <FieldRow
                key={field._id}
                field={field}
                entityNames={entityNames}
                mdoLists={mdoLists}
                fakerPaths={fakerPaths}
                onUpdate={(patch) => onUpdateField(field._id, patch)}
                onRemove={() => onRemoveField(field._id)}
              />
            ))}
          </div>
          <div className="pt-1 text-right">
            <button type="button" onClick={onAddField} className="text-xs text-brand hover:underline">
              + Add field
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FieldRow ─────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldState;
  entityNames: string[];
  tableFields?: DbModelField[];
  mdoLists: MdoListDef[];
  fakerPaths: string[];
  onUpdate: (patch: Partial<FieldState>) => void;
  onRemove: () => void;
}

function FieldRow({ field, entityNames, tableFields, mdoLists, fakerPaths, onUpdate, onRemove }: FieldRowProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid flex-1 grid-cols-[1fr_108px_1fr] gap-x-2">
        {tableFields ? (
          <select
            aria-label="Field name"
            value={field.field}
            onChange={(e) => {
              const selected = tableFields.find((f) => f.name === e.target.value);
              const patch: Partial<FieldState> = { field: e.target.value, fieldCategory: selected?.fieldCategory };
              if (selected?.fieldCategory === "service-object") patch.strategy = "mdolist";
              onUpdate(patch);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
          >
            <option value="">— pick field —</option>
            {tableFields.map((f) => (
              <option key={f.name} value={f.name} title={f.description ?? undefined}>
                {f.name}{f.fieldCategory === "service-object" ? " →id" : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={field.field}
            onChange={(e) => onUpdate({ field: e.target.value })}
            placeholder="field name"
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
          />
        )}
        <select
          aria-label="Field strategy"
          value={field.strategy}
          onChange={(e) => onUpdate({ strategy: e.target.value as Strategy })}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
        >
          <option value="faker">faker</option>
          <option value="static">static</option>
          <option value="list">list</option>
          <option value="sequence">sequence</option>
          <option value="fk">fk</option>
          <option value="mdolist">MDO list</option>
        </select>
        <StrategyValueInput field={field} entityNames={entityNames} mdoLists={mdoLists} fakerPaths={fakerPaths} onUpdate={onUpdate} />
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove field"
        className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
      >
        ✕
      </button>
    </div>
  );
}

function StrategyValueInput({
  field,
  entityNames,
  mdoLists,
  fakerPaths,
  onUpdate
}: {
  field: FieldState;
  entityNames: string[];
  mdoLists: MdoListDef[];
  fakerPaths: string[];
  onUpdate: (patch: Partial<FieldState>) => void;
}) {
  const [listFilter, setListFilter] = useState("");
  if (field.strategy === "faker") {
    const listId = `faker-${field._id}`;
    return (
      <>
        <input
          type="text"
          value={field.fakerPath}
          onChange={(e) => onUpdate({ fakerPath: e.target.value })}
          placeholder="e.g. company.name"
          list={listId}
          className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
        />
        {fakerPaths.length > 0 && (
          <datalist id={listId}>
            {fakerPaths.map((p) => <option key={p} value={p} />)}
          </datalist>
        )}
      </>
    );
  }
  if (field.strategy === "static") {
    return (
      <input
        type="text"
        value={field.value}
        onChange={(e) => onUpdate({ value: e.target.value })}
        placeholder="fixed value"
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
      />
    );
  }
  if (field.strategy === "list") {
    return (
      <input
        type="text"
        value={field.list}
        onChange={(e) => onUpdate({ list: e.target.value })}
        placeholder="Hot, Warm, Cold"
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
      />
    );
  }
  if (field.strategy === "fk") {
    return (
      <div className="flex gap-1">
        <select
          aria-label="FK entity"
          value={field.fkEntity}
          onChange={(e) => onUpdate({ fkEntity: e.target.value })}
          className="flex-1 rounded-lg border border-slate-200 px-1 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
        >
          <option value="">— entity —</option>
          {entityNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select
          aria-label="FK selection mode"
          value={field.fkSelect}
          onChange={(e) => onUpdate({ fkSelect: e.target.value as FkSelect })}
          className="rounded-lg border border-slate-200 px-1 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
        >
          <option value="round-robin">rr</option>
          <option value="random">rand</option>
        </select>
      </div>
    );
  }
  if (field.strategy === "mdolist") {
    const filtered = listFilter
      ? mdoLists.filter((l) => l.name.toLowerCase().includes(listFilter.toLowerCase()))
      : mdoLists;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          <input
            type="text"
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            placeholder="Filter lists…"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
          />
          {listFilter && (
            <button
              type="button"
              onClick={() => setListFilter("")}
              className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700"
              title="Show all"
            >
              Show all
            </button>
          )}
        </div>
        <select
          aria-label="MDO list"
          value={field.mdoListId ?? ""}
          onChange={(e) => {
            const selected = mdoLists.find((l) => l.id === Number(e.target.value));
            if (selected) onUpdate({ mdoListId: selected.id, mdoListType: selected.listType, mdoListName: selected.name });
          }}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none"
        >
          <option value="">— pick list —</option>
          {filtered.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
    );
  }
  // sequence
  return <span className="px-2 py-1 text-xs italic text-slate-400">auto-generated</span>;
}
