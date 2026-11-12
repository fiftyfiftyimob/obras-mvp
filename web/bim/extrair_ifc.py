"""Extract the IFC quantities required by the BIM review screen."""
import ifcopenshell
import ifcopenshell.util.element
import ifcopenshell.util.unit

QUANTITIES = {
    "IfcQuantityLength": ("LengthValue", "LENGTHUNIT"),
    "IfcQuantityArea": ("AreaValue", "AREAUNIT"),
    "IfcQuantityVolume": ("VolumeValue", "VOLUMEUNIT"),
    "IfcQuantityCount": ("CountValue", None),
    "IfcQuantityWeight": ("WeightValue", "MASSUNIT"),
    "IfcQuantityTime": ("TimeValue", "TIMEUNIT"),
}

def quantity_rows(model, element):
    rows = []
    for relationship in getattr(element, "IsDefinedBy", ()) or ():
        if not relationship.is_a("IfcRelDefinesByProperties"):
            continue
        group = relationship.RelatingPropertyDefinition
        if not group or not group.is_a("IfcElementQuantity"):
            continue
        for quantity in group.Quantities or ():
            kind = quantity.is_a()
            if kind not in QUANTITIES:
                rows.append({"conjunto": group.Name, "nome": quantity.Name, "tipo": kind,
                             "valor": None, "unidade": None,
                             "pendencia": "Tipo de quantidade não suportado."})
                continue
            field, project_unit_type = QUANTITIES[kind]
            source_unit = getattr(quantity, "Unit", None)
            if source_unit is None and project_unit_type and model.by_type("IfcProject"):
                source_unit = ifcopenshell.util.unit.get_project_unit(model, project_unit_type)
            symbol = ifcopenshell.util.unit.get_unit_symbol(source_unit) if source_unit else None
            value = getattr(quantity, field, None)
            rows.append({
                "conjunto": group.Name, "nome": quantity.Name, "tipo": kind,
                "valor": float(value) if value is not None else None,
                "unidade": symbol if symbol else ("un" if kind == "IfcQuantityCount" else None),
                "pendencia": "Unidade não informada." if project_unit_type and not symbol else None,
            })
    return rows

def extract(path):
    model = ifcopenshell.open(str(path))
    if model.schema not in ("IFC2X3", "IFC4", "IFC4X3"):
        raise ValueError("Versão IFC não suportada: " + str(model.schema))
    elements = []
    for element in model.by_type("IfcElement"):
        container = ifcopenshell.util.element.get_container(element)
        quantities = quantity_rows(model, element)
        warnings = []
        if not element.GlobalId:
            warnings.append("Elemento sem GlobalId.")
        if not quantities:
            warnings.append("Sem quantitativos declarados.")
        if not container:
            warnings.append("Sem localização espacial.")
        elements.append({
            "global_id": element.GlobalId, "classe": element.is_a(),
            "nome": element.Name, "local": container.Name if container else None,
            "local_global_id": container.GlobalId if container else None,
            "quantidades": quantities, "pendencias": warnings,
        })
    return {"schema": model.schema, "elementos": elements}
