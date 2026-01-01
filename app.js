// AR 각도기 앱
(function () {
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

    // 수평 기준선 요소
    const gravityLineGroup = document.getElementById('gravity-line-group');
    const gravityLine = document.getElementById('gravity-line');
    const gravityIndicatorLeft = document.getElementById('gravity-indicator-left');
    const gravityIndicatorRight = document.getElementById('gravity-indicator-right');

    // 상태
    let facingMode = 'environment'; // 후면 카메라 기본
    let currentStream = null;
    let isDragging = false;
    let activeHandle = null;

    // 중심점 (각도기 중심)
    const CENTER = { x: 50, y: 95 };
    const LINE_LENGTH = 60; // 기준선 길이

    // 현재 각도 (degree)
    let angle1 = 90;  // 수직선 (위쪽)
    let angle2 = 60;  // 오른쪽 위

    // 수평 기준선 각도 (기기 기울기)
    let gravityAngle = 0;

    // 화면 방향 모드 ('landscape' = 가로, 'portrait' = 세로)
    let orientationMode = 'landscape';
    const switchOrientationBtn = document.getElementById('switch-orientation');
    const orientationIcon = document.getElementById('orientation-icon');
    const orientationLabel = document.getElementById('orientation-label');

    // 수평 OK 표시
    const levelOk = document.getElementById('level-ok');
    const LEVEL_THRESHOLD = 1; // 수평 판정 임계값 (±1도)

    // 초기화
    init();

    function init() {
        createTickMarks();
        updateLines();
        updateGravityLine();
        setupEventListeners();
        setupDeviceOrientation();
        requestCameraAccess();
    }

    // 눈금 생성
    function createTickMarks() {
        const radius = 37.5;
        const innerRadius = 35;

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
            tick.setAttribute('stroke', 'rgba(0, 0, 0, 0.6)');
            tick.setAttribute('stroke-width', '0.3');
            tickMarks.appendChild(tick);

            // 숫자 라벨
            if (deg % 10 === 0) {
                const labelRadius = 31;
                const labelX = -cos * labelRadius;
                const labelY = -sin * labelRadius;

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', labelX);
                text.setAttribute('y', labelY);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('font-size', '3');
                text.setAttribute('font-weight', '500');
                text.setAttribute('fill', 'rgba(0, 0, 0, 0.7)');
                text.textContent = deg;
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
                smallTick.setAttribute('stroke', 'rgba(0, 0, 0, 0.4)');
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

        // 끝점 좌표 계산 (핸들 위치)
        const end1X = CENTER.x - Math.cos(rad1) * LINE_LENGTH;
        const end1Y = CENTER.y - Math.sin(rad1) * LINE_LENGTH;
        const end2X = CENTER.x - Math.cos(rad2) * LINE_LENGTH;
        const end2Y = CENTER.y - Math.sin(rad2) * LINE_LENGTH;

        // 연장선 끝점 계산 (핸들 이후)
        const ext1X = CENTER.x - Math.cos(rad1) * (LINE_LENGTH + EXTENSION_LENGTH);
        const ext1Y = CENTER.y - Math.sin(rad1) * (LINE_LENGTH + EXTENSION_LENGTH);
        const ext2X = CENTER.x - Math.cos(rad2) * (LINE_LENGTH + EXTENSION_LENGTH);
        const ext2Y = CENTER.y - Math.sin(rad2) * (LINE_LENGTH + EXTENSION_LENGTH);

        // 라인 업데이트
        line1.setAttribute('x1', CENTER.x);
        line1.setAttribute('y1', CENTER.y);
        line1.setAttribute('x2', end1X);
        line1.setAttribute('y2', end1Y);
        handle1.setAttribute('cx', end1X);
        handle1.setAttribute('cy', end1Y);

        // 연장선 1 업데이트
        line1Ext.setAttribute('x1', end1X);
        line1Ext.setAttribute('y1', end1Y);
        line1Ext.setAttribute('x2', ext1X);
        line1Ext.setAttribute('y2', ext1Y);

        line2.setAttribute('x1', CENTER.x);
        line2.setAttribute('y1', CENTER.y);
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

        // 가로/세로 모드 전환
        switchOrientationBtn.addEventListener('click', toggleOrientationMode);

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
    }

    // 수평 기준선 업데이트
    function updateGravityLine() {
        // 중력선의 y 위치를 CENTER.y로 업데이트
        gravityLine.setAttribute('y1', CENTER.y);
        gravityLine.setAttribute('y2', CENTER.y);
        gravityIndicatorLeft.setAttribute('cy', CENTER.y);
        gravityIndicatorRight.setAttribute('cy', CENTER.y);

        // 중심점 기준으로 회전
        gravityLineGroup.setAttribute('transform', `rotate(${gravityAngle}, ${CENTER.x}, ${CENTER.y})`);
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

    function handleOrientation(event) {
        // gamma: 좌우 기울기 (-90 ~ 90) - 세로 모드
        // beta: 앞뒤 기울기 (-180 ~ 180) - 가로 모드에서 좌우가 됨

        if (orientationMode === 'landscape') {
            // 가로 모드 (우측 회전, 홈버튼이 왼쪽)
            let beta = event.beta || 0;
            gravityAngle = beta;
        } else {
            // 세로 모드
            let gamma = event.gamma || 0;
            gravityAngle = -gamma;
        }

        // 각도 제한 (-45 ~ 45도)
        gravityAngle = Math.max(-45, Math.min(45, gravityAngle));

        updateGravityLine();

        // 수평 OK 표시 (±임계값 이내면 수평)
        if (Math.abs(gravityAngle) <= LEVEL_THRESHOLD) {
            levelOk.classList.remove('hidden');
        } else {
            levelOk.classList.add('hidden');
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
            // 각도기 위치 하단으로 이동
            protractorGroup.setAttribute('transform', 'translate(50, 140)');
            // 중심점 업데이트
            CENTER.y = 140;
        } else {
            orientationMode = 'landscape';
            orientationLabel.textContent = '가로';
            // 가로 모드 아이콘
            orientationIcon.innerHTML = '<rect x="2" y="6" width="20" height="12" rx="2" /><line x1="12" y1="10" x2="12" y2="14" />';

            // 가로 모드: viewBox 원래대로
            overlay.setAttribute('viewBox', '0 0 100 100');
            // 각도기 위치 원래대로 (더 아래로)
            protractorGroup.setAttribute('transform', 'translate(50, 95)');
            // 중심점 원래대로
            CENTER.y = 95;
        }

        // 라인 및 중력선 위치 업데이트
        updateLines();
        updateGravityLine();

        console.log('화면 방향 모드:', orientationMode, 'CENTER:', CENTER);
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

    // 포인터 이벤트 핸들러
    function onPointerDown(e) {
        const point = getSVGPoint(e.clientX, e.clientY);
        checkHandleHit(point);
    }

    function onPointerMove(e) {
        if (!isDragging || !activeHandle) return;
        e.preventDefault();

        const point = getSVGPoint(e.clientX, e.clientY);
        updateAngleFromPoint(point);
    }

    function onPointerUp() {
        endDrag();
    }

    // 터치 이벤트 핸들러
    function onTouchStart(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const point = getSVGPoint(touch.clientX, touch.clientY);
        checkHandleHit(point);
    }

    function onTouchMove(e) {
        if (!isDragging || !activeHandle || e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const point = getSVGPoint(touch.clientX, touch.clientY);
        updateAngleFromPoint(point);
    }

    function onTouchEnd() {
        endDrag();
    }

    // 핸들 히트 체크
    function checkHandleHit(point) {
        const handle1Pos = {
            x: parseFloat(handle1.getAttribute('cx')),
            y: parseFloat(handle1.getAttribute('cy'))
        };
        const handle2Pos = {
            x: parseFloat(handle2.getAttribute('cx')),
            y: parseFloat(handle2.getAttribute('cy'))
        };

        // 터치 영역 크게 확대 (iPad에서 쉽게 터치)
        const hitRadius = 15;

        const dist1 = Math.hypot(point.x - handle1Pos.x, point.y - handle1Pos.y);
        const dist2 = Math.hypot(point.x - handle2Pos.x, point.y - handle2Pos.y);

        console.log('Touch point:', point, 'Handle1:', handle1Pos, 'Handle2:', handle2Pos);
        console.log('Distances:', dist1, dist2, 'Hit radius:', hitRadius);

        if (dist1 < hitRadius && dist1 <= dist2) {
            console.log('Hit handle 1');
            startDrag(1);
        } else if (dist2 < hitRadius) {
            console.log('Hit handle 2');
            startDrag(2);
        }
    }

    function startDrag(handleNum) {
        isDragging = true;
        activeHandle = handleNum;

        const group = handleNum === 1 ? line1Group : line2Group;
        group.classList.add('active');
    }

    function endDrag() {
        if (activeHandle) {
            const group = activeHandle === 1 ? line1Group : line2Group;
            group.classList.remove('active');
        }

        isDragging = false;
        activeHandle = null;
    }

    function updateAngleFromPoint(point) {
        // 중심점에서의 각도 계산
        const dx = CENTER.x - point.x;
        const dy = CENTER.y - point.y;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // 0-180도 범위로 제한
        if (angle < 0) angle = 0;
        if (angle > 180) angle = 180;

        if (activeHandle === 1) {
            angle1 = angle;
        } else {
            angle2 = angle;
        }

        updateLines();
    }

    // 카메라 접근
    async function requestCameraAccess() {
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
})();
