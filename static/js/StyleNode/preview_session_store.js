// Create Style Node 페이지 편집 상태를 sessionStorage에 두어, 다른 Flask 페이지로 갔다 와도 유지한다.

import { shapeFromPlain, shapeToPlain } from "./shape_snapshot.js";
import { nodeFromPlain, nodeToPlain, wrapFlatShapesInSessionRoot } from "./shape_tree_snapshot.js";
import { createDocumentRoot, ensureDocumentRootTree } from "./style_node_tree.js";

const STORAGE_KEY = "mCanvapp.previewSession.v3";
const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;
/** 문서 트리에 위젯 노드(WIDGET) 포함 */
const SCHEMA_VERSION = 3;

/**
 * 현재 ObjectManager·Renderer·툴바에서 저장용 스냅샷 객체를 만든다.
 */
export function buildPreviewSnapshot(deps) {
    const objectManager = deps.objectManager;
    const renderer = deps.renderer;
    const topMenu = deps.topMenu;

    const documentPlain = nodeToPlain(objectManager.documentRoot);
    const shapes = objectManager.getShapes().map(shapeToPlain).filter((p) => p !== null);
    const taskHistories = objectManager.taskHistories.map((doc) => nodeToPlain(doc)).filter((p) => p !== null);

    const strokeColorEl = document.getElementById("strokeColor");
    const fillEnabledEl = document.getElementById("fillEnabled");
    const fillColorEl = document.getElementById("fillColor");
    const lineWidthEl = document.getElementById("lineWidth");

    const ui = {
        strokeColor: strokeColorEl?.value ?? "#2f6df6",
        fillEnabled: fillEnabledEl?.checked ?? true,
        fillColor: fillColorEl?.value ?? "#2f6df6",
        lineWidth: lineWidthEl?.value ?? "3",
        toolSelect: topMenu.toolSelectEl?.value ?? null,
    };

    return {
        version: SCHEMA_VERSION,
        document: documentPlain,
        shapes,
        taskHistories,
        selectedId: objectManager.selectedId,
        selectedKind: objectManager.selectedKind,
        insertTargetGroupId: objectManager.insertTargetGroupId,
        currentToolMode: objectManager.currentToolMode,
        viewOffset: { ...renderer.viewOffset },
        viewScale: renderer.viewScale,
        ui,
    };
}

/**
 * 스냅샷을 ObjectManager·Renderer·툴바에 반영한다.
 */
export function applyPreviewSnapshot(snapshot, deps) {
    if (snapshot === null || snapshot === undefined) {
        console.warn("[preview_session_store] applyPreviewSnapshot: snapshot 없음");
        return;
    }

    const objectManager = deps.objectManager;
    const renderer = deps.renderer;
    const topMenu = deps.topMenu;

    const ver = snapshot.version;

    if (ver === SCHEMA_VERSION || ver === SCHEMA_VERSION_V2) {
        const rawDoc = nodeFromPlain(snapshot.document);
        objectManager.documentRoot = ensureDocumentRootTree(rawDoc !== null ? rawDoc : createDocumentRoot());
        objectManager.insertTargetGroupId = snapshot.insertTargetGroupId ?? objectManager.documentRoot.id;
        objectManager.selectedKind = snapshot.selectedKind ?? null;
    } else if (ver === SCHEMA_VERSION_V1) {
        const shapes = (snapshot.shapes ?? []).map(shapeFromPlain).filter((s) => s !== null);
        objectManager.documentRoot = wrapFlatShapesInSessionRoot(shapes);
        objectManager.insertTargetGroupId = objectManager.documentRoot.id;
        objectManager.selectedKind = snapshot.selectedId ? "leaf" : null;
    } else {
        console.warn("[preview_session_store] 알 수 없는 version=%s", ver);
        return;
    }

    const layers = snapshot.taskHistories ?? [];
    if (ver === SCHEMA_VERSION || ver === SCHEMA_VERSION_V2) {
        objectManager.taskHistories = layers
            .map((p) => {
                const n = nodeFromPlain(p);
                return n === null ? null : ensureDocumentRootTree(n);
            })
            .filter((n) => n !== null);
    } else {
        objectManager.taskHistories = layers.map((layer) => {
            const sh = (layer ?? []).map(shapeFromPlain).filter((s) => s !== null);
            return wrapFlatShapesInSessionRoot(sh);
        });
    }

    objectManager.selectedId = snapshot.selectedId ?? null;
    objectManager.draftShape = null;
    objectManager.draftPolygon = null;

    const ox = snapshot.viewOffset;
    if (ox !== null && ox !== undefined && typeof ox.x === "number" && typeof ox.y === "number") {
        renderer.viewOffset = { x: ox.x, y: ox.y };
    }
    const vs = snapshot.viewScale;
    if (typeof vs === "number" && Number.isFinite(vs)) {
        renderer.viewScale = vs;
    }

    const ui = snapshot.ui ?? {};
    const strokeColorEl = document.getElementById("strokeColor");
    const fillEnabledEl = document.getElementById("fillEnabled");
    const fillColorEl = document.getElementById("fillColor");
    const lineWidthEl = document.getElementById("lineWidth");

    if (strokeColorEl !== null && typeof ui.strokeColor === "string") strokeColorEl.value = ui.strokeColor;
    if (fillEnabledEl !== null && typeof ui.fillEnabled === "boolean") fillEnabledEl.checked = ui.fillEnabled;
    if (fillColorEl !== null && typeof ui.fillColor === "string") fillColorEl.value = ui.fillColor;
    if (lineWidthEl !== null && ui.lineWidth !== undefined && ui.lineWidth !== null) lineWidthEl.value = String(ui.lineWidth);

    const tool = typeof snapshot.currentToolMode === "string" ? snapshot.currentToolMode : ui.toolSelect;
    if (typeof tool === "string") {
        topMenu.setTool(tool);
    }
}

/**
 * sessionStorage에서 스냅샷을 읽어 파싱한다. 실패 시 null.
 */
export function loadPreviewSnapshotFromStorage() {
    console.info("[preview_session_store] sessionStorage 읽기 시작");
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const rawLegacyV2 =
            raw === null || raw === "" ? sessionStorage.getItem("mCanvapp.previewSession.v2") : null;
        const rawLegacy =
            (raw === null || raw === "") && (rawLegacyV2 === null || rawLegacyV2 === "")
                ? sessionStorage.getItem("mCanvapp.previewSession.v1")
                : null;
        const useRaw = raw !== null && raw !== "" ? raw : rawLegacyV2 ?? rawLegacy;
        if (useRaw === null || useRaw === undefined || useRaw === "") {
            console.info("[preview_session_store] sessionStorage 비어 있음, 읽기 종료");
            return null;
        }
        const data = JSON.parse(useRaw);
        if (data === null || typeof data !== "object") {
            console.warn("[preview_session_store] 잘못된 JSON");
            return null;
        }
        if (data.version !== SCHEMA_VERSION && data.version !== SCHEMA_VERSION_V2 && data.version !== SCHEMA_VERSION_V1) {
            console.warn("[preview_session_store] 스키마 불일치");
            return null;
        }
        console.info("[preview_session_store] sessionStorage 읽기 완료");
        return data;
    } catch (err) {
        console.error("[preview_session_store] sessionStorage 읽기 실패: %s", err);
        return null;
    }
}

/**
 * 스냅샷을 sessionStorage에 저장한다.
 */
export function savePreviewSnapshotToStorage(snapshot) {
    console.info("[preview_session_store] sessionStorage 쓰기 시작");
    try {
        if (snapshot === null || snapshot === undefined) {
            console.warn("[preview_session_store] snapshot 없어 쓰기 생략");
            return;
        }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        console.info("[preview_session_store] sessionStorage 쓰기 완료");
    } catch (err) {
        console.error("[preview_session_store] sessionStorage 쓰기 실패: %s", err);
    }
}

/**
 * 페이지 이탈 시 스냅샷을 저장하도록 리스너를 등록한다.
 * @param {() => object} getSnapshot — buildPreviewSnapshot에 넘길 deps를 클로저로 캡처한 팩토리
 */
export function bindPreviewSessionUnload(getSnapshot) {
    const flush = () => {
        try {
            const snap = getSnapshot();
            savePreviewSnapshotToStorage(snap);
        } catch (err) {
            console.error("[preview_session_store] 이탈 시 저장 실패: %s", err);
        }
    };

    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
}
