// AR 각도기 앱
(function () {
    // 전역 에러 핸들러 (디버그용)
    window.onerror = function (msg, url, line, col, error) {
        // writeToDebugLog 함수가 정의되기 전일 수 있으므로 안전하게 처리
        const message = `Error: ${msg}\nLine: ${line}:${col}`;
        console.error(message);

        // DOM이 로드된 후 로그창이 있으면 출력
        setTimeout(() => {
            if (window.writeToDebugLog) {
                window.writeToDebugLog(message, 'error');
            } else {
                // writeToDebugLog가 없으면 ESP32 모달 열어서 보여주도록 시도
                if (window.openESP32Modal) window.openESP32Modal();
                const debugLog = document.getElementById('debug-log');
                if (debugLog) {
                    debugLog.innerHTML += `<div class="log-entry log-error">${message}</div>`;
                    const consoleDiv = document.getElementById('debug-console');
                    if (consoleDiv) consoleDiv.style.display = 'block';
                }
            }
        }, 1000);
        return false;
    };

    'use strict';

    // DOM 요소
    const video = document.getElementById('camera');
    const overlay = document.getElementById('overlay');
    const angleValue = document.getElementById('angle-value');
    const switchCameraBtn = document.getElementById('switch-camera');
    const tickMarks = document.getElementById('tick-marks');

    const line1 = document.getElementById('line1');
    const handle1 = document.getElementById('handle1');
    const line1Group = document.getElementById('line1-group');

    const line2 = document.getElementById('line2');
    const handle2 = document.getElementById('handle2');
    const line2Group = document.getElementById('line2-group');

    // 연장선 요소
    const line1Ext = document.getElementById('line1-ext');
    const line2Ext = document.getElementById('line2-ext');
    const EXTENSION_LENGTH = 100; // 연장선 길이

    // 측정 모드 관련 요소
    const switchModeBtn = document.getElementById('switch-mode');
    const modeLabel = document.getElementById('mode-label');
    const angleInputPanel = document.getElementById('angle-input-panel');
    const angleInput = document.getElementById('angle-input');
    const resetCenterBtn = document.getElementById('reset-center');

    // 도움말 모달 관련
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelpBtn = document.getElementById('close-help');

    // 수평 기준선 요소 (좌우 기울기)
    const gravityLineGroup = document.getElementById('gravity-line-group');
    const gravityLine = document.getElementById('gravity-line');
    const gravityIndicatorLeft = document.getElementById('gravity-indicator-left');
    const gravityIndicatorRight = document.getElementById('gravity-indicator-right');

    // 수직 기준선 요소 (앞뒤 기울기)
    const tiltLineGroup = document.getElementById('tilt-line-group');
    const tiltLine = document.getElementById('tilt-line');
    const tiltIndicatorTop = document.getElementById('tilt-indicator-top');
    const tiltIndicatorBottom = document.getElementById('tilt-indicator-bottom');
    const toggleTiltLineBtn = document.getElementById('toggle-tilt-line');

    let tiltLineVisible = true;  // 기울기선 표시 상태

    // 각도기 눈금 요소
    const protractorGroup = document.getElementById('protractor-group');
    const toggleProtractorBtn = document.getElementById('toggle-protractor');
    let protractorVisible = true; // 각도기 눈금 표시 상태

    // 수직선 토글 버튼
    const toggleVerticalLineBtn = document.getElementById('toggle-vertical-line');
    let verticalLineVisible = false; // 수직선 표시 상태 (초기값: 꿄)

    // 카메라 줌 버튼
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const ZOOM_STEP = 0.5; // 버튼 클릭당 줌 변화량

    // 상태
    let facingMode = 'environment'; // 후면 카메라 기본
    let currentStream = null;
    let isDragging = false;
    let activeHandle = null;

    // 중심점 (각도기 중심)
    // 중심점 (각도기 중심) - 이동 가능하도록 변수로 변경
    let currentCenter = { x: 50, y: 95 };
    const LINE_LENGTH = 30; // 기준선 기본 길이 (축소)
    const MIN_HANDLE_DISTANCE = 15; // 핸들 최소 거리
    const MAX_HANDLE_DISTANCE = 80; // 핸들 최대 거리

    // 현재 각도 (degree)
    let angle1 = 90;  // 수직선 (위쪽)
    let angle2 = 70;  // 오른쪽 위 (차이 20도)

    // 핸들 거리 (중심점으로부터의 거리)
    let handleDistance1 = LINE_LENGTH;
    let handleDistance2 = LINE_LENGTH;

    // 수평 기준선 각도 (좌우 기울기)
    let gravityAngle = 0;

    // 수직 기준선 각도 (앞뒤 기울기)
    let tiltAngle = 0;

    // 화면 방향 모드 ('landscape' = 가로, 'portrait' = 세로)
    let orientationMode = 'portrait'; // 초기값을 세로로 설정하여 init에서 가로로 전환되게 함
    const switchOrientationBtn = document.getElementById('switch-orientation');
    const orientationIcon = document.getElementById('orientation-icon');
    const orientationLabel = document.getElementById('orientation-label');

    // 수평 OK 표시
    const levelOk = document.getElementById('level-ok');
    const tiltOk = document.getElementById('tilt-ok');
    const LEVEL_THRESHOLD = 1.0; // 수평 판정 임계값 (±1.0도)

    // 측정 모드 ('normal' = 일반 모드, 'angle-lock' = 각도 설정 모드)
    let measurementMode = 'normal';
    let lockedAngle = 0; // 각도 설정 모드에서 두 선 사이의 각도 (초기값 0도)

    // 카메라 줌 관련 상태
    let currentZoom = 1;
    let minZoom = 1;
    let maxZoom = 1;
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let isApplyingZoom = false; // 줌 적용 중 플래그 (스로틀링용)

    // ESP32 서보 모터 제어 관련
    const ESP32_IP = '192.168.4.1'; // ESP32 AP 모드 기본 IP
    const ESP32_PORT = 80;
    let esp32Connected = false;
    let esp32SendTimeout = null;
    const ESP32_SEND_DEBOUNCE = 50; // 각도 전송 디바운스 시간 (ms)

    // BLE (블루투스) 관련
    const BLE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
    const BLE_ANGLE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
    const BLE_STATUS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';
    let bleDevice = null;
    let bleServer = null;
    let bleAngleCharacteristic = null;
    let bleConnected = false;
    let connectionMode = 'none'; // 'none', 'wifi', 'wifi-blind', 'ble', 'native'
    let isNativeApp = false;

    // ESP32 DOM 요소
    const esp32ConnectBtn = document.getElementById('esp32-connect');
    const esp32StatusDot = document.getElementById('esp32-status-dot');
    const esp32Modal = document.getElementById('esp32-modal');
    const esp32ConnectionStatus = document.getElementById('esp32-connection-status');
    const esp32TestBtn = document.getElementById('esp32-test-btn');
    const esp32DisconnectBtn = document.getElementById('esp32-disconnect-btn');
    const esp32Message = document.getElementById('esp32-message');

    // 초기화
    init();

    function init() {
        createTickMarks();
        updateLines();
        updateGravityLine();
        updateTiltLine();
        setupEventListeners();
        setupDeviceOrientation();
        requestCameraAccess();

        // 초기화 완료 표시
        const statusDiv = document.getElementById('js-status');
        if (statusDiv) {
            statusDiv.textContent = 'App Ready (Touch OK)';
            statusDiv.style.color = 'green';
            setTimeout(() => statusDiv.style.display = 'none', 3000);
        }
        if (window.writeToDebugLog) { // Ensure writeToDebugLog is defined
            writeToDebugLog('앱 초기화 완료', 'success');
        }

        // 가로 모드 전용 (세로 모드 비활성화)
        orientationMode = 'landscape';
        overlay.setAttribute('viewBox', '0 0 100 100');
        currentCenter.x = 50;
        currentCenter.y = 95;
        const protractorGroup = document.getElementById('protractor-group');
        protractorGroup.setAttribute('transform', `translate(${currentCenter.x}, ${currentCenter.y})`);

        // 화면 방향 가로로 잠금 (회전 방지)
        lockScreenOrientation('landscape');
        // 일반 모드로 시작 (핸들 드래그 가능, 단 핸들1은 고정)
        handle1.style.display = 'none';

        // 수직선 초기 상태: 꺼짐
        line1Group.style.display = 'none';
        if (toggleVerticalLineBtn) toggleVerticalLineBtn.classList.add('off');

        // iOS Native App 감지
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nativeHandler) {
            isNativeApp = true;
            connectionMode = 'native'; // 기본적으로 native 모드로 시작
            console.log('iOS Native App Environment Detected');
            writeToDebugLog('iOS Native App 감지됨', 'success');

            // Native UI 업데이트
            updateESP32Status('connected');
            showESP32Message('iOS Native App 모드 (Bridge 연결됨)', 'info');
        }

        // HTTP 환경에서 ESP32 자동 연결 시도 (Native가 아닐 때만)
        if (!isNativeApp && window.location.protocol === 'http:') {
            setTimeout(() => {
                autoConnectESP32();
            }, 2000); // 2초 후 자동 연결 시도
        }

        // 키보드 단축키가 바로 작동하도록 포커스 설정
        document.body.focus();
    }

    // 눈금 생성
    function createTickMarks() {
        const radius = 18.75;  // 축소 (기존 37.5의 절반)
        const innerRadius = 17.5;  // 축소 (기존 35의 절반)

        // 통일된 색상 (흰색 반투명)
        const tickColor = 'rgba(255, 255, 255, 0.8)';

        for (let deg = 0; deg <= 180; deg += 10) {
            const rad = (deg * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            // 긴 눈금 (10도 단위)
            const outerX = -cos * radius;
            const outerY = -sin * radius;
            const innerX = -cos * innerRadius;
            const innerY = -sin * innerRadius;

            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', outerX);
            tick.setAttribute('y1', outerY);
            tick.setAttribute('x2', innerX);
            tick.setAttribute('y2', innerY);
            tick.setAttribute('stroke', tickColor);
            tick.setAttribute('stroke-width', '0.3');
            tickMarks.appendChild(tick);

            // 숫자 라벨 (90도가 0, 양쪽 끝이 90)
            if (deg % 10 === 0) {
                const labelRadius = 16.5;  // 축소 (기존 33의 절반)
                const labelX = -cos * labelRadius;
                const labelY = -sin * labelRadius;

                // 표시 값 변환: 90도->0, 0도->90, 180도->90
                const displayValue = Math.abs(90 - deg);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', labelX);
                text.setAttribute('y', labelY);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('font-size', '1.1');  // 축소
                text.setAttribute('font-weight', '500');
                text.setAttribute('fill', tickColor);
                text.textContent = displayValue;
                tickMarks.appendChild(text);
            }

            // 작은 눈금 (5도 단위)
            if (deg < 180) {
                const smallDeg = deg + 5;
                const smallRad = (smallDeg * Math.PI) / 180;
                const smallCos = Math.cos(smallRad);
                const smallSin = Math.sin(smallRad);

                const smallOuterX = -smallCos * radius;
                const smallOuterY = -smallSin * radius;
                const smallInnerX = -smallCos * (innerRadius + 1);
                const smallInnerY = -smallSin * (innerRadius + 1);

                const smallTick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                smallTick.setAttribute('x1', smallOuterX);
                smallTick.setAttribute('y1', smallOuterY);
                smallTick.setAttribute('x2', smallInnerX);
                smallTick.setAttribute('y2', smallInnerY);
                smallTick.setAttribute('stroke', tickColor);
                smallTick.setAttribute('stroke-width', '0.2');
                tickMarks.appendChild(smallTick);
            }
        }
    }

    // 라인 업데이트
    function updateLines() {
        // 각도를 라디안으로 변환 (0도가 오른쪽, 반시계 방향)
        const rad1 = (angle1 * Math.PI) / 180;
        const rad2 = (angle2 * Math.PI) / 180;

        // 끝점 좌표 계산 (핸들 위치 - 동적 거리 사용)
        const end1X = currentCenter.x - Math.cos(rad1) * handleDistance1;
        const end1Y = currentCenter.y - Math.sin(rad1) * handleDistance1;
        const end2X = currentCenter.x - Math.cos(rad2) * handleDistance2;
        const end2Y = currentCenter.y - Math.sin(rad2) * handleDistance2;

        // 연장선 끝점 계산 (핸들 이후로 EXTENSION_LENGTH만큼 연장)
        const ext1X = currentCenter.x - Math.cos(rad1) * (handleDistance1 + EXTENSION_LENGTH);
        const ext1Y = currentCenter.y - Math.sin(rad1) * (handleDistance1 + EXTENSION_LENGTH);
        const ext2X = currentCenter.x - Math.cos(rad2) * (handleDistance2 + EXTENSION_LENGTH);
        const ext2Y = currentCenter.y - Math.sin(rad2) * (handleDistance2 + EXTENSION_LENGTH);

        // 라인 업데이트
        line1.setAttribute('x1', currentCenter.x);
        line1.setAttribute('y1', currentCenter.y);
        line1.setAttribute('x2', end1X);
        line1.setAttribute('y2', end1Y);
        handle1.setAttribute('cx', end1X);
        handle1.setAttribute('cy', end1Y);

        // 연장선 1 업데이트
        line1Ext.setAttribute('x1', end1X);
        line1Ext.setAttribute('y1', end1Y);
        line1Ext.setAttribute('x2', ext1X);
        line1Ext.setAttribute('y2', ext1Y);

        line2.setAttribute('x1', currentCenter.x);
        line2.setAttribute('y1', currentCenter.y);
        line2.setAttribute('x2', end2X);
        line2.setAttribute('y2', end2Y);
        handle2.setAttribute('cx', end2X);
        handle2.setAttribute('cy', end2Y);

        // 연장선 2 업데이트
        line2Ext.setAttribute('x1', end2X);
        line2Ext.setAttribute('y1', end2Y);
        line2Ext.setAttribute('x2', ext2X);
        line2Ext.setAttribute('y2', ext2Y);

        // 각도 차이 계산
        let angleDiff = Math.abs(angle1 - angle2);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;

        angleValue.textContent = Math.round(angleDiff);
    }

    // 이벤트 설정
    function setupEventListeners() {
        // 카메라 전환
        switchCameraBtn.addEventListener('click', switchCamera);

        // 기울기선 토글
        toggleTiltLineBtn.addEventListener('click', toggleTiltLine);

        // 각도기 눈금 토글
        toggleProtractorBtn.addEventListener('click', toggleProtractor);

        // 수직선 토글
        if (toggleVerticalLineBtn) {
            toggleVerticalLineBtn.addEventListener('click', toggleVerticalLine);
        }

        // 카메라 줌 버튼
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', zoomIn);
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', zoomOut);
        }

        // 가로/세로 모드 전환 버튼 제거됨 (가로 모드 전용)

        // 측정 모드 전환
        switchModeBtn.addEventListener('click', toggleMeasurementMode);

        // 중심점 리셋
        resetCenterBtn.addEventListener('click', () => {
            resetCenter();
        });

        // 도움말 모달 이벤트: HTML 인라인 onclick 사용으로 변경 (아이패드 호환성)
        // 기존 addEventListener 코드 제거됨

        // 각도 입력 변경
        angleInput.addEventListener('input', onAngleInputChange);
        angleInput.addEventListener('keydown', onAngleInputKeyDown);

        // 마우스 이벤트 (데스크탑)
        overlay.addEventListener('mousedown', onPointerDown);
        overlay.addEventListener('mousemove', onPointerMove);
        overlay.addEventListener('mouseup', onPointerUp);
        overlay.addEventListener('mouseleave', onPointerUp);

        // 터치 이벤트 (모바일/태블릿)
        overlay.addEventListener('touchstart', onTouchStart, { passive: false });
        overlay.addEventListener('touchmove', onTouchMove, { passive: false });
        overlay.addEventListener('touchend', onTouchEnd);
        overlay.addEventListener('touchcancel', onTouchEnd);

        // 핸들에 직접 터치 이벤트 바인딩 (iOS Safari 호환성)
        [handle1, handle2].forEach((handle, idx) => {
            handle.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startDrag(idx + 1);
            }, { passive: false });
        });

        // document 레벨 터치 이벤트 (드래그 중 화면 밖으로 나가도 동작)
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);

        // 키보드 이벤트
        document.addEventListener('keydown', onKeyDown);
    }

    // 키보드 이벤트 핸들러
    function onKeyDown(e) {
        // 입력 필드에 포커스가 있으면 키보드 단축키 무시
        if (document.activeElement === angleInput) {
            return;
        }

        switch (e.key) {
            // Esc: 모달 닫기
            case 'Escape':
                if (!helpModal.classList.contains('hidden')) {
                    closeHelpModal();
                    e.preventDefault();
                }
                break;

            // M 또는 m: 측정 모드 전환
            case 'M':
            case 'm':
                toggleMeasurementMode();
                e.preventDefault();
                break;

            // Enter: 각도설정 모드에서 입력 필드로 포커스 이동
            case 'Enter':
                if (measurementMode === 'angle-lock') {
                    angleInput.focus();
                    angleInput.select(); // 전체 선택
                    e.preventDefault();
                }
                break;

            // . (마침표): 각도 증가
            case '.':
                syncLockedAngle();
                updateAngleWithLock(Math.min(180, lockedAngle + 1));
                e.preventDefault();
                break;

            // , (쉼표): 각도 감소 (음수 허용)
            case ',':
                syncLockedAngle();
                updateAngleWithLock(Math.max(-180, lockedAngle - 1));
                e.preventDefault();
                break;

            // > (Shift + .): 각도 10도 증가
            case '>':
                syncLockedAngle();
                updateAngleWithLock(Math.min(180, lockedAngle + 10));
                e.preventDefault();
                break;

            // < (Shift + ,): 각도 10도 감소 (음수 허용)
            case '<':
                syncLockedAngle();
                updateAngleWithLock(Math.max(-180, lockedAngle - 10));
                e.preventDefault();
                break;

            // 숫자키 1-9, 0: 빠른 각도 설정
            case '1': case '2': case '3': case '4': case '5':
            case '6': case '7': case '8': case '9': case '0':
                // 1~5: 양수(10~50), 6~0: 음수(-10~-50)
                const anglePresets = {
                    '1': 10, '2': 20, '3': 30, '4': 40, '5': 50,
                    '6': -10, '7': -20, '8': -30, '9': -40, '0': -50
                };
                syncLockedAngle();
                updateAngleWithLock(anglePresets[e.key]);
                e.preventDefault();
                break;

            // / (슬래시): 전후면 카메라 전환
            case '/':
                switchCamera();
                e.preventDefault();
                break;

            // ; (세미콜론): 기울기선 토글
            case ';':
                toggleTiltLine();

                e.preventDefault();
                break;

            // f: 각도기 눈금 토글
            case 'f':
            case 'F':
                toggleProtractor();
                e.preventDefault();
                break;

            // r: 중심점 리셋
            case 'r':
            case 'R':
                resetCenter();
                e.preventDefault();
                break;

            // v: 수직선 토글
            case 'v':
            case 'V':
                toggleVerticalLine();
                e.preventDefault();
                break;

            // [: 카메라 축소
            case '[':
                zoomOut();
                e.preventDefault();
                break;

            // ]: 카메라 확대
            case ']':
                zoomIn();
                e.preventDefault();
                break;

            // W, A, S, D: 중심점 이동
            case 'w': case 'W':
            case 'a': case 'A':
            case 's': case 'S':
            case 'd': case 'D':
                const step = e.shiftKey ? 10 : 1;
                const newCenter = { x: currentCenter.x, y: currentCenter.y };

                switch (e.key.toLowerCase()) {
                    case 'w': newCenter.y -= step; break;
                    case 'a': newCenter.x -= step; break;
                    case 's': newCenter.y += step; break;
                    case 'd': newCenter.x += step; break;
                }

                updateCenterFromPoint(newCenter);
                e.preventDefault();
                break;

            // E: ESP32 서보 연결 모달 열기
            case 'e':
            case 'E':
                window.openESP32Modal();
                e.preventDefault();
                break;
        }
    }

    // 각도설정 모드에서 선 위치 업데이트
    function updateLockedAngleLines() {
        // line1(수직선)은 수평 기준선과 항상 직각
        angle1 = gravityAngle + 90;

        // line2는 line1으로부터 lockedAngle만큼 떨어진 위치
        // 음수일 경우 왼쪽으로, 양수일 경우 오른쪽으로
        angle2 = angle1 + lockedAngle;

        // angle1 범위 조정 (0-180도 범위 내로)
        while (angle1 > 180) angle1 -= 180;
        while (angle1 < 0) angle1 += 180;

        // angle2는 -180 ~ 360 범위를 허용 (음수 각도 지원)
        // 0-180 범위로 정규화
        while (angle2 > 180) angle2 -= 180;
        while (angle2 < 0) angle2 += 180;

        updateLines();

        // ESP32 서보 모터로 각도 전송
        sendAngleToESP32(lockedAngle);
    }

    // 수평 기준선 업데이트 (좌우 기울기)
    function updateGravityLine() {
        // 중력선의 y 위치를 currentCenter.y로 업데이트
        gravityLine.setAttribute('y1', currentCenter.y);
        gravityLine.setAttribute('y2', currentCenter.y);
        gravityIndicatorLeft.setAttribute('cy', currentCenter.y);
        gravityIndicatorRight.setAttribute('cy', currentCenter.y);

        // 중심점 기준으로 회전
        gravityLineGroup.setAttribute('transform', `rotate(${gravityAngle}, ${currentCenter.x}, ${currentCenter.y})`);
    }

    // 수직 기준선 업데이트 (앞뒤 기울기)
    function updateTiltLine() {
        // 수직선의 x 위치를 currentCenter.x로 업데이트
        tiltLine.setAttribute('x1', currentCenter.x);
        tiltLine.setAttribute('x2', currentCenter.x);
        tiltIndicatorTop.setAttribute('cx', currentCenter.x);
        tiltIndicatorBottom.setAttribute('cx', currentCenter.x);

        // y 위치 설정 (길이 40으로 축소)
        const lineTop = currentCenter.y - 40;
        const lineBottom = currentCenter.y;
        tiltLine.setAttribute('y1', lineTop);
        tiltLine.setAttribute('y2', lineBottom);
        tiltIndicatorTop.setAttribute('cy', lineTop);
        tiltIndicatorBottom.setAttribute('cy', lineBottom);

        // 중심점 기준으로 앞뒤 기울기 표시 (수평 이동으로 표현)
        const offsetX = tiltAngle * 0.5; // 기울기에 따른 수평 오프셋
        tiltLineGroup.setAttribute('transform', `translate(${offsetX}, 0)`);
    }

    // 기울기선 토글
    // 기울기선 토글
    function toggleTiltLine() {
        tiltLineVisible = !tiltLineVisible;
        if (tiltLineVisible) {
            tiltLineGroup.style.display = '';
            toggleTiltLineBtn.classList.remove('off');
        } else {
            tiltLineGroup.style.display = 'none';
            toggleTiltLineBtn.classList.add('off');
        }
        console.log('기울기선 표시:', tiltLineVisible);
    }

    // 각도기 눈금 토글
    function toggleProtractor() {
        protractorVisible = !protractorVisible;
        if (protractorVisible) {
            protractorGroup.style.display = '';
            toggleProtractorBtn.classList.remove('off');
        } else {
            protractorGroup.style.display = 'none';
            toggleProtractorBtn.classList.add('off');
        }
        console.log('각도기 눈금 표시:', protractorVisible);
    }

    // 수직선 토글
    function toggleVerticalLine() {
        verticalLineVisible = !verticalLineVisible;
        if (verticalLineVisible) {
            line1Group.style.display = '';
            if (toggleVerticalLineBtn) toggleVerticalLineBtn.classList.remove('off');
        } else {
            line1Group.style.display = 'none';
            if (toggleVerticalLineBtn) toggleVerticalLineBtn.classList.add('off');
        }
        console.log('수직선 표시:', verticalLineVisible);
    }

    // DeviceOrientation 설정
    function setupDeviceOrientation() {
        // iOS 13+ 에서는 권한 요청 필요
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS - 권한 요청은 사용자 제스처 필요 (카메라 시작 버튼 클릭 시)
            console.log('iOS 기기 감지 - 카메라 시작 시 센서 권한 요청');
        } else if ('DeviceOrientationEvent' in window) {
            // Android 및 기타
            window.addEventListener('deviceorientation', handleOrientation, true);
            console.log('DeviceOrientation 이벤트 리스너 등록됨');
        }
    }

    async function requestOrientationPermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                    console.log('iOS 센서 권한 허용됨');
                }
            } catch (err) {
                console.error('센서 권한 요청 실패:', err);
            }
        }
    }

    const SENSITIVITY = 1.0; // 수평 기준선 민감도 (1.0 = 1:1 실제 반응, 낮을수록 둔감)

    function handleOrientation(event) {
        // gamma: 좌우 기울기 (-90 ~ 90) - 세로 모드
        // beta: 앞뒤 기울기 (-180 ~ 180) - 가로 모드에서 좌우가 됨
        // alpha: 나침반 방향 (0 ~ 360)

        if (orientationMode === 'landscape') {
            // 가로 모드 (우측 회전, 홈버튼이 왼쪽)
            let beta = event.beta || 0;
            let gamma = event.gamma || 0;

            // beta(좌우 기울기) 보정
            let adjustedBeta = beta;
            if (beta > 90) {
                adjustedBeta = 180 - beta;
            } else if (beta < -90) {
                adjustedBeta = -180 - beta;
            }
            gravityAngle = adjustedBeta * SENSITIVITY;    // 민감도 적용

            // 주황색 수직선: 좌우 기울기
            if (Math.abs(beta) > 90) {
                tiltAngle = -(gamma - 90);
            } else {
                tiltAngle = -(gamma + 90);
            }
        } else {
            // 세로 모드
            let gamma = event.gamma || 0;
            gravityAngle = -gamma * SENSITIVITY;        // 민감도 적용

            // 앞뒤 기울기는 beta 사용 (90도 기준에서 얼마나 벗어났는지)
            let beta = event.beta || 0;
            tiltAngle = beta - 90;  // 직립 상태가 0이 되도록
        }

        // 각도 제한 (-45 ~ 45도)
        gravityAngle = Math.max(-45, Math.min(45, gravityAngle));
        tiltAngle = Math.max(-45, Math.min(45, tiltAngle));

        updateGravityLine();
        updateTiltLine();

        // 각도 설정 모드에서는 수평 기준선이 변경되면 수직선도 자동 조정
        if (measurementMode === 'angle-lock') {
            // line1(수직선)은 수평 기준선과 항상 직각
            angle1 = gravityAngle + 90;

            // line2는 line1으로부터 lockedAngle만큼 떨어진 위치
            angle2 = angle1 + lockedAngle;

            // 각도 범위 조정
            if (angle1 > 180) angle1 -= 180;
            if (angle1 < 0) angle1 += 180;
            if (angle2 > 180) angle2 -= 180;
            if (angle2 < 0) angle2 += 180;

            updateLines();
        }

        // 수평 OK 표시 (±임계값 이내면 수평 - 녹색)
        if (Math.abs(gravityAngle) <= LEVEL_THRESHOLD) {
            levelOk.classList.remove('hidden');
        } else {
            levelOk.classList.add('hidden');
        }

        // 수직 OK 표시 (±임계값 이내면 수직 - 주황색)
        // tiltAngle은 가로 모드에서 수직일 때 0이 되도록 보정되어 있음
        if (Math.abs(tiltAngle) <= LEVEL_THRESHOLD) {
            tiltOk.classList.remove('hidden');
        } else {
            tiltOk.classList.add('hidden');
        }
    }

    // 화면 방향 모드 전환
    function toggleOrientationMode() {
        const protractorGroup = document.getElementById('protractor-group');

        if (orientationMode === 'landscape') {
            orientationMode = 'portrait';
            orientationLabel.textContent = '세로';
            // 세로 모드 아이콘
            orientationIcon.innerHTML = '<rect x="6" y="2" width="12" height="20" rx="2" /><line x1="10" y1="12" x2="14" y2="12" />';

            // 세로 모드: viewBox 세로 비율로 변경
            overlay.setAttribute('viewBox', '0 0 100 150');
            // 중심점 업데이트
            currentCenter.y = 140;
            currentCenter.x = 50;

            // 각도기 위치 하단으로 이동 (transform 대신 직접 좌표 이동)
            protractorGroup.setAttribute('transform', `translate(${currentCenter.x}, ${currentCenter.y})`);

            // 화면 방향 세로로 잠금
            lockScreenOrientation('portrait');
        } else {
            orientationMode = 'landscape';
            orientationLabel.textContent = '가로';
            // 가로 모드 아이콘
            orientationIcon.innerHTML = '<rect x="2" y="6" width="20" height="12" rx="2" /><line x1="12" y1="10" x2="12" y2="14" />';

            // 가로 모드: viewBox 원래대로
            overlay.setAttribute('viewBox', '0 0 100 100');
            // 각도기 위치 원래대로 (transform 대신 직접 좌표 이동)
            protractorGroup.setAttribute('transform', `translate(${currentCenter.x}, ${currentCenter.y})`);
            // 중심점 원래대로
            currentCenter.y = 95;
            currentCenter.x = 50;

            // 화면 방향 가로로 잠금
            lockScreenOrientation('landscape');
        }

        // 라인 및 중력선 위치 업데이트
        updateLines();
        updateGravityLine();

        console.log('화면 방향 모드:', orientationMode, 'CENTER:', currentCenter);
    }

    // 중심점 리셋
    function resetCenter() {
        if (orientationMode === 'landscape') {
            currentCenter.x = 50;
            currentCenter.y = 95;
        } else {
            currentCenter.x = 50;
            currentCenter.y = 140;
        }

        // 각도기 그룹 위치 업데이트
        protractorGroup.setAttribute('transform', `translate(${currentCenter.x}, ${currentCenter.y})`);

        // 모든 라인 및 핸들 업데이트
        updateLines();
        updateGravityLine();
        updateTiltLine();

        console.log('중심점 리셋 완료', currentCenter);
    }

    // 화면 방향 잠금
    function lockScreenOrientation(orientation) {
        if (screen.orientation && screen.orientation.lock) {
            // landscape-primary: 화면 왼쪽이 아래로 가는 가로 방향
            const lockOrientation = orientation === 'landscape' ? 'landscape-primary' : orientation;
            screen.orientation.lock(lockOrientation).catch(err => {
                console.log('화면 방향 잠금 실패 (PWA 필요):', err.message);
            });
        }
    }

    // 측정 모드 전환
    function toggleMeasurementMode() {
        if (measurementMode === 'normal') {
            measurementMode = 'angle-lock';
            modeLabel.textContent = '각도설정';
            angleInputPanel.classList.remove('hidden');

            // 핸들 숨기기 (핸들1만 숨김, 핸들2는 조작 가능)
            handle1.style.display = 'none';
            handle2.style.display = '';

            // 각도 설정 모드로 전환하면 수직선을 수평기준선과 직각으로 설정
            angle1 = gravityAngle + 90;
            angle2 = angle1 + lockedAngle;

            // 각도 범위 조정 (0-180도 범위 내로)
            if (angle1 > 180) angle1 -= 180;
            if (angle1 < 0) angle1 += 180;
            if (angle2 > 180) angle2 -= 180;
            if (angle2 < 0) angle2 += 180;

            updateLines();
            console.log('각도 설정 모드로 전환');
        } else {
            measurementMode = 'normal';
            modeLabel.textContent = '일반';
            angleInputPanel.classList.add('hidden');

            // 핸들 다시 표시 (핸들2만 표시, 핸들1은 고정)
            handle1.style.display = 'none';
            handle2.style.display = '';

            // 일반 모드로 돌아오면 수직선은 90도로 고정
            angle1 = 90;
            updateLines();

            console.log('일반 모드로 전환');
        }
    }

    // 각도 입력 변경 핸들러
    function onAngleInputChange(e) {
        const value = parseInt(e.target.value);
        if (!isNaN(value) && value >= -180 && value <= 180) {
            lockedAngle = value;

            // 각도 설정 모드일 때만 즉시 업데이트
            if (measurementMode === 'angle-lock') {
                updateLockedAngleLines();
            }
        }
    }

    // 각도 입력 필드 keydown 핸들러 (엔터키로 포커스 해제)
    function onAngleInputKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // 입력값 적용
            const value = parseInt(angleInput.value);
            if (!isNaN(value) && value >= -180 && value <= 180) {
                updateAngleWithLock(value);
            }
            // 포커스 해제하여 키보드 단축키 다시 활성화
            angleInput.blur();

            // 포커스가 body로 이동하도록 보장
            document.body.focus();
        }
    }


    // SVG 좌표 변환
    function getSVGPoint(clientX, clientY) {
        const rect = overlay.getBoundingClientRect();
        const viewBox = overlay.viewBox.baseVal;

        return {
            x: ((clientX - rect.left) / rect.width) * viewBox.width,
            y: ((clientY - rect.top) / rect.height) * viewBox.height
        };
    }

    // 각도기 그룹 히트 체크 (중심점 드래그)
    function checkCenterHit(point) {
        // 중심점 주변 히트 영역
        const hitRadius = 15;
        const dist = Math.hypot(point.x - currentCenter.x, point.y - currentCenter.y);

        if (dist < hitRadius) {
            console.log('Hit center');
            startDrag('center');
            return true;
        }
        return false;
    }

    // 포인터 이벤트 핸들러
    function onPointerDown(e) {
        const point = getSVGPoint(e.clientX, e.clientY);
        if (checkCenterHit(point)) return;
        checkHandleHit(point);
    }

    function onPointerMove(e) {
        if (!isDragging || !activeHandle) return;
        e.preventDefault();

        const point = getSVGPoint(e.clientX, e.clientY);

        if (activeHandle === 'center') {
            updateCenterFromPoint(point);
        } else {
            updateAngleFromPoint(point);
        }
    }

    function onPointerUp() {
        endDrag();
    }

    // 터치 이벤트 핸들러
    function onTouchStart(e) {
        // 핀치 줌 시작 (두 손가락)
        if (e.touches.length === 2) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            pinchStartDistance = Math.hypot(
                touch1.clientX - touch2.clientX,
                touch1.clientY - touch2.clientY
            );
            pinchStartZoom = currentZoom;
            return;
        }

        if (e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const point = getSVGPoint(touch.clientX, touch.clientY);
        if (checkCenterHit(point)) return;
        checkHandleHit(point);
    }

    function onTouchMove(e) {
        // 핀치 줌 진행 (두 손가락)
        if (e.touches.length === 2 && pinchStartDistance > 0) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDist = Math.hypot(
                touch1.clientX - touch2.clientX,
                touch1.clientY - touch2.clientY
            );

            // 거리 비율에 따른 줌 레벨 계산
            const scale = currentDist / pinchStartDistance;
            let newZoom = pinchStartZoom * scale;

            // 범위 제한
            newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

            applyZoom(newZoom);
            return;
        }

        if (!isDragging || !activeHandle || e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const point = getSVGPoint(touch.clientX, touch.clientY);

        if (activeHandle === 'center') {
            updateCenterFromPoint(point);
        } else {
            updateAngleFromPoint(point);
        }
    }

    function onTouchEnd() {
        endDrag();
    }

    // 핸들 히트 체크
    function checkHandleHit(point) {
        // 각도 설정 모드에서는 터치로 각도 변경 불가
        if (measurementMode === 'angle-lock') {
            return;
        }

        const handle1Pos = {
            x: parseFloat(handle1.getAttribute('cx')),
            y: parseFloat(handle1.getAttribute('cy'))
        };
        const handle2Pos = {
            x: parseFloat(handle2.getAttribute('cx')),
            y: parseFloat(handle2.getAttribute('cy'))
        };

        // 터치 영역 크게 확대 (iPad에서 쉽게 터치)
        const hitRadius = 25;

        const dist1 = Math.hypot(point.x - handle1Pos.x, point.y - handle1Pos.y);
        const dist2 = Math.hypot(point.x - handle2Pos.x, point.y - handle2Pos.y);

        console.log('Touch point:', point, 'Handle1:', handle1Pos, 'Handle2:', handle2Pos);
        console.log('Distances:', dist1, dist2, 'Hit radius:', hitRadius);

        const handle1Visible = handle1.style.display !== 'none';

        if (handle1Visible && dist1 < hitRadius && dist1 <= dist2) {
            console.log('Hit handle 1');
            startDrag(1);
            updateAngleFromPoint(point);  // 즉시 각도 업데이트
        } else if (dist2 < hitRadius) {
            console.log('Hit handle 2');
            startDrag(2);
            updateAngleFromPoint(point);  // 즉시 각도 업데이트
        }
    }

    function startDrag(handleNum) {
        isDragging = true;
        activeHandle = handleNum;

        const group = handleNum === 1 ? line1Group : (handleNum === 2 ? line2Group : null);
        if (group) group.classList.add('active');
        if (handleNum === 'center') {
            document.body.style.cursor = 'move';
        }
    }

    function endDrag() {
        if (activeHandle) {
            const group = activeHandle === 1 ? line1Group : (activeHandle === 2 ? line2Group : null);
            if (group) group.classList.remove('active');
        }
        document.body.style.cursor = '';

        isDragging = false;
        activeHandle = null;
    }

    function updateCenterFromPoint(point) {
        currentCenter.x = point.x;
        currentCenter.y = point.y;

        // 각도기 그룹 위치 업데이트
        protractorGroup.setAttribute('transform', `translate(${currentCenter.x}, ${currentCenter.y})`);

        // 모든 라인 및 핸들 업데이트
        updateLines();
        updateGravityLine();
        updateTiltLine();
    }

    function updateAngleFromPoint(point) {
        // 각도 설정 모드: handle2를 움직여서 lockedAngle 조정
        if (measurementMode === 'angle-lock') {
            if (activeHandle !== 2) return;

            const dx = currentCenter.x - point.x;
            const dy = currentCenter.y - point.y;
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);

            // 현재 angle1(수직선)과의 차이를 계산
            // angle2 = angle1 + lockedAngle  =>  lockedAngle = angle2 - angle1
            let diff = angle - angle1;

            // 정규화 (-180 ~ 180)
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;

            lockedAngle = Math.round(diff); // 정수로 반올림

            // 입력 필드 업데이트
            angleInput.value = lockedAngle;

            // 라인 업데이트
            updateLockedAngleLines();
            return;
        }

        // 일반 모드: 각도와 거리 모두 업데이트
        const dx = currentCenter.x - point.x;
        const dy = currentCenter.y - point.y;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        let distance = Math.hypot(dx, dy);

        // 각도 범위 제한 제거 - 연장선까지 이동 가능
        if (angle < -45) angle = -45;
        if (angle > 225) angle = 225;

        // 거리 범위 제한
        distance = Math.max(MIN_HANDLE_DISTANCE, Math.min(MAX_HANDLE_DISTANCE, distance));

        if (activeHandle === 1) {
            angle1 = angle;
            handleDistance1 = distance;
        } else {
            angle2 = angle;
            handleDistance2 = distance;
        }

        updateLines();
    }

    // 카메라 접근
    async function requestCameraAccess() {
        // HTTP 환경 (WiFi 모드)에서는 카메라 지원 안함 (보안 정책)
        if (location.protocol === 'http:') {
            console.warn('HTTP 환경 감지: 카메라 없이 시작');
            writeToDebugLog('HTTP 모드: 카메라 미사용 (보안 정책)', 'warn');

            // 비디오 숨기고 흰색 배경
            if (video) video.style.display = 'none';
            document.body.style.backgroundColor = '#f0f0f0';

            // 키보드 포커스 설정
            document.body.setAttribute('tabindex', '-1');
            document.body.focus();
            return;
        }

        // 권한 요청 오버레이 표시
        showPermissionOverlay();
    }

    function showPermissionOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'permission-overlay';
        overlay.innerHTML = `
            <h1>📐 AR 각도기</h1>
            <p>카메라를 사용하여 실제 물체의 각도를 측정할 수 있습니다.</p>
            <button id="start-camera">카메라 시작</button>
        `;
        document.body.appendChild(overlay);

        document.getElementById('start-camera').addEventListener('click', async () => {
            try {
                // iOS에서 센서 권한 요청
                await requestOrientationPermission();
                await startCamera();
                overlay.remove();

                // 키보드 단축키가 작동하도록 포커스 설정
                document.body.focus();
                // tabindex를 설정하여 body가 포커스를 받을 수 있게 함
                document.body.setAttribute('tabindex', '-1');
                document.body.focus();
            } catch (err) {
                console.error('카메라 접근 실패:', err);
                overlay.querySelector('p').textContent =
                    '카메라 접근이 거부되었습니다. 설정에서 카메라 권한을 허용해 주세요.';
            }
        });
    }

    async function startCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: {
                facingMode: facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;

        // 전면 카메라일 경우 좌우 반전 (거울 모드)
        if (facingMode === 'user') {
            video.style.transform = 'scaleX(-1)';
        } else {
            video.style.transform = '';
        }

        // 줌 기능 확인 및 초기화
        const track = currentStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();

        if ('zoom' in capabilities) {
            minZoom = capabilities.zoom.min;
            maxZoom = capabilities.zoom.max;
            // 현재 줌 상태 유지 (또는 minZoom으로 초기화)
            if (currentZoom < minZoom || currentZoom > maxZoom) {
                currentZoom = minZoom;
            }
            applyZoom(currentZoom);
            console.log(`줌 기능 지원: ${minZoom} ~ ${maxZoom}`);
        } else {
            console.log('줌 기능 미지원');
        }
    }



    // 줌 적용 헬퍼 함수
    async function applyZoom(zoom) {
        if (!currentStream) return;
        if (isApplyingZoom) return; // 이미 적용 중이면 무시 (스로틀링)

        isApplyingZoom = true;
        try {
            const track = currentStream.getVideoTracks()[0];
            await track.applyConstraints({ advanced: [{ zoom: zoom }] });
            currentZoom = zoom;
        } catch (err) {
            console.error('줌 적용 실패:', err);
        } finally {
            isApplyingZoom = false;
        }
    }

    // 줌 인 함수
    function zoomIn() {
        if (maxZoom <= 1) {
            console.log('줌 기능 미지원');
            return;
        }
        const newZoom = Math.min(maxZoom, currentZoom + ZOOM_STEP);
        applyZoom(newZoom);
    }

    // 줌 아웃 함수
    function zoomOut() {
        if (maxZoom <= 1) {
            console.log('줌 기능 미지원');
            return;
        }
        const newZoom = Math.max(minZoom, currentZoom - ZOOM_STEP);
        applyZoom(newZoom);
    }

    // 각도 동기화 (일반 모드 상태를 lockedAngle에 반영)
    function syncLockedAngle() {
        if (measurementMode === 'normal') {
            let diff = angle2 - angle1;
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;
            lockedAngle = Math.round(diff);
        }
    }

    // 각도 업데이트 및 적용 (모드에 따라 분기)
    function updateAngleWithLock(newAngle) {
        lockedAngle = newAngle;
        angleInput.value = lockedAngle;

        if (measurementMode === 'angle-lock') {
            updateLockedAngleLines();
        } else {
            // 일반 모드: angle1은 그대로 두고 angle2만 변경
            // angle2 = angle1 + lockedAngle
            angle2 = angle1 + lockedAngle;

            // angle2 정규화
            while (angle2 > 180) angle2 -= 180;
            while (angle2 < 0) angle2 += 180;

            updateLines();

            // ESP32 서보 모터로 각도 전송
            sendAngleToESP32(lockedAngle);
        }
    }

    async function switchCamera() {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';

        try {
            await startCamera();
        } catch (err) {
            console.error('카메라 전환 실패:', err);
            // 실패 시 원래 모드로 복구
            facingMode = facingMode === 'environment' ? 'user' : 'environment';
        }
    }

    // 도움말 모달 함수 (전역 노출)
    window.openHelpModal = function () {
        const modal = document.getElementById('help-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // 모달이 뜰 때 포커스 해제 (키보드 입력 방지 등)
            document.activeElement.blur();
        }
    };

    window.closeHelpModal = function () {
        const modal = document.getElementById('help-modal');
        if (modal) modal.classList.add('hidden');
    };

    // ===== ESP32 서보 모터 제어 함수들 =====

    // ESP32 연결 테스트
    async function testESP32Connection() {
        // HTTPS 환경에서는 HTTP 요청 불가 (Mixed Content)
        // HTTPS 환경에서는 HTTP 요청 불가 (Mixed Content) -> Blind Mode (Image Hack) 사용
        if (window.location.protocol === 'https:') {
            console.warn('HTTPS 환경 감지: Blind Mode(단방향 제어) 활성화');
            writeToDebugLog('HTTPS 모드: Blind Mode 활성화 (단방향)', 'warn');

            esp32Connected = true;
            connectionMode = 'wifi-blind'; // 새로운 모드 추가
            updateESP32Status('connected');
            showESP32Message('⚠️ Blind Mode 연결 (HTTPS). 제어만 가능하며 상태 확인은 불가능합니다.', 'warning');

            // 초기 각도 전송 시도
            sendAngleToESP32(lockedAngle);
            return;
        }

        updateESP32Status('connecting');
        showESP32Message('연결 테스트 중...', 'info');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`http://${ESP32_IP}:${ESP32_PORT}/status`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                esp32Connected = true;
                updateESP32Status('connected');
                showESP32Message(`연결 성공! 현재 각도: ${data.angle}°`, 'success');
                console.log('ESP32 연결됨:', data);

                // 현재 각도 동기화
                sendAngleToESP32(lockedAngle);
            } else {
                throw new Error('응답 오류');
            }
        } catch (err) {
            esp32Connected = false;
            updateESP32Status('disconnected');

            if (err.name === 'AbortError') {
                showESP32Message('연결 시간 초과. WiFi 연결을 확인하세요.', 'error');
            } else {
                showESP32Message('연결 실패. ESP32 WiFi에 연결되어 있는지 확인하세요.', 'error');
            }
            console.error('ESP32 연결 실패:', err);
        }
    }

    // ESP32 연결 해제
    function disconnectESP32() {
        esp32Connected = false;
        updateESP32Status('disconnected');
        showESP32Message('연결이 해제되었습니다.', 'info');
        console.log('ESP32 연결 해제');
    }

    // ESP32 자동 연결 시도 (백그라운드, 조용히)
    async function autoConnectESP32() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`http://${ESP32_IP}:${ESP32_PORT}/status`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                esp32Connected = true;
                updateESP32Status('connected');
                console.log('ESP32 자동 연결 성공:', data);

                // 현재 각도 동기화
                sendAngleToESP32(lockedAngle);
            }
        } catch (err) {
            // 자동 연결 실패 시 조용히 무시 (사용자에게 알림 없음)
            console.log('ESP32 자동 연결 안됨 (WiFi 미연결 상태)');
        }
    }

    // ESP32로 각도 전송 (디바운스 적용, WiFi 또는 BLE)
    function sendAngleToESP32(angle) {
        // WiFi나 BLE 둘 중 하나라도 연결되어 있어야 함
        // WiFi나 BLE 둘 중 하나라도 연결되어 있어야 함
        // WiFi나 BLE 둘 중 하나라도 연결되어 있어야 함
        if (!esp32Connected && !bleConnected && connectionMode !== 'wifi-blind' && connectionMode !== 'native') return;

        // 디바운스: 이전 타이머 취소
        if (esp32SendTimeout) {
            clearTimeout(esp32SendTimeout);
        }

        esp32SendTimeout = setTimeout(async () => {
            // Native App 연결 (최우선)
            if (connectionMode === 'native') {
                sendAngleViaNative(angle);
                return;
            }

            // BLE 연결된 경우 우선
            if (bleConnected && bleAngleCharacteristic) {
                try {
                    // 호환성을 위해 TextEncoder 대신 직접 변환
                    const str = String(angle);
                    const bytes = new Uint8Array(str.length);
                    for (let i = 0; i < str.length; i++) {
                        bytes[i] = str.charCodeAt(i);
                    }

                    // 1. writeValueWithoutResponse 시도 (안드로이드 멈춤 방지)
                    if (bleAngleCharacteristic.writeValueWithoutResponse) {
                        try {
                            await bleAngleCharacteristic.writeValueWithoutResponse(bytes);
                            console.log(`BLE(NR) 각도 전송 성공: ${angle}°`);
                            writeToDebugLog(`전송(NR) 성공: ${angle}°`, 'success');
                            return;
                        } catch (nrErr) {
                            console.warn('BLE NR 전송 실패, 일반 전송 시도:', nrErr);
                            writeToDebugLog(`NR 전송 실패: ${nrErr.message}`, 'warn');
                        }
                    }

                    // 2. 기존 writeValue (응답 대기) - NR 실패하거나 미지원 시
                    await bleAngleCharacteristic.writeValue(bytes);
                    console.log(`BLE 각도 전송 성공: ${angle}°`);
                    writeToDebugLog(`전송 성공: ${angle}°`, 'success');
                } catch (err) {
                    console.error('BLE 각도 전송 오류:', err);
                    writeToDebugLog(`전송 오류: ${err.message}`, 'error');
                    if (err.message && err.message.includes('GATT')) {
                        handleBLEDisconnect();
                    }
                }
                return;
            }

            // WiFi Blind Mode (HTTPS)
            if (connectionMode === 'wifi-blind') {
                sendAngleViaImageHack(angle);
                return;
            }

            // WiFi 일반 모드 (HTTP)
            if (esp32Connected) {
                try {
                    const response = await fetch(`http://${ESP32_IP}:${ESP32_PORT}/angle?value=${angle}`, {
                        method: 'GET'
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log(`WiFi 각도 전송 성공: ${angle}° → 서보: ${data.servoAngle}°`);
                    } else {
                        console.error('WiFi 각도 전송 실패:', response.status);
                    }
                } catch (err) {
                    console.error('WiFi 각도 전송 오류:', err);
                    // 연결 끊김 감지
                    if (esp32Connected) {
                        esp32Connected = false;
                        connectionMode = 'none';
                        updateESP32Status('disconnected');
                    }
                }
            }
        }, ESP32_SEND_DEBOUNCE);
    }

    // Image Beacon Hack: HTTPS에서 HTTP 요청을 보내기 위한 우회 방법
    // <img> 태그는 Mixed Content 차단에서 예외적으로 허용되는 경우가 많음 (단, 응답은 읽을 수 없음)
    function sendAngleViaImageHack(angle) {
        const img = new Image();
        const url = `http://${ESP32_IP}:${ESP32_PORT}/angle?value=${angle}&t=${Date.now()}`;

        img.onerror = function () {
            // CORS/Mixed Content 에러가 발생하더라도 요청 자체는 서버에 도달했을 가능성이 높음
            console.log(`Blind Command Sent: ${angle}°`);
        };

        img.onload = function () {
            console.log(`Blind Command Success: ${angle}°`);
        };

        // 요청 전송
        img.src = url;
    }

    // Native App으로 각도 전송
    function sendAngleViaNative(angle) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nativeHandler) {
            window.webkit.messageHandlers.nativeHandler.postMessage({
                command: 'sendAngle',
                value: angle
            });
            console.log(`Native Command Sent: ${angle}°`);
        }
    }

    // Native App에서 호출하는 상태 업데이트 함수
    window.updateNativeStatus = function (mode, status) {
        if (status === 'connected') {
            updateESP32Status('connected');
            showESP32Message(`Native: ${mode} 연결됨`, 'success');
        } else if (status === 'disconnected') {
            updateESP32Status('disconnected');
            showESP32Message(`Native: ${mode} 연결 해제`, 'warning');
        }
    };

    // BLE 연결 시도
    async function connectBLE() {
        writeToDebugLog('BLE 연결 시도 중...', 'info');

        // Web Bluetooth API 지원 확인
        if (!navigator.bluetooth) {
            // Native App인 경우 Native Bridge 사용
            if (isNativeApp) {
                writeToDebugLog('Native BLE 연결 요청', 'info');
                window.webkit.messageHandlers.nativeHandler.postMessage({ command: 'connectBLE' });
                return;
            }

            writeToDebugLog('Web Bluetooth 미지원 브라우저', 'error');
            showESP32Message('이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.', 'error');
            return;
        }

        updateESP32Status('connecting');
        showESP32Message('블루투스 장치 검색 중... (Protractor-Servo 선택)', 'info');

        try {
            // 블루투스 장치 요청 - 모든 장치 표시 (호환성 우선)
            writeToDebugLog('장치 검색 요청 (acceptAllDevices)...', 'info');
            bleDevice = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [BLE_SERVICE_UUID]
            });

            writeToDebugLog(`장치 선택됨: ${bleDevice.name} (${bleDevice.id})`, 'success');

            showESP32Message('장치 연결 중...', 'info');

            // 연결 해제 이벤트 리스너
            bleDevice.addEventListener('gattserverdisconnected', handleBLEDisconnect);

            // GATT 서버 연결
            writeToDebugLog('GATT 서버 연결 중...', 'info');
            bleServer = await bleDevice.gatt.connect();
            writeToDebugLog('GATT 서버 연결 성공', 'success');

            // 서비스 가져오기
            writeToDebugLog(`서비스 검색: ${BLE_SERVICE_UUID}`, 'info');
            const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);

            // 각도 특성 가져오기
            writeToDebugLog('각도 특성 가져오는 중...', 'info');
            bleAngleCharacteristic = await service.getCharacteristic(BLE_ANGLE_CHAR_UUID);
            writeToDebugLog('각도 특성 획득 성공', 'success');

            // 연결 성공
            bleConnected = true;
            connectionMode = 'ble';
            updateESP32Status('connected');
            showESP32Message('🔵 블루투스 연결 성공! (0° 초기화)', 'success');
            console.log('BLE 연결됨:', bleDevice.name);

            // 0도로 초기화 및 자동 이동 (사용자 요청)
            updateAngleWithLock(0);

        } catch (err) {
            console.error('BLE 연결 오류:', err);
            bleConnected = false;
            connectionMode = 'none';
            updateESP32Status('disconnected');

            if (err.name === 'NotFoundError') {
                showESP32Message('장치를 찾을 수 없습니다. ESP32가 켜져 있는지 확인하세요.', 'error');
            } else if (err.name === 'SecurityError') {
                showESP32Message('블루투스 권한이 거부되었습니다.', 'error');
            } else {
                showESP32Message('블루투스 연결 실패: ' + err.message, 'error');
            }
        }
    }

    // BLE 연결 해제 처리
    function handleBLEDisconnect() {
        console.log('BLE 연결 해제됨');
        bleConnected = false;
        bleAngleCharacteristic = null;
        bleServer = null;

        if (connectionMode === 'ble') {
            connectionMode = 'none';
            updateESP32Status('disconnected');
            showESP32Message('블루투스 연결이 해제되었습니다.', 'info');
        }
    }

    // BLE 연결 해제
    function disconnectBLE() {
        if (bleDevice && bleDevice.gatt.connected) {
            bleDevice.gatt.disconnect();
        }
        bleConnected = false;
        bleAngleCharacteristic = null;
        bleServer = null;
        bleDevice = null;
        connectionMode = 'none';
        updateESP32Status('disconnected');
        showESP32Message('블루투스 연결이 해제되었습니다.', 'info');
        console.log('BLE 연결 해제');
    }

    // ESP32 상태 UI 업데이트
    function updateESP32Status(status) {
        // 버튼 상태 도트
        if (esp32StatusDot) {
            esp32StatusDot.className = 'status-dot ' + status;
        }

        // 버튼 클래스
        if (esp32ConnectBtn) {
            if (status === 'connected') {
                esp32ConnectBtn.classList.add('connected');
            } else {
                esp32ConnectBtn.classList.remove('connected');
            }
        }

        // 모달 내 상태 카드
        if (esp32ConnectionStatus) {
            const statusIcon = esp32ConnectionStatus.querySelector('.status-icon');
            const statusText = esp32ConnectionStatus.querySelector('span');

            if (statusIcon) {
                statusIcon.className = 'status-icon ' + status;
            }

            if (statusText) {
                switch (status) {
                    case 'connected':
                        statusText.textContent = '연결됨';
                        break;
                    case 'connecting':
                        statusText.textContent = '연결 중...';
                        break;
                    default:
                        statusText.textContent = '연결 안됨';
                }
            }
        }

        // 버튼 표시/숨김
        if (esp32TestBtn && esp32DisconnectBtn) {
            if (status === 'connected') {
                esp32TestBtn.classList.add('hidden');
                esp32DisconnectBtn.classList.remove('hidden');
            } else {
                esp32TestBtn.classList.remove('hidden');
                esp32DisconnectBtn.classList.add('hidden');
            }
        }
    }

    // ESP32 메시지 표시
    function showESP32Message(message, type) {
        if (esp32Message) {
            esp32Message.textContent = message;
            esp32Message.className = 'esp32-message ' + type;
            esp32Message.classList.remove('hidden');

            // 성공/오류 메시지는 5초 후 자동 숨김
            if (type !== 'info') {
                setTimeout(() => {
                    esp32Message.classList.add('hidden');
                }, 5000);
            }
        }
    }

    // 디버그 로그 함수
    function writeToDebugLog(message, type = 'info') {
        const debugConsole = document.getElementById('debug-console');
        const debugLog = document.getElementById('debug-log');

        if (debugConsole && debugLog) {
            debugConsole.style.display = 'block'; // 로그 발생 시 콘솔 표시

            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;

            const time = new Date().toLocaleTimeString().split(' ')[0]; // 시:분:초 만
            entry.textContent = `[${time}] ${message}`;

            debugLog.appendChild(entry);
            debugLog.scrollTop = debugLog.scrollHeight;
        }
        console.log(`[Debug] ${message}`);
    }

    function clearDebugLog() {
        const debugLog = document.getElementById('debug-log');
        if (debugLog) debugLog.innerHTML = '';
    }

    // ESP32 모달 열기/닫기 (전역 노출)
    window.openESP32Modal = function () {
        if (esp32Modal) {
            esp32Modal.classList.remove('hidden');
            document.activeElement.blur();

            // 모달 열 때 디버그 콘솔 표시
            const debugConsole = document.getElementById('debug-console');
            if (debugConsole) debugConsole.style.display = 'block';
        }
    };

    window.closeESP32Modal = function () {
        if (esp32Modal) {
            esp32Modal.classList.add('hidden');
        }
    };

    // ESP32 연결 테스트 (전역 노출)
    window.testESP32Connection = testESP32Connection;
    window.disconnectESP32 = disconnectESP32;

    // BLE 연결 함수 (전역 노출)
    window.connectBLE = connectBLE;
    window.disconnectBLE = disconnectBLE;

    // 디버그 함수 노출
    window.writeToDebugLog = writeToDebugLog;
    window.clearDebugLog = clearDebugLog;

    // ESP32 버튼 클릭 이벤트 (모달 열기)
    if (esp32ConnectBtn) {
        esp32ConnectBtn.addEventListener('click', () => {
            window.openESP32Modal();
        });
    }
})();
