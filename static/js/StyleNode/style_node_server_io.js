// 서버 `/api/style-node/save` · `/api/style-node/load/<id>` 와 통신한다.

import { applyPreviewSnapshot, buildPreviewSnapshot } from "./preview_session_store.js";

/**
 * 현재 스냅샷을 서버에 저장하고 응답의 id를 반환한다.
 * @param {{ objectManager: object, renderer: object, topMenu: object }} deps
 * @returns {Promise<{ id: string }>}
 */
export async function saveStyleNodeDocumentToServer(deps) {
    console.info("[style_node_server_io] POST /api/style-node/save 시작");
    const snapshot = buildPreviewSnapshot(deps);
    try {
        const res = await fetch("/api/style-node/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snapshot),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error("[style_node_server_io] 서버 저장 실패 status=%s body=%s", res.status, data);
            throw new Error(typeof data.error === "string" ? data.error : "저장 실패");
        }
        if (typeof data.id !== "string" || data.id === "") {
            console.error("[style_node_server_io] 응답에 id 없음");
            throw new Error("응답 오류");
        }
        console.info("[style_node_server_io] POST /api/style-node/save 완료 id=%s", data.id);
        return { id: data.id };
    } catch (err) {
        console.error("[style_node_server_io] 서버 저장 중 예외: %s", err);
        throw err;
    }
}

/**
 * 서버에서 문서 JSON을 불러와 편집 상태에 반영한다.
 * @param {string} docId UUID
 * @param {{ objectManager: object, renderer: object, topMenu: object }} deps
 */
export async function loadStyleNodeDocumentFromServer(docId, deps) {
    if (typeof docId !== "string" || docId.trim() === "") {
        console.warn("[style_node_server_io] load: docId 없음");
        throw new Error("문서 ID 필요");
    }
    const id = encodeURIComponent(docId.trim());
    console.info("[style_node_server_io] GET /api/style-node/load/%s 시작", id);
    try {
        const res = await fetch(`/api/style-node/load/${id}`, { method: "GET" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error("[style_node_server_io] 서버 로드 실패 status=%s", res.status);
            throw new Error(typeof data.error === "string" ? data.error : "불러오기 실패");
        }
        applyPreviewSnapshot(data, deps);
        deps.renderer?.requestRender?.();
        console.info("[style_node_server_io] GET /api/style-node/load 완료");
    } catch (err) {
        console.error("[style_node_server_io] 서버 로드 중 예외: %s", err);
        throw err;
    }
}
