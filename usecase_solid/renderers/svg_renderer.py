from __future__ import annotations

import html
from typing import Dict, List, Tuple

from usecase_solid.domain import RelationshipType, UseCase, UseCaseDocument
from usecase_solid.text_utils import wrap_text


class SvgUseCaseDiagramRenderer:
    ACTOR_X = 95
    SYSTEM_X = 245
    SYSTEM_Y = 45
    USE_CASE_X = 590
    USE_CASE_RX = 140
    RELATION_LANE_START_X = 810
    RELATION_LANE_GAP = 42
    RELATION_LABEL_GAP = 22

    def render(self, document: UseCaseDocument) -> str:
        relationship_count = max(1, len(document.relationships))
        width = max(1100, self.RELATION_LANE_START_X + relationship_count * self.RELATION_LANE_GAP + 155)
        height = max(420, 120 + max(1, len(document.use_cases)) * 95)
        actor_positions = self._actor_positions(document, height)
        use_case_positions = self._use_case_positions(document)
        system_width = width - self.SYSTEM_X - 70

        parts: List[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            "<defs>",
            '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">',
            '<path d="M 0 0 L 10 5 L 0 10 z" fill="#333"/>',
            "</marker>",
            "</defs>",
            '<rect width="100%" height="100%" fill="#ffffff"/>',
            '<rect x="{}" y="{}" width="{}" height="{}" rx="8" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>'.format(
                self.SYSTEM_X, self.SYSTEM_Y, system_width, height - 85
            ),
            '<text x="265" y="76" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#0f172a">Sistema</text>',
        ]

        if not document.use_cases:
            parts.extend(self._draw_empty_state(width, height))
            parts.append("</svg>")
            return "\n".join(parts)

        # Edges are drawn before nodes so labels and shapes remain readable.
        for use_case in document.use_cases:
            ux, uy = use_case_positions[use_case.id]
            for actor_id in use_case.actor_ids:
                if actor_id not in actor_positions:
                    continue
                ax, ay = actor_positions[actor_id]
                parts.append(self._line(ax + 45, ay, ux - self.USE_CASE_RX, uy, "#94a3b8", "1.4"))

        used_label_ys: List[int] = []
        for lane_index, relationship in enumerate(document.relationships):
            if relationship.source_id not in use_case_positions or relationship.target_id not in use_case_positions:
                continue
            sx, sy = use_case_positions[relationship.source_id]
            tx, ty = use_case_positions[relationship.target_id]
            label = "<<include>>" if relationship.type is RelationshipType.INCLUDE else "<<extend>>"
            lane_x = self.RELATION_LANE_START_X + lane_index * self.RELATION_LANE_GAP
            preferred_label_y = int((sy + ty) / 2)
            label_y = self._claim_label_y(preferred_label_y, used_label_ys, height)
            parts.append(self._routed_relationship(sx, sy, tx, ty, lane_x, label_y, label))

        for actor_id, (x, y) in actor_positions.items():
            actor = document.actors[actor_id]
            parts.extend(self._draw_actor(x, y, actor.name))

        for use_case in document.use_cases:
            x, y = use_case_positions[use_case.id]
            parts.extend(self._draw_use_case(x, y, use_case.name))

        parts.append("</svg>")
        return "\n".join(parts)

    def _actor_positions(self, document: UseCaseDocument, height: int) -> Dict[str, Tuple[int, int]]:
        actor_ids = list(document.actors.keys())
        spacing = height / (len(actor_ids) + 1)
        return {actor_id: (self.ACTOR_X, int(spacing * (index + 1))) for index, actor_id in enumerate(actor_ids)}

    def _use_case_positions(self, document: UseCaseDocument) -> Dict[str, Tuple[int, int]]:
        return {use_case.id: (self.USE_CASE_X, 130 + index * 95) for index, use_case in enumerate(document.use_cases)}

    def _draw_actor(self, x: int, y: int, name: str) -> List[str]:
        safe_name = html.escape(name)
        return [
            f'<circle cx="{x}" cy="{y - 36}" r="15" fill="#ffffff" stroke="#0f172a" stroke-width="1.6"/>',
            f'<line x1="{x}" y1="{y - 20}" x2="{x}" y2="{y + 24}" stroke="#0f172a" stroke-width="1.6"/>',
            f'<line x1="{x - 28}" y1="{y - 4}" x2="{x + 28}" y2="{y - 4}" stroke="#0f172a" stroke-width="1.6"/>',
            f'<line x1="{x}" y1="{y + 24}" x2="{x - 26}" y2="{y + 58}" stroke="#0f172a" stroke-width="1.6"/>',
            f'<line x1="{x}" y1="{y + 24}" x2="{x + 26}" y2="{y + 58}" stroke="#0f172a" stroke-width="1.6"/>',
            f'<text x="{x}" y="{y + 84}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#0f172a">{safe_name}</text>',
        ]

    def _draw_use_case(self, x: int, y: int, name: str) -> List[str]:
        lines = wrap_text(name, 24)
        parts = [
            f'<ellipse cx="{x}" cy="{y}" rx="{self.USE_CASE_RX}" ry="36" fill="#ffffff" stroke="#2563eb" stroke-width="1.8"/>'
        ]
        start_y = y - (len(lines) - 1) * 8
        for index, line in enumerate(lines):
            parts.append(
                f'<text x="{x}" y="{start_y + index * 17}" text-anchor="middle" '
                f'font-family="Arial, sans-serif" font-size="14" fill="#0f172a">{html.escape(line)}</text>'
            )
        return parts

    def _line(self, x1: int, y1: int, x2: int, y2: int, color: str, width: str) -> str:
        return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"/>'

    def _draw_empty_state(self, width: int, height: int) -> List[str]:
        x = width / 2
        y = height / 2
        message = "Nenhum caso de uso identificado"
        hint = "Use frases como: O cliente pode consultar pedidos."
        return [
            f'<text x="{x}" y="{y - 8}" text-anchor="middle" font-family="Arial, sans-serif" '
            f'font-size="18" font-weight="700" fill="#334155">{html.escape(message)}</text>',
            f'<text x="{x}" y="{y + 20}" text-anchor="middle" font-family="Arial, sans-serif" '
            f'font-size="14" fill="#64748b">{html.escape(hint)}</text>',
        ]

    def _routed_relationship(
        self,
        source_x: int,
        source_y: int,
        target_x: int,
        target_y: int,
        lane_x: int,
        label_y: int,
        label: str,
    ) -> str:
        source_edge_x = source_x + self.USE_CASE_RX
        target_edge_x = target_x + self.USE_CASE_RX
        label_text = html.escape(label)
        label_width = max(92, len(label) * 7 + 18)
        label_x = lane_x + 12
        path = f"M {source_edge_x} {source_y} H {lane_x} V {target_y} H {target_edge_x}"
        return (
            f'<path class="relationship-edge" d="{path}" fill="none" stroke="#111827" stroke-width="1.4" '
            f'stroke-dasharray="6 5" marker-end="url(#arrow)"/>'
            f'<rect x="{label_x - 6}" y="{label_y - 15}" width="{label_width}" height="20" rx="3" '
            f'fill="#ffffff" stroke="#e2e8f0" stroke-width="0.8"/>'
            f'<text x="{label_x}" y="{label_y}" text-anchor="start" font-family="Arial, sans-serif" '
            f'font-size="13" fill="#111827">{label_text}</text>'
        )

    def _claim_label_y(self, preferred_y: int, used_label_ys: List[int], height: int) -> int:
        min_y = 96
        max_y = height - 36
        label_y = max(min_y, min(max_y, preferred_y))
        direction = 1
        while any(abs(label_y - used_y) < self.RELATION_LABEL_GAP for used_y in used_label_ys):
            label_y += direction * self.RELATION_LABEL_GAP
            if label_y > max_y:
                label_y = max(min_y, preferred_y - self.RELATION_LABEL_GAP)
                direction = -1
            elif label_y < min_y:
                label_y = max(min_y, min(max_y, preferred_y))
                break
        used_label_ys.append(label_y)
        return label_y
