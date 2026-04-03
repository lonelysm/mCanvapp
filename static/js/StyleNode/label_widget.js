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
 * 라벨 위젯의 그룹 로컬 AABB (textBaseline top 기준 position)
 * @param {LabelWidget} w
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
export function getLabelWidgetBoundingBox(w) {
    if (w === null || w === undefined || w.widgetKind !== WidgetKind.LABEL) {
        return null;
    }
    const ctx = getMeasureContext();
    const fs = Math.max(8, w.style.fontSize);
    if (ctx === null) {
        const estW = Math.max(fs, w.text.length * fs * 0.55);
        const estH = fs * 1.25;
        return {
            minX: w.position.x,
            minY: w.position.y,
            maxX: w.position.x + estW,
            maxY: w.position.y + estH,
        };
    }
    ctx.font = `${fs}px ${w.style.fontFamily}`;
    const m = ctx.measureText(w.text);
    const ascent = m.actualBoundingBoxAscent ?? fs * 0.72;
    const descent = m.actualBoundingBoxDescent ?? fs * 0.22;
    return {
        minX: w.position.x,
        minY: w.position.y,
        maxX: w.position.x + m.width,
        maxY: w.position.y + ascent + descent,
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
