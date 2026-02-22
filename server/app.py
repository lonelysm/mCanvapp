# Flask 앱 엔트리: 라우트 및 API 제공. 데이터 파싱/저장은 서버, 캔버스 렌더/뷰는 프론트 JS.

import os
import logging
from flask import Flask, render_template, request, jsonify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 프로젝트 루트 기준으로 templates/static 경로 설정 (server/ 하위에서 실행해도 동작)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = Flask(
    __name__,
    template_folder=os.path.join(ROOT, "templates"),
    static_folder=os.path.join(ROOT, "static"),
)


@app.route("/")
def index():
    """메인 페이지: Jinja2로 초기 HTML·초기 데이터 주입 후 반환."""
    logger.info("GET / 요청 시작")
    try:
        # 초기 데이터는 추후 테이블/UML 뷰 확장 시 여기서 주입
        initial_data = getattr(request, "initial_data", None)
        html = render_template("index.html", initial_data=initial_data)
        logger.info("GET / 요청 완료")
        return html
    except Exception as e:
        logger.exception("GET / 처리 실패: %s", e)
        raise


@app.route("/api/import", methods=["POST"])
def api_import():
    """파일 업로드 수신 → 파싱 → JSON 응답. 파싱은 서버에서만 수행."""
    logger.info("POST /api/import 요청 시작")
    if "file" not in request.files:
        logger.warning("POST /api/import: file 필드 없음")
        return jsonify({"error": "file 필드 없음"}), 400
    f = request.files["file"]
    if not f or f.filename == "":
        logger.warning("POST /api/import: 파일 없음")
        return jsonify({"error": "파일 없음"}), 400
    try:
        # 추후 CSV/JSON 파싱 후 중간 구조(리스트/딕셔너리) 반환
        raw = f.read().decode("utf-8", errors="replace")
        data = {"raw_preview": raw[:500], "filename": f.filename}
        logger.info("POST /api/import 요청 완료 (스켈레톤)")
        return jsonify(data)
    except Exception as e:
        logger.exception("POST /api/import 처리 실패: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/export", methods=["POST"])
def api_export():
    """JS가 보낸 캔버스 상태 수신 → JSON/CSV 등 저장. 형식은 Content-Type 또는 body에 따라 확장."""
    logger.info("POST /api/export 요청 시작")
    payload = request.get_json(silent=True)
    if payload is None:
        logger.warning("POST /api/export: JSON body 없음")
        return jsonify({"error": "JSON body 필요"}), 400
    try:
        # 추후 파일 저장 로직 (JSON/CSV 등)
        logger.info("POST /api/export 요청 완료 (스켈레톤), keys=%s", list(payload.keys()) if isinstance(payload, dict) else "non-dict")
        return jsonify({"ok": True, "received_keys": list(payload.keys()) if isinstance(payload, dict) else []})
    except Exception as e:
        logger.exception("POST /api/export 처리 실패: %s", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
