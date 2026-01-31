# mCanvapp

## 실행
- **로컬 HTTP 서버로만 실행 가능**합니다. ES 모듈은 `file://`에서 CORS로 차단됩니다.
- 방법 1: `serve.bat` 더블클릭 후 브라우저에서 **http://127.0.0.1:8080** 접속
- 방법 2: 터미널에서 `python -m http.server 8080` 실행 후 **http://localhost:8080** 접속
- 방법 3: VS Code **Live Server** 확장으로 "Open with Live Server"

## 구성
- `const.js`: 공용 상수(전역 `EShapeKind` 등)
- `util.js`: 공용 유틸(전역 `Util`, static 메서드)
- `app.js`: 상태/히트테스트/도형 편집 로직 + 초기화
- `editor_input_controller.js`: 마우스/키보드 입력 처리 클래스(`EditorInputController`)
- `canvas_renderer.js`: 캔버스 렌더링 전용 클래스(`CanvasRenderer`)
- `style.css`: UI 스타일

