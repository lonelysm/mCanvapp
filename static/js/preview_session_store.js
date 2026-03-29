// Preview 페이지 편집 상태를 sessionStorage에 두어, 다른 Flask 페이지로 갔다 와도 유지한다.

import { shapeFromPlain, shapeToPlain } from "./shape_snapshot.js";

const STORAGE_KEY = "mCanvapp.previewSession.v1";
const SCHEMA_VERSION = 1;

/**
 * 현재 ObjectManager·Renderer·툴바에서 저장용 스냅샷 객체를 만든다.
 */
export function buildPreviewSnapshot(deps) {
    const objectManager = deps.objectManager;
    const renderer = deps.renderer;
    const topMenu = deps.topMenu;

    const shapes = objectManager.shapes.map(shapeToPlain).filter((p) => p !== null);
    const taskHistories = objectManager.taskHistories.map((layer) => layer.map(shapeToPlain).filter((p) => p !== null));

    const strokeColorEl = document.getElementById("strokeColor");
    const fillEnabledEl = document.getElementById("fillEnabled");
    const fillColorEl = document.getElementById("fillColor");
    const lineWidthEl = document.getElementById("lineWidth");

    const ui = {
        strokeColor: strokeColorEl?.value ?? "#2f6df6",
        fillEnabled: fillEnabledEl?.checked ?? true,
        fillColor: fillColorEl?.value ?? "#2f6df633",
        lineWidth: lineWidthEl?.value ?? "3",
        toolSelect: topMenu.toolSelectEl?.value ?? null,
    };

    return {
        version: SCHEMA_VERSION,
        shapes,
        taskHistories,
        selectedId: objectManager.selectedId,
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

    const shapes = (snapshot.shapes ?? []).map(shapeFromPlain).filter((s) => s !== null);
    objectManager.setShapes(shapes);

    const layers = snapshot.taskHistories ?? [];
    objectManager.taskHistories = layers.map((layer) => layer.map(shapeFromPlain).filter((s) => s !== null));

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
        if (raw === null || raw === undefined || raw === "") {
            console.info("[preview_session_store] sessionStorage 비어 있음, 읽기 종료");
            return null;
        }
        const data = JSON.parse(raw);
        if (data === null || typeof data !== "object" || data.version !== SCHEMA_VERSION) {
            console.warn("[preview_session_store] 스키마 불일치 또는 잘못된 JSON");
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
