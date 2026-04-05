// Canvas 렌더링 전용 클래스
// - devicePixelRatio(고해상도) 스케일 리사이즈
// - 그리드/도형/선택 아웃라인 렌더링
// - HUD 텍스트 업데이트

import { EShapeKind } from "./const.js";
import { Util } from "../util.js";
import { TopMenu } from "./top_menu.js";
import { ObjectManagerClass } from "./object_manager.js";
import {
    NodeType,
    findNodeWithParent,
    getAccumulatedOffsetForNode,
    getAccumulatedOffsetForLeaf,
    getGroupWorldBounds,
    getWidgetParentLocalBounds,
} from "./style_node_tree.js";
import { getShapeBoundingBox } from "./shape_bounds.js";

class CanvasRenderer {
    static #instance = null;

    static getInstance(args) {
        if (CanvasRenderer.#instance === null) {
            CanvasRenderer.#instance = new CanvasRenderer(args ?? {});
        }
        return CanvasRenderer.#instance;
    }

    constructor(args) {
        if (CanvasRenderer.#instance !== null) {
            return CanvasRenderer.#instance;
        }

        this.canvas = Util.getRequiredEl("canvas");
        this.hud = Util.getRequiredEl("hud");
        this.gridStep = typeof args.gridStep === "number" ? Math.max(4, Math.floor(args.gridStep)) : 32;

        const screenCtx = this.canvas.getContext("2d");
        if (screenCtx === null) {
            throw new Error("2D 컨텍스트를 얻지 못했습니다.");
        }
        this.screenCtx = screenCtx;

        this.viewOffset = { x: 0, y: 0 };
        this.viewOffsetAtPanStart = null;
        this.panSensitivity = 0.7;
        this.viewScale = 1;

        CanvasRenderer.#instance = this;
    }

    /** 렌더러가 직접 렌더를 요청하고 후처리까지 실행 */
    requestRender() {
        const objectManager = ObjectManagerClass.getInstance();
        const editorState = objectManager.getRenderState();
        if (editorState === null || editorState === undefined) {
            return;
        }
        this.render(editorState);
        window.dispatchEvent(new Event("canvas:rendered"));
    }

    /** 현재 뷰 스케일(줌) 반환 */
    getViewScale() {
        return this.viewScale;
    }

    /** 뷰 스케일 설정 (MIN/MAX 클램프는 호출부에서 처리) */
    setViewScale(value) {
        const v = Number(value);
        this.viewScale = Number.isFinite(v) ? v : 1;
    }

    /** 현재 뷰 오프셋(팬) 반환. 좌표 변환 시 사용 */
    getViewOffset() {
        return this.viewOffset;
    }

    /** 배경 팬 시작 시 호출. 현재 viewOffset을 기준점으로 저장 */
    startPan() {
        this.viewOffsetAtPanStart = { x: this.viewOffset.x, y: this.viewOffset.y };
    }

    /** 배경 팬 종료 시 호출 */
    endPan() {
        this.viewOffsetAtPanStart = null;
    }

    /** 드래그 델타(월드)와 현재 viewScale로 viewOffset 갱신. 배경 드래그 중 매 프레임 호출 */
    updatePan(deltaWorldX, deltaWorldY) {
        if (this.viewOffsetAtPanStart === null) {
            return;
        }
        const scale = Number(this.viewScale) || 1;
        this.viewOffset.x = this.viewOffsetAtPanStart.x + deltaWorldX * scale * this.panSensitivity;
        this.viewOffset.y = this.viewOffsetAtPanStart.y + deltaWorldY * scale * this.panSensitivity;
    }

    /** 휠/버튼 줌: 화면 좌표 (screenX, screenY)를 고정한 채 scale을 newScale로 바꿀 때 viewOffset 보정 후 viewScale 갱신 */
    zoomAt(screenX, screenY, newScale) {
        const old = Number(this.viewScale) || 1;
        const next = Number(newScale) || 1;
        if (old <= 0 || next <= 0) {
            return;
        }
        const ratio = 1 - next / old;
        this.viewOffset.x += (screenX - this.viewOffset.x) * ratio;
        this.viewOffset.y += (screenY - this.viewOffset.y) * ratio;
        this.viewScale = next;
    }

    /** 캔버스 중심 기준으로 줌 인 처리하고, UI/렌더 동기화까지 수행 */
    zoomIn() {
        this._zoomByFactor(1.1);
    }

    /** 캔버스 중심 기준으로 줌 아웃 처리하고, UI/렌더 동기화까지 수행 */
    zoomOut() {
        this._zoomByFactor(1 / 1.1);
    }

    /** 버튼 줌 공통 로직: 중심점 고정 확대/축소 후 콜백 갱신 */
    _zoomByFactor(scaleFactor) {
        const rect = this.canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const scale = Number(this.getViewScale()) || 1;
        const next = Util.clamp(scale * scaleFactor, 0.2, 4);
        if (next === scale) {
            return;
        }
        this.zoomAt(centerX, centerY, next);
        TopMenu.getInstance().syncZoomValueOut();
        this.requestRender();
    }

    /** 이벤트(화면 좌표)를 월드 좌표로 변환. ObjectManager 등에서 사용 */
    getWorldPointFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scale = Number(this.viewScale) || 1;
        const ox = typeof this.viewOffset.x === "number" ? this.viewOffset.x : 0;
        const oy = typeof this.viewOffset.y === "number" ? this.viewOffset.y : 0;
        return {
            x: (event.clientX - rect.left - ox) / scale,
            y: (event.clientY - rect.top - oy) / scale,
        };
    }

    /** 팬/줌 이벤트 바인드. ObjectManager 다음에 등록해 배경 드래그·휠 줌만 처리 */
    bindPanZoomEvents() {
        this._onPointerDownBound = (e) => this._onPanPointerDown(e);
        this._onPointerMoveBound = (e) => this._onPanPointerMove(e);
        this._onPointerUpBound = (e) => this._onPanPointerUp(e);
        this._onWheelBound = (e) => this._onWheel(e);

        this.canvas.addEventListener("pointerdown", this._onPointerDownBound);
        this.canvas.addEventListener("pointermove", this._onPointerMoveBound);
        this.canvas.addEventListener("pointerup", this._onPointerUpBound);
        this.canvas.addEventListener("wheel", this._onWheelBound, { passive: false });
    }

    unbindPanZoomEvents() {
        this.canvas.removeEventListener("pointerdown", this._onPointerDownBound);
        this.canvas.removeEventListener("pointermove", this._onPointerMoveBound);
        this.canvas.removeEventListener("pointerup", this._onPointerUpBound);
        this.canvas.removeEventListener("wheel", this._onWheelBound);
    }

    _onPanPointerDown(e) {
        const objectManager = ObjectManagerClass.getInstance();
        if (objectManager.getCurrentToolMode() !== EShapeKind.Select) return;
        const worldPoint = this.getWorldPointFromEvent(e);
        if (objectManager.pickShape(worldPoint) !== null) return;

        this.startPan();
        this._panStartWorld = worldPoint;
        this.canvas.setPointerCapture(e.pointerId);
        this._panPointerId = e.pointerId;
        this.requestRender();
    }

    _onPanPointerMove(e) {
        if (this.viewOffsetAtPanStart === null || this._panStartWorld === undefined) return;
        const worldPoint = this.getWorldPointFromEvent(e);
        const deltaX = worldPoint.x - this._panStartWorld.x;
        const deltaY = worldPoint.y - this._panStartWorld.y;
        this.updatePan(deltaX, deltaY);
        this.requestRender();
    }

    _onPanPointerUp(e) {
        this.canvas.releasePointerCapture(e.pointerId);
        this.endPan();
        this._panPointerId = null;
        this._panStartWorld = undefined;
        this.requestRender();
    }

    _onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const MIN_SCALE = 0.1;
        const MAX_SCALE = 5;
        const ZOOM_FACTOR = 1.15;
        const scale = Number(this.viewScale) || 1;
        const newScale = e.deltaY < 0 ? scale * ZOOM_FACTOR : scale / ZOOM_FACTOR;
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        if (clamped === scale) return;
        this.zoomAt(screenX, screenY, clamped);
        TopMenu.getInstance().syncZoomValueOut();
        this.requestRender();
    }

    setGridStep(step) {
        this.gridStep = Math.max(4, Math.floor(step));
    }

    resizeToDisplaySize() {
        const canvasRect = this.canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        const w = Math.max(2, Math.floor(canvasRect.width * devicePixelRatio));
        const h = Math.max(2, Math.floor(canvasRect.height * devicePixelRatio));

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
        return devicePixelRatio;
    }

    // state: documentRoot, displayShapes, draftShape, draftPolygon, draftWidget, selectedId, selectedKind, pointerPos, currentToolMode
    render(editorState) {
        const displayShapes = editorState.displayShapes ?? [];
        const documentRoot = editorState.documentRoot ?? null;
        const devicePixelRatio = this.resizeToDisplaySize();
        const viewScale = Number(this.viewScale) || 1;
        const viewOffset = this.viewOffset;
        const tx = (typeof viewOffset.x === "number" ? viewOffset.x : 0) * devicePixelRatio;
        const ty = (typeof viewOffset.y === "number" ? viewOffset.y : 0) * devicePixelRatio;

        const canvasRectWidth = this.canvas.getBoundingClientRect().width;
        const canvasRectHeight = this.canvas.getBoundingClientRect().height;
        // clear: unscaled css space
        this.screenCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        this.screenCtx.clearRect(0, 0, canvasRectWidth, canvasRectHeight);

        // draw: viewOffset 적용 후 스케일된 월드 공간 (월드 원점이 화면 viewOffset 위치에 그려짐)
        this.screenCtx.setTransform(devicePixelRatio * viewScale, 0, 0, devicePixelRatio * viewScale, tx, ty);
        const worldW = canvasRectWidth / viewScale;
        const worldH = canvasRectHeight / viewScale;
        this._drawGrid(worldW, worldH);

        if (documentRoot !== null) {
            this._drawNode(documentRoot, 0, 0);
        } else {
            for (const shape of displayShapes) {
                this._drawShape(shape);
            }
        }

        if (editorState.draftShape !== null) {
            this._drawShape(editorState.draftShape);
        }
        if (editorState.draftPolygon !== null) {
            this._drawShape(editorState.draftPolygon);
        }
        if (editorState.draftWidget !== null) {
            editorState.draftWidget.drawShape(this.screenCtx);
            editorState.draftWidget.drawSelectionOutline(this.screenCtx);
        }

        const selId = editorState.selectedId ?? null;
        const selKind = editorState.selectedKind ?? null;
        if (selId !== null && documentRoot !== null) {
            if (selKind === "leaf") {
                const selectedShape = displayShapes.find((shape) => shape.id === selId) ?? null;
                if (selectedShape !== null) {
                    const off = getAccumulatedOffsetForLeaf(documentRoot, selId, 0, 0);
                    const worldShape = off !== null ? selectedShape.translate(off.x, off.y) : selectedShape;
                    this._drawSelectionOutline(worldShape);
                }
            } else if (selKind === "widget") {
                const fp = findNodeWithParent(documentRoot, selId);
                if (fp !== null && fp.node.nodeType === NodeType.WIDGET) {
                    const off = getAccumulatedOffsetForNode(documentRoot, selId, 0, 0);
                    const parentLocalBounds = getWidgetParentLocalBounds(fp.parent);
                    if (parentLocalBounds !== null && off !== null) {
                        fp.node.widget.drawSelectionOutline(this.screenCtx, {
                            x: off.x,
                            y: off.y,
                            width: parentLocalBounds.width,
                            height: parentLocalBounds.height,
                        });
                    } else {
                        const w = fp.node.widget;
                        const worldW = off !== null ? w.translate(off.x, off.y) : w;
                        worldW.drawSelectionOutline(this.screenCtx);
                    }
                }
            } else if (selKind === "group") {
                this._drawSelectedGroupOutline(documentRoot, selId, 0, 0);
            }
        } else if (selId !== null) {
            const selectedShape = displayShapes.find((shape) => shape.id === selId) ?? null;
            if (selectedShape !== null) {
                this._drawSelectionOutline(selectedShape);
            }
        }

        this._updateHud(editorState);
    }

    /** 그룹/리프 트리를 누적 translate로 그린다. */
    _drawNode(node, ox, oy, parentNode = null) {
        if (node === null || node === undefined) return;
        if (node.nodeType === NodeType.LEAF) {
            this._drawShape(node.shape);
            if (Array.isArray(node.children) && node.children.length > 0) {
                const bounds = getShapeBoundingBox(node.shape);
                if (bounds !== null) {
                    const childOx = ox + bounds.minX;
                    const childOy = oy + bounds.minY;
                    this.screenCtx.save();
                    this.screenCtx.translate(bounds.minX, bounds.minY);
                    for (const ch of node.children) {
                        this._drawNode(ch, childOx, childOy, node);
                    }
                    this.screenCtx.restore();
                }
            }
            return;
        }
        if (node.nodeType === NodeType.WIDGET) {
            node.widget.drawShape(this.screenCtx, getWidgetParentLocalBounds(parentNode));
            return;
        }
        if (node.nodeType !== NodeType.GROUP) return;
        const gx = ox + node.transform.x;
        const gy = oy + node.transform.y;
        this.screenCtx.save();
        this.screenCtx.translate(node.transform.x, node.transform.y);
        for (const ch of node.children) {
            this._drawNode(ch, gx, gy, node);
        }
        this.screenCtx.restore();
    }

    /** 선택된 그룹의 월드 바운딩 박스만 표시한다. */
    _drawSelectedGroupOutline(root, selectedGroupId, ox, oy) {
        const findBounds = (node, px, py) => {
            if (node === null || node === undefined) return null;
            if (node.nodeType === NodeType.GROUP) {
                const gx = px + node.transform.x;
                const gy = py + node.transform.y;
                if (node.id === selectedGroupId) {
                    return getGroupWorldBounds(node, px, py);
                }
                for (const ch of node.children) {
                    const b = findBounds(ch, gx, gy);
                    if (b !== null) return b;
                }
            } else if (node.nodeType === NodeType.LEAF) {
                if (!Array.isArray(node.children) || node.children.length === 0) {
                    return null;
                }
                const bounds = getShapeBoundingBox(node.shape);
                if (bounds === null) {
                    return null;
                }
                const childPx = px + bounds.minX;
                const childPy = py + bounds.minY;
                for (const ch of node.children) {
                    const b = findBounds(ch, childPx, childPy);
                    if (b !== null) return b;
                }
                return null;
            }
            return null;
        };
        const b = findBounds(root, ox, oy);
        if (b === null) return;
        this.screenCtx.save();
        this.screenCtx.strokeStyle = "rgba(255,255,255,0.85)";
        this.screenCtx.lineWidth = 1.5;
        this.screenCtx.setLineDash([6, 6]);
        this.screenCtx.strokeRect(b.minX - 4, b.minY - 4, b.maxX - b.minX + 8, b.maxY - b.minY + 8);
        this.screenCtx.restore();
    }

    /** 도형 본체 그리기. 각 Shape 클래스의 drawShape(ctx)에 위임 */
    _drawShape(shape) {
        shape.drawShape(this.screenCtx);
    }

    /** 선택 아웃라인 그리기. 각 Shape 클래스의 drawSelectionOutline(ctx)에 위임 */
    _drawSelectionOutline(shape) {
        shape.drawSelectionOutline(this.screenCtx);
    }

    _drawGrid(w, h) {
        this.screenCtx.save();
        this.screenCtx.lineWidth = 1;
        this.screenCtx.strokeStyle = "rgba(255,255,255,0.06)";

        const step = this.gridStep;
        for (let x = 0; x <= w; x += step) {
            this.screenCtx.beginPath();
            this.screenCtx.moveTo(x, 0);
            this.screenCtx.lineTo(x, h);
            this.screenCtx.stroke();
        }
        for (let y = 0; y <= h; y += step) {
            this.screenCtx.beginPath();
            this.screenCtx.moveTo(0, y);
            this.screenCtx.lineTo(w, y);
            this.screenCtx.stroke();
        }
        this.screenCtx.restore();
    }

    _updateHud(inEditorState) {
        if (this.hud === null) {
            return;
        }

        const pointerPosition = inEditorState.pointerPos ?? null;
        const posText = pointerPosition ? `${Math.round(pointerPosition.x)}, ${Math.round(pointerPosition.y)}` : "-";
        const shapeCount = inEditorState.displayShapes?.length ?? 0;
        const widgetCount = inEditorState.displayWidgets?.length ?? 0;
        const countText = `${shapeCount}도형·${widgetCount}위젯`;
        const selText = inEditorState.selectedId ? "선택됨" : "없음";
        const polyText = inEditorState.draftPolygon ? `다각형 점 ${inEditorState.draftPolygon.points.length}개` : "";
        const viewScale = Number(this.viewScale) || 1;
        const zoomText = `${Math.round(viewScale * 100)}%`;
        this.hud.textContent = `도구: ${inEditorState.currentToolMode} | 줌: ${zoomText} | 포인터: ${posText} | 도형: ${countText} | 선택: ${selText} ${polyText}`;
    }
}

export { CanvasRenderer };
