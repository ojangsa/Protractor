# AR Protractor (AR 각도기)

iPad용 AR 각도기 웹 앱입니다. 카메라를 통해 실제 물체의 각도를 측정할 수 있습니다.

![Demo](docs/demo.png)

## 주요 기능

- 📷 **카메라 오버레이**: 전면/후면 카메라 실시간 스트리밍
- 📐 **각도기 오버레이**: 반원형 SVG 각도기 (0-180°)
- 🔵 **측정 기준선 (2개)**: 터치로 드래그 가능한 파란색 선
- 🟢 **수평 기준선**: iPad 기울기 감지, 항상 수평 유지
- ✓ **수평 표시**: 수평이 맞으면 OK 표시
- 🔄 **가로/세로 모드**: 화면 방향 전환 지원

## 기술 스택

- HTML5, CSS3, JavaScript (Vanilla)
- MediaDevices API (카메라)
- DeviceOrientation API (센서)
- SVG (각도기, 기준선)

## 사용 방법

### 로컬 실행
```bash
cd protractor
python3 -m http.server 8000
# http://localhost:8000 접속
```

### iPad에서 사용
1. HTTPS 환경 필요 (카메라/센서 API)
2. Synology NAS Web Station 또는 ngrok 권장
3. Safari에서 접속 후 카메라/센서 권한 허용

## 조작법

1. **파란색 선 핸들**(흰색 원)을 드래그하여 각도 측정
2. **초록색 점선**은 iPad가 기울어져도 항상 수평 유지
3. 상단 **가로/세로** 버튼으로 화면 방향 전환
4. 수평이 맞으면 각도 배지에 **✓** 표시

## 라이선스

MIT License
