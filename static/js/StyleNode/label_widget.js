// 캔버스 전용 라벨 위젯(텍스트). 그룹 로컬 좌표, textBaseline top.

import { Util } from "../util.js";

export const WidgetKind = {
    LABEL: "label",
};

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
 * 라벨 위젯의 그룹 로컬 AABB (textBaseline top 기준 position)
 * @param {LabelWidget} w
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
export function getLabelWidgetBoundingBox(w) {
    if (w === null || w === undefined || w.widgetKind !== WidgetKind.LABEL) {
        return null;
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
     * @param {{ id?: string, name?: string, position: { x: number, y: number }, text?: string, style?: { color?: string, fontSize?: number, fontFamily?: string } }} options
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
    }

    /** @returns {LabelWidget} */
    clone() {
        return new LabelWidget({
            id: this.id,
            name: this.name,
            position: { ...this.position },
            text: this.text,
            style: { ...this.style },
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
        return c;
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
    drawShape(ctx) {
        if (ctx === null || ctx === undefined) {
            return;
        }
        ctx.save();
        ctx.font = `${this.style.fontSize}px ${this.style.fontFamily}`;
        ctx.fillStyle = this.style.color;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText(this.text, this.position.x, this.position.y);
        ctx.restore();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     */
    drawSelectionOutline(ctx) {
        const b = getLabelWidgetBoundingBox(this);
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
    hitTestLocal(point, tolerance) {
        if (point === null || point === undefined) {
            return false;
        }
        const t = typeof tolerance === "number" ? tolerance : 4;
        const b = getLabelWidgetBoundingBox(this);
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
