// 문서 트리 ↔ JSON 평면 객체 (세션 저장·서버 연동)

import { LabelWidget, WidgetKind } from "./label_widget.js";
import { shapeFromPlain, shapeToPlain } from "./shape_snapshot.js";
import { NodeType, createDocumentRoot, createGroupNode, createLeafNode, createWidgetNode } from "./style_node_tree.js";

/**
 * @param {object} plain
 * @returns {import("./label_widget.js").LabelWidget | null}
 */
function widgetFromPlain(plain) {
    if (plain === null || plain === undefined || typeof plain !== "object") {
        return null;
    }
    if (plain.widgetKind === WidgetKind.LABEL) {
        return new LabelWidget({
            id: plain.id,
            name: plain.name,
            position: plain.position ?? { x: 0, y: 0 },
            text: plain.text,
            style: plain.style,
        });
    }
    console.warn("[shape_tree_snapshot] widgetFromPlain: 알 수 없는 widgetKind=%s", plain.widgetKind);
    return null;
}

/**
 * @param {import("./label_widget.js").LabelWidget} widget
 * @returns {object | null}
 */
function widgetToPlain(widget) {
    if (widget === null || widget === undefined) {
        return null;
    }
    if (widget.widgetKind === WidgetKind.LABEL) {
        return {
            widgetKind: WidgetKind.LABEL,
            id: widget.id,
            name: widget.name,
            position: { ...widget.position },
            text: widget.text,
            style: { ...widget.style },
        };
    }
    return null;
}

/**
 * @param {object} node
 * @returns {object | null}
 */
export function nodeToPlain(node) {
    if (node === null || node === undefined) {
        console.warn("[shape_tree_snapshot] nodeToPlain: node 없음");
        return null;
    }
    if (node.nodeType === NodeType.LEAF) {
        const plainShape = shapeToPlain(node.shape);
        if (plainShape === null) return null;
        return { nodeType: NodeType.LEAF, id: node.id, shape: plainShape };
    }
    if (node.nodeType === NodeType.WIDGET) {
        const pw = widgetToPlain(node.widget);
        if (pw === null) return null;
        return { nodeType: NodeType.WIDGET, id: node.id, widget: pw };
    }
    if (node.nodeType === NodeType.GROUP) {
        const children = node.children.map(nodeToPlain).filter((c) => c !== null);
        return {
            nodeType: NodeType.GROUP,
            id: node.id,
            name: node.name,
            transform: { ...node.transform },
            children,
        };
    }
    return null;
}

/**
 * @param {object} plain
 * @returns {object | null}
 */
export function nodeFromPlain(plain) {
    if (plain === null || plain === undefined || typeof plain !== "object") {
        console.warn("[shape_tree_snapshot] nodeFromPlain: plain 없음");
        return null;
    }
    if (plain.nodeType === NodeType.LEAF) {
        const sh = shapeFromPlain(plain.shape);
        if (sh === null) return null;
        return createLeafNode({ id: plain.id, shape: sh });
    }
    if (plain.nodeType === NodeType.WIDGET) {
        const w = widgetFromPlain(plain.widget);
        if (w === null) return null;
        return createWidgetNode({ id: plain.id, widget: w });
    }
    if (plain.nodeType === NodeType.GROUP) {
        const g = createGroupNode({
            id: plain.id,
            name: plain.name,
            transform: plain.transform,
        });
        const ch = plain.children ?? [];
        for (const c of ch) {
            const n = nodeFromPlain(c);
            if (n !== null) g.children.push(n);
        }
        return g;
    }
    return null;
}

/**
 * v1 평면 도형 배열을 세션 루트 아래 리프로 옮긴다.
 * @param {import("./shapes.js").BaseShape[]} shapes
 */
export function wrapFlatShapesInSessionRoot(shapes) {
    const root = createDocumentRoot();
    const session = root.children[0];
    const list = Array.isArray(shapes) ? shapes : [];
    for (const sh of list) {
        const leaf = createLeafNode({ shape: sh });
        if (leaf !== null) session.children.push(leaf);
    }
    return root;
}
