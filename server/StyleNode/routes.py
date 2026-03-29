# Create Style Node 페이지 라우트·JSON 저장/로드 API

import json
import logging
import os
import re
import uuid

from flask import Blueprint, jsonify, redirect, render_template, request, url_for

logger = logging.getLogger(__name__)

_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_ROOT = os.path.dirname(_SERVER_DIR)
STYLE_NODE_DATA_DIR = os.path.join(_PROJECT_ROOT, "data", "StyleNode")

# 문서 id는 표준 UUID 문자열만 허용 (경로 조작 방지)
_SAFE_DOC_ID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

style_node_bp = Blueprint("style_node", __name__)


@style_node_bp.route("/create-style-node")
def create_style_node():
    """Create Style Node: 캔버스·툴바 페이지."""
    logger.info("GET /create-style-node 요청 시작")
    try:
        initial_data = getattr(request, "initial_data", None)
        html = render_template(
            "preview.html",
            active_nav="create_style_node",
            initial_data=initial_data,
        )
        logger.info("GET /create-style-node 요청 완료")
        return html
    except Exception as e:
        logger.exception("GET /create-style-node 처리 실패: %s", e)
        raise


@style_node_bp.route("/preview")
def preview_style_nodes_redirect():
    """구 경로 /preview → /create-style-node (호환용 리다이렉트)."""
    logger.info("GET /preview 리다이렉트 → /create-style-node 시작")
    resp = redirect(url_for("style_node.create_style_node"), code=301)
    logger.info("GET /preview 리다이렉트 → /create-style-node 완료")
    return resp


@style_node_bp.route("/api/style-node/save", methods=["POST"])
def api_style_node_save():
    """클라이언트가 보낸 StyleNode 문서 JSON을 서버에 저장하고 id를 반환한다."""
    logger.info("POST /api/style-node/save 요청 시작")
    payload = request.get_json(silent=True)
    if payload is None:
        logger.warning("POST /api/style-node/save: JSON body 없음")
        return jsonify({"error": "JSON body 필요"}), 400
    doc_id = str(uuid.uuid4())
    path = os.path.join(STYLE_NODE_DATA_DIR, f"{doc_id}.json")
    try:
        os.makedirs(STYLE_NODE_DATA_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, indent=2)
        logger.info("POST /api/style-node/save 요청 완료 id=%s", doc_id)
        return jsonify({"id": doc_id})
    except OSError as e:
        logger.exception("POST /api/style-node/save 저장 실패: %s", e)
        return jsonify({"error": "저장 실패"}), 500


@style_node_bp.route("/api/style-node/load/<doc_id>", methods=["GET"])
def api_style_node_load(doc_id):
    """저장된 StyleNode 문서 JSON을 id로 불러온다."""
    logger.info("GET /api/style-node/load/%s 요청 시작", doc_id)
    if doc_id is None or not _SAFE_DOC_ID_RE.match(doc_id):
        logger.warning("GET /api/style-node/load: 잘못된 id")
        return jsonify({"error": "잘못된 id"}), 400
    path = os.path.join(STYLE_NODE_DATA_DIR, f"{doc_id}.json")
    if not os.path.isfile(path):
        logger.warning("GET /api/style-node/load: 파일 없음 id=%s", doc_id)
        return jsonify({"error": "문서 없음"}), 404
    try:
        with open(path, encoding="utf-8") as fp:
            data = json.load(fp)
        logger.info("GET /api/style-node/load 요청 완료 id=%s", doc_id)
        return jsonify(data)
    except (OSError, json.JSONDecodeError) as e:
        logger.exception("GET /api/style-node/load 읽기 실패: %s", e)
        return jsonify({"error": "읽기 실패"}), 500
