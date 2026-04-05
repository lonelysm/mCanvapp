// 캔버스 전용 라벨 위젯(텍스트). 그룹 로컬 좌표, textBaseline top.

import { Util } from "../util.js";

export const WidgetKind = {
    LABEL: "label",
};

export const LabelLayoutMode = {
    FREE: "free",
    PARENT_BOUNDS: "parentBounds",
};

export const DEFAULT_LABEL_OFFSET = Object.freeze({ x: 0, y: 0 });
export const DEFAULT_LABEL_PADDING = Object.freeze({ top: 2, right: 2, bottom: 2, left: 2 });

let _measureCtx = null;

function getMeasureContext() {
    if (_measureCtx === null) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
            return null;
        }
        _measureCtx = ctx;
    }
    return _measureCtx;
}

/**
 * 라벨 텍스트를 특정 폰트 크기로 측정한다.
 * @param {string} text
 * @param {number} fontSize
 * @param {string} fontFamily
 * @returns {{ width: number, height: number }}
 */
function measureLabelTextSize(text, fontSize, fontFamily) {
    const safeText = String(text ?? "");
    const safeFontSize = Math.max(1, Number(fontSize) || 1);
    const safeFontFamily = typeof fontFamily === "string" && fontFamily.trim() !== "" ? fontFamily : "system-ui, sans-serif";
    const ctx = getMeasureContext();
    if (ctx === null) {
        return {
            width: Math.max(safeFontSize, safeText.length * safeFontSize * 0.55),
            height: safeFontSize * 1.25,
        };
    }
    ctx.font = `${safeFontSize}px ${safeFontFamily}`;
    const metrics = ctx.measureText(safeText);
    const ascent = metrics.actualBoundingBoxAscent ?? safeFontSize * 0.72;
    const descent = metrics.actualBoundingBoxDescent ?? safeFontSize * 0.22;
    return {
        width: Math.max(metrics.width, safeFontSize * 0.5),
        height: ascent + descent,
    };
}

/**
 * 라벨 패딩 값을 정규화한다.
 * @param {{ top?: number, right?: number, bottom?: number, left?: number } | null | undefined} padding
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
function normalizeLabelPadding(padding) {
    return {
        top: Number.isFinite(padding?.top) ? Number(padding.top) : DEFAULT_LABEL_PADDING.top,
        right: Number.isFinite(padding?.right) ? Number(padding.right) : DEFAULT_LABEL_PADDING.right,
        bottom: Number.isFinite(padding?.bottom) ? Number(padding.bottom) : DEFAULT_LABEL_PADDING.bottom,
        left: Number.isFinite(padding?.left) ? Number(padding.left) : DEFAULT_LABEL_PADDING.left,
    };
}

/**
 * 부모 기준 자동 레이아웃용 박스를 계산한다.
 * @param {{ x: number, y: number, width: number, height: number } | null | undefined} parentLocalBounds
 * @param {{ x: number, y: number }} offset
 * @param {{ top: number, right: number, bottom: number, left: number }} padding
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
function getPaddedParentLabelBox(parentLocalBounds, offset, padding) {
    if (parentLocalBounds === null || parentLocalBounds === undefined) {
        return null;
    }
    const safeWidth = Math.max(1, Number(parentLocalBounds.width) || 1);
    const safeHeight = Math.max(1, Number(parentLocalBounds.height) || 1);
    const boxX = (Number(parentLocalBounds.x) || 0) + (Number(offset?.x) || 0) + padding.left;
    const boxY = (Number(parentLocalBounds.y) || 0) + (Number(offset?.y) || 0) + padding.top;
    const boxWidth = Math.max(1, safeWidth - padding.left - padding.right);
    const boxHeight = Math.max(1, safeHeight - padding.top - padding.bottom);
    return {
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
    };
}

/**
 * 부모 사각형 기준일 때 라벨의 실제 배치 정보를 계산한다.
 * @param {LabelWidget} widget
 * @param {{ x: number, y: number, width: number, height: number } | null | undefined} parentLocalBounds
 * @returns {{ x: number, y: number, width: number, height: number, fontSize: number, usesParentBounds: boolean }}
 */
export function resolveLabelWidgetLayout(widget, parentLocalBounds) {
    const fallbackFontSize = Math.max(6, Number(widget?.style?.fontSize) || 14);
    const fallbackBounds = getLabelWidgetBoundingBox(widget, null, true);
    if (widget === null || widget === undefined) {
        return {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            fontSize: fallbackFontSize,
            usesParentBounds: false,
        };
    }
    if (widget.layoutMode !== LabelLayoutMode.PARENT_BOUNDS || parentLocalBounds === null || parentLocalBounds === undefined) {
        return {
            x: widget.position.x,
            y: widget.position.y,
            width: Math.max(1, (fallbackBounds?.maxX ?? widget.position.x + 1) - (fallbackBounds?.minX ?? widget.position.x)),
            height: Math.max(1, (fallbackBounds?.maxY ?? widget.position.y + 1) - (fallbackBounds?.minY ?? widget.position.y)),
            fontSize: fallbackFontSize,
            usesParentBounds: false,
        };
    }

    const padding = normalizeLabelPadding(widget.padding);
    const box = getPaddedParentLabelBox(parentLocalBounds, widget.offset ?? DEFAULT_LABEL_OFFSET, padding);
    if (box === null) {
        return {
            x: widget.position.x,
            y: widget.position.y,
            width: 1,
            height: 1,
            fontSize: fallbackFontSize,
            usesParentBounds: false,
        };
    }

    const baseMeasure = measureLabelTextSize(widget.text, 100, widget.style.fontFamily);
    const widthPerFont = Math.max(baseMeasure.width / 100, 0.01);
    const heightPerFont = Math.max(baseMeasure.height / 100, 0.01);
    const fontSize = Util.clamp(Math.min(box.width / widthPerFont, box.height / heightPerFont), 6, 200);

    return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        fontSize,
        usesParentBounds: true,
    };
}

/**
 * 라벨 위젯의 그룹 로컬 AABB (textBaseline top 기준 position)
 * @param {LabelWidget} w
 * @param {{ x: number, y: number, width: number, height: number } | null} [parentLocalBounds]
 * @param {boolean} [skipParentBounds]
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
export function getLabelWidgetBoundingBox(w, parentLocalBounds = null, skipParentBounds = false) {
    if (w === null || w === undefined || w.widgetKind !== WidgetKind.LABEL) {
        return null;
    }
    if (skipParentBounds !== true) {
        const resolved = resolveLabelWidgetLayout(w, parentLocalBounds);
        if (resolved.usesParentBounds) {
            return {
                minX: resolved.x,
                minY: resolved.y,
                maxX: resolved.x + resolved.width,
                maxY: resolved.y + resolved.height,
            };
        }
    }
    const fs = Math.max(8, w.style.fontSize);
    const size = measureLabelTextSize(w.text, fs, w.style.fontFamily);
    return {
        minX: w.position.x,
        minY: w.position.y,
        maxX: w.position.x + size.width,
        maxY: w.position.y + size.height,
    };
}

/**
 * 라벨 위젯. position은 텍스트 박스 좌상단(그룹 로컬).
 */
export class LabelWidget {
    /**
     * @param {{ id?: string, name?: string, position: { x: number, y: number }, text?: string, style?: { color?: string, fontSize?: number, fontFamily?: string }, layoutMode?: string, offset?: { x?: number, y?: number }, padding?: { top?: number, right?: number, bottom?: number, left?: number } }} options
     */
    constructor(options) {
        const o = options ?? {};
        this.widgetKind = WidgetKind.LABEL;
        this.id = o.id ?? Util.uid("lbl");
        this.name = typeof o.name === "string" && o.name.trim() !== "" ? o.name.trim() : (typeof o.text === "string" && o.text.trim() !== "" ? o.text.trim() : "라벨");
        this.position = {
            x: typeof o.position?.x === "number" ? o.position.x : 0,
            y: typeof o.position?.y === "number" ? o.position.y : 0,
        };
        this.text = typeof o.text === "string" ? o.text : "라벨";
        this.style = {
            color: typeof o.style?.color === "string" ? o.style.color : "#e6edf3",
            fontSize: typeof o.style?.fontSize === "number" ? Util.clamp(o.style.fontSize, 6, 200) : 14,
            fontFamily: typeof o.style?.fontFamily === "string" ? o.style.fontFamily : "system-ui, sans-serif",
        };
        this.layoutMode = o.layoutMode === LabelLayoutMode.PARENT_BOUNDS ? LabelLayoutMode.PARENT_BOUNDS : LabelLayoutMode.FREE;
        this.offset = {
            x: Number.isFinite(o.offset?.x) ? Number(o.offset.x) : DEFAULT_LABEL_OFFSET.x,
            y: Number.isFinite(o.offset?.y) ? Number(o.offset.y) : DEFAULT_LABEL_OFFSET.y,
        };
        this.padding = normalizeLabelPadding(o.padding);
    }

    /** @returns {LabelWidget} */
    clone() {
        return new LabelWidget({
            id: this.id,
            name: this.name,
            position: { ...this.position },
            text: this.text,
            style: { ...this.style },
            layoutMode: this.layoutMode,
            offset: { ...this.offset },
            padding: { ...this.padding },
        });
    }

    /**
     * @param {number} dx
     * @param {number} dy
     * @returns {LabelWidget}
     */
    translate(dx, dy) {
        const c = this.clone();
        c.position.x += dx;
        c.position.y += dy;
        if (c.layoutMode === LabelLayoutMode.PARENT_BOUNDS) {
            c.offset.x += dx;
            c.offset.y += dy;
        }
        return c;
    }

    /**
     * 부모 사각형 기준 레이아웃을 현재 위젯 값에 반영해 fallback 좌표도 동기화한다.
     * @param {{ x: number, y: number, width: number, height: number } | null | undefined} parentLocalBounds
     */
    syncResolvedLayoutFromParent(parentLocalBounds) {
        const resolved = resolveLabelWidgetLayout(this, parentLocalBounds);
        this.position.x = resolved.x;
        this.position.y = resolved.y;
        this.style.fontSize = resolved.fontSize;
    }

    /**
     * 드래그한 사각 영역에 맞춰 라벨 위치와 폰트 크기를 갱신한다.
     * @param {{ x: number, y: number }} anchorPoint
     * @param {{ x: number, y: number }} currentPoint
     */
    updateDraftLayout(anchorPoint, currentPoint) {
        if (anchorPoint === null || anchorPoint === undefined || currentPoint === null || currentPoint === undefined) {
            return;
        }
        const minX = Math.min(anchorPoint.x, currentPoint.x);
        const minY = Math.min(anchorPoint.y, currentPoint.y);
        const dragWidth = Math.max(Math.abs(currentPoint.x - anchorPoint.x), 12);
        const dragHeight = Math.max(Math.abs(currentPoint.y - anchorPoint.y), 12);
        const baseMeasure = measureLabelTextSize(this.text, 100, this.style.fontFamily);
        const widthPerFont = Math.max(baseMeasure.width / 100, 0.01);
        const heightPerFont = Math.max(baseMeasure.height / 100, 0.01);
        const fontSizeFromWidth = dragWidth / widthPerFont;
        const fontSizeFromHeight = dragHeight / heightPerFont;
        this.position.x = minX;
        this.position.y = minY;
        this.style.fontSize = Util.clamp(Math.min(fontSizeFromWidth, fontSizeFromHeight), 6, 200);
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     */
    drawShape(ctx, parentLocalBounds = null) {
        if (ctx === null || ctx === undefined) {
            return;
        }
        const resolved = resolveLabelWidgetLayout(this, parentLocalBounds);
        ctx.save();
        if (resolved.usesParentBounds) {
            ctx.beginPath();
            ctx.rect(resolved.x, resolved.y, resolved.width, resolved.height);
            ctx.clip();
        }
        ctx.font = `${resolved.fontSize}px ${this.style.fontFamily}`;
        ctx.fillStyle = this.style.color;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText(this.text, resolved.x, resolved.y);
        ctx.restore();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     */
    drawSelectionOutline(ctx, parentLocalBounds = null) {
        const b = getLabelWidgetBoundingBox(this, parentLocalBounds);
        if (b === null || ctx === null) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = "rgba(47,109,246,0.9)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(b.minX - 2, b.minY - 2, b.maxX - b.minX + 4, b.maxY - b.minY + 4);
        ctx.restore();
    }

    /**
     * 그룹 로컬 좌표에서 히트 테스트
     * @param {{ x: number, y: number }} point
     * @param {number} [tolerance]
     */
    hitTestLocal(point, tolerance, parentLocalBounds = null) {
        if (point === null || point === undefined) {
            return false;
        }
        const t = typeof tolerance === "number" ? tolerance : 4;
        const b = getLabelWidgetBoundingBox(this, parentLocalBounds);
        if (b === null) {
            return false;
        }
        return (
            point.x >= b.minX - t &&
            point.x <= b.maxX + t &&
            point.y >= b.minY - t &&
            point.y <= b.maxY + t
        );
    }
}
