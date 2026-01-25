// 공용 유틸 (JS only)
// - 전역 클래스 Util로 노출

class Util {
  static clamp(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(maxValue, value));
  }

  static distance(point1, point2) {
    const deltaX = point1.x - point2.x;
    const deltaY = point1.y - point2.y;
    return Math.hypot(deltaX, deltaY);
  }

  static subtract(point1, point2) {
    return { x: point1.x - point2.x, y: point1.y - point2.y };
  }

  static translatePoint(point, deltaX, deltaY) {
    return { x: point.x + deltaX, y: point.y + deltaY };
  }

  static rectFromPoints(startPoint, endPoint) {
    const x1 = Math.min(startPoint.x, endPoint.x);
    const y1 = Math.min(startPoint.y, endPoint.y);
    const x2 = Math.max(startPoint.x, endPoint.x);
    const y2 = Math.max(startPoint.y, endPoint.y);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  static isPointInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  static distanceToSegment(point, segmentStart, segmentEnd) {
    const segmentDeltaX = segmentEnd.x - segmentStart.x;
    const segmentDeltaY = segmentEnd.y - segmentStart.y;
    const pointDeltaX = point.x - segmentStart.x;
    const pointDeltaY = point.y - segmentStart.y;
    const segmentLengthSquared = segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY;
    const projectionT =
      segmentLengthSquared > 0
        ? Util.clamp((pointDeltaX * segmentDeltaX + pointDeltaY * segmentDeltaY) / segmentLengthSquared, 0, 1)
        : 0;

    const projectedPoint = {
      x: segmentStart.x + segmentDeltaX * projectionT,
      y: segmentStart.y + segmentDeltaY * projectionT,
    };
    return Util.distance(point, projectedPoint);
  }

  static isPointInsidePolygon(point, polygonPoints) {
    // Ray casting
    let inside = false;
    for (
      let pointIndex = 0, prevIndex = polygonPoints.length - 1;
      pointIndex < polygonPoints.length;
      prevIndex = pointIndex++
    ) {
      const currentX = polygonPoints[pointIndex].x;
      const currentY = polygonPoints[pointIndex].y;
      const prevX = polygonPoints[prevIndex].x;
      const prevY = polygonPoints[prevIndex].y;
      const intersect =
        currentY > point.y !== prevY > point.y &&
        point.x < ((prevX - currentX) * (point.y - currentY)) / (prevY - currentY + 0.0000001) + currentX;
      if (intersect) {
        inside = !inside;
      }
    }
    return inside;
  }

  static uid(prefix) {
    const randomPart = Math.random().toString(16).slice(2, 10);
    return `${prefix}_${Date.now()}_${randomPart}`;
  }

  static getRequiredEl(id) {
    const el = document.getElementById(id);
    el ?? console.error(`[init] ${id} 엘리먼트를 찾지 못했습니다.`);
    if (el === null) {
      throw new Error(`${id} 엘리먼트를 찾지 못했습니다.`);
    }
    return el;
  }
}

window.Util = Util;

