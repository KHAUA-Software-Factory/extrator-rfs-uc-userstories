from __future__ import annotations

from usecase_solid.domain import RelationshipType, UseCaseDocument


class PlantUmlRenderer:
    def render(self, document: UseCaseDocument) -> str:
        lines = ["@startuml", "left to right direction", ""]
        for actor in document.actors.values():
            lines.append(f'actor "{actor.name}" as {actor.id}')
        lines.append("")
        lines.append('rectangle "Sistema" {')
        for use_case in document.use_cases:
            lines.append(f'  usecase "{use_case.name}" as {use_case.id}')
        lines.append("}")
        lines.append("")
        for use_case in document.use_cases:
            for actor_id in use_case.actor_ids:
                lines.append(f"{actor_id} -- {use_case.id}")
        for relationship in document.relationships:
            label = "<<include>>" if relationship.type is RelationshipType.INCLUDE else "<<extend>>"
            lines.append(f"{relationship.source_id} ..> {relationship.target_id} : {label}")
        lines.append("@enduml")
        return "\n".join(lines)
