/*
 * ESP32 서보 모터 컨트롤러
 * Protractor 웹앱과 WiFi AP 모드 및 BLE(블루투스)로 연결하여 서보 모터를
 * 제어합니다.
 *
 * 연결:
 *   - 서보 모터 신호선: GPIO 13
 *   - 서보 모터 VCC: 5V (또는 외부 전원)
 *   - 서보 모터 GND: GND
 *
 * WiFi AP 설정:
 *   - SSID: Protractor-Servo
 *   - 비밀번호: 12345678
 *   - IP: 192.168.4.1
 *
 * BLE(블루투스) 설정:
 *   - 장치 이름: Protractor-Servo
 *   - 서비스 UUID: 12345678-1234-5678-1234-56789abcdef0
 *   - 각도 특성 UUID: 12345678-1234-5678-1234-56789abcdef1
 */

#include "web_assets.h" // 웹앱 파일 포함 (index.html, styles.css, app.js)
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <ESP32Servo.h>
#include <WebServer.h>
#include <WiFi.h>

// WiFi AP 설정
const char *AP_SSID = "Protractor-Servo";
const char *AP_PASSWORD = "12345678";

// BLE 설정
#define BLE_DEVICE_NAME "Pro-Servo" // 이름 변경 (캐시 문제 해결)
#define SERVICE_UUID "12345678-1234-5678-1234-56789abcdef0"
#define ANGLE_CHAR_UUID "12345678-1234-5678-1234-56789abcdef1"
#define STATUS_CHAR_UUID "12345678-1234-5678-1234-56789abcdef2"
#define LASER_CHAR_UUID "12345678-1234-5678-1234-56789abcdef3"

// 서보 모터 설정 (MG90S 최적화)
const int SERVO_PIN = 13; // GPIO 13 (D13)
// MG90S 펄스 폭 (실측 기반 최적화)
const int SERVO_MIN_PULSE = 544;  // 0도 (MG90S 표준)
const int SERVO_MAX_PULSE = 2400; // 180도 (MG90S 표준)

// 레이저 모듈 설정
const int LASER_PIN = 14; // GPIO 14 (D14)

// 각도 범위 (각도기 값)
const int ANGLE_MIN = -90; // 좌측 최대
const int ANGLE_MAX = 90;  // 우측 최대

Servo servo;
WebServer server(80);

// BLE 관련 변수
BLEServer *pServer = NULL;
BLECharacteristic *pAngleCharacteristic = NULL;
BLECharacteristic *pStatusCharacteristic = NULL;
BLECharacteristic *pLaserCharacteristic = NULL;
bool bleDeviceConnected = false;
bool oldDeviceConnected = false;

// 현재 각도
int currentAngle = 0;

// 레이저 상태
bool laserState = false; // false: OFF, true: ON
int lastServoAngle = 90; // 마지막 서보 각도 (0-180)

// 서보 이동 제어 변수
unsigned long lastServoMoveTime = 0;
const int SERVO_MOVE_INTERVAL = 100; // ms (이동 명령 간격, 200->100으로 단축)
const int SERVO_LIMIT_MIN = 10;      // 서보 물리적 최소 각도
const int SERVO_LIMIT_MAX = 170;     // 서보 물리적 최대 각도

// 캘리브레이션 테이블 (각도 보정값)
// calibrationOffset[입력각도+90] = 보정값
int calibrationOffset[181] = {0}; // -90~90 -> 0~180 인덱스

// 부드러운 이동 설정
const bool SMOOTH_MOVE_ENABLED = true; // 부드러운 이동 활성화
const int SMOOTH_MOVE_STEP = 2;        // 한 번에 이동할 각도 (도)
const int SMOOTH_MOVE_DELAY = 15;      // 각 스텝 간 딜레이 (ms)

// 함수 프로토타입 선언
void setServoAngle(int angle);
void smoothMoveServo(int fromAngle, int toAngle);
void initCalibration();
void setLaserState(bool state);

// BLE 서버 콜백
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    bleDeviceConnected = true;
    Serial.println("BLE 클라이언트 연결됨");
  };

  void onDisconnect(BLEServer *pServer) {
    bleDeviceConnected = false;
    Serial.println("BLE 클라이언트 연결 해제됨");
  }
};

// BLE 특성 콜백 (각도 쓰기)
class AngleCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    // getValue()가 String을 반환함
    String value = pCharacteristic->getValue();

    Serial.print("BLE 데이터 수신 (길이: ");
    Serial.print(value.length());
    Serial.print("): ");

    if (value.length() > 0) {
      // String을 int로 파싱
      int angle = value.toInt();
      Serial.print("파싱된 각도: ");
      Serial.println(angle);

      // 범위 확인 후 서보 설정
      if (angle >= ANGLE_MIN && angle <= ANGLE_MAX) {
        setServoAngle(angle);

        // 상태 특성 업데이트
        String status = String(currentAngle);
        pStatusCharacteristic->setValue(status);
        pStatusCharacteristic->notify();
      } else {
        Serial.println("각도 범위 초과!");
      }
    } else {
      Serial.println("빈 데이터");
    }
  }
};

// BLE 레이저 Characteristic 콜백
class LaserCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue();

    if (value.length() > 0) {
      Serial.print("BLE 레이저 데이터 수신 (길이: ");
      Serial.print(value.length());
      Serial.print("): ");

      // "0" = OFF, "1" = ON
      if (value == "0") {
        setLaserState(false);
        Serial.println("레이저 OFF");
      } else if (value == "1") {
        setLaserState(true);
        Serial.println("레이저 ON");
      } else {
        Serial.print("알 수 없는 명령: ");
        Serial.println(value);
      }
    } else {
      Serial.println("빈 데이터");
    }
  }
};

void setup() {

  Serial.begin(115200);
  Serial.println();
  Serial.println("=== ESP32 Protractor Servo Controller ===");
  Serial.println("WiFi + BLE 지원");

  // 서보 모터 초기화
  ESP32PWM::allocateTimer(0);
  servo.setPeriodHertz(50); // 서보는 50Hz
  servo.attach(SERVO_PIN, SERVO_MIN_PULSE, SERVO_MAX_PULSE);

  // 캘리브레이션 초기화
  initCalibration();

  // 서보를 중앙 위치로 이동
  setServoAngle(0);
  Serial.println("서보 모터 초기화 완료 (중앙 위치)");

  // 레이저 모듈 초기화 (Active LOW 방식)
  pinMode(LASER_PIN, OUTPUT);
  digitalWrite(LASER_PIN, HIGH); // 초기 OFF (Active LOW: HIGH=OFF)
  Serial.println("레이저 모듈 초기화 완료 (OFF)");

  // WiFi AP 모드 시작
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false); // 라디오 성능 안정화를 위해 절전 모드 해제
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  IPAddress IP = WiFi.softAPIP();
  Serial.print("AP IP 주소: ");
  Serial.println(IP);
  Serial.print("SSID: ");
  Serial.println(AP_SSID);
  Serial.print("비밀번호: ");
  Serial.println(AP_PASSWORD);

  // BLE 초기화 (WiFi 이후에 실행)
  setupBLE();

  // 웹서버 라우트 설정
  server.on("/", handleRoot);
  server.on("/index.html", handleRoot);
  server.on("/angle", handleAngle);
  server.on("/status", handleStatus);
  server.on("/laser", handleLaser); // 레이저 제어 엔드포인트
  server.onNotFound(handleNotFound);

  // CORS 프리플라이트 요청 처리
  server.on("/angle", HTTP_OPTIONS, handleCORS);
  server.on("/status", HTTP_OPTIONS, handleCORS);
  server.on("/laser", HTTP_OPTIONS, handleCORS); // 레이저 CORS

  server.begin();
  Serial.println("웹서버 시작됨");
  Serial.println("==========================================");
}

void setupBLE() {
  Serial.println("BLE 초기화 중...");

  // BLE 장치 초기화
  BLEDevice::init(BLE_DEVICE_NAME);

  // BLE 서버 생성
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  // BLE 서비스 생성
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // 각도 특성 생성 (읽기/쓰기)
  pAngleCharacteristic = pService->createCharacteristic(
      ANGLE_CHAR_UUID, BLECharacteristic::PROPERTY_READ |
                           BLECharacteristic::PROPERTY_WRITE |
                           BLECharacteristic::PROPERTY_WRITE_NR);
  pAngleCharacteristic->setCallbacks(new AngleCallbacks());
  pAngleCharacteristic->setValue("0");

  // 상태 특성 생성 (읽기/알림)
  pStatusCharacteristic = pService->createCharacteristic(
      STATUS_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pStatusCharacteristic->addDescriptor(new BLE2902());
  pStatusCharacteristic->setValue("0");

  // 레이저 특성 생성 (쓰기)
  pLaserCharacteristic = pService->createCharacteristic(
      LASER_CHAR_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  pLaserCharacteristic->setCallbacks(new LaserCharacteristicCallbacks());
  pLaserCharacteristic->setValue("0"); // 초기 OFF

  // 서비스 시작
  pService->start();

  // 광고 시작
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setScanResponse(true);
  // 호환성을 위해 파라미터 제거
  pAdvertising->start(); // 명시적 시작 호출

  Serial.println("BLE 서버 시작됨");
  Serial.print("BLE 장치 이름: ");
  Serial.println(BLE_DEVICE_NAME);
}

void loop() {
  server.handleClient();

  // BLE 연결 상태 변화 처리
  if (!bleDeviceConnected && oldDeviceConnected) {
    delay(500);                  // 스택 정리 시간
    pServer->startAdvertising(); // 광고 재시작
    Serial.println("BLE 광고 재시작");
    oldDeviceConnected = bleDeviceConnected;
  }

  if (bleDeviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = bleDeviceConnected;
  }
}

// 각도를 서보 모터 값으로 변환 후 설정
// 입력: -90 ~ +90 (각도기 값)
// 출력: 0 ~ 180 (서보 모터 값)
void setServoAngle(int angle) {
  // 이동 간격 체크 (방해 방지)
  if (millis() - lastServoMoveTime < SERVO_MOVE_INTERVAL) {
    return;
  }
  lastServoMoveTime = millis();

  // 범위 제한 (논리적 각도)
  angle = constrain(angle, ANGLE_MIN, ANGLE_MAX);

  // 각도기 값을 서보 값으로 변환: -90 → 0, 0 → 90, +90 → 180
  int targetServoAngle = angle + 90;

  // 캘리브레이션 적용
  int calibratedAngle = targetServoAngle + calibrationOffset[targetServoAngle];

  // 서보 물리적 범위 제한 (10 ~ 170도)
  calibratedAngle =
      constrain(calibratedAngle, SERVO_LIMIT_MIN, SERVO_LIMIT_MAX);

  // 부드러운 이동 (큰 각도 변화 시)
  if (SMOOTH_MOVE_ENABLED &&
      abs(calibratedAngle - lastServoAngle) > SMOOTH_MOVE_STEP * 2) {
    smoothMoveServo(lastServoAngle, calibratedAngle);
  } else {
    // 작은 변화는 즉시 이동
    servo.write(calibratedAngle);
    lastServoAngle = calibratedAngle;

    // 도달 대기 (정밀도 향상)
    int movementDegrees = abs(calibratedAngle - lastServoAngle);
    int waitTime = movementDegrees * 3; // 1도당 3ms
    delay(min(waitTime, 100));          // 최대 100ms
  }

  currentAngle = angle;

  // BLE 특성 값 업데이트
  if (pAngleCharacteristic != NULL) {
    pAngleCharacteristic->setValue(String(currentAngle));
  }

  Serial.print("각도 설정: ");
  Serial.print(angle);
  Serial.print("° → 서보: ");
  Serial.print(calibratedAngle);
  Serial.print("° (원본: ");
  Serial.print(targetServoAngle);
  Serial.print(", 보정: ");
  Serial.print(calibrationOffset[targetServoAngle]);
  Serial.println(")");
}

// 부드러운 서보 이동 (단계별)
void smoothMoveServo(int fromAngle, int toAngle) {
  int direction = (toAngle > fromAngle) ? 1 : -1;
  int currentPos = fromAngle;

  while (abs(toAngle - currentPos) > SMOOTH_MOVE_STEP) {
    currentPos += direction * SMOOTH_MOVE_STEP;
    servo.write(currentPos);
    delay(SMOOTH_MOVE_DELAY);
  }

  // 최종 위치로 정확히 이동
  servo.write(toAngle);
  lastServoAngle = toAngle;
  delay(SMOOTH_MOVE_DELAY * 2); // 안정화 대기
}

// 캘리브레이션 초기화 (필요시 수동으로 값 설정)
void initCalibration() {
  // 기본값은 모두 0 (보정 없음)
  // 실측 후 필요한 각도만 보정값 설정
  // 예시:
  // calibrationOffset[10] = -1;  // 서보 10도에서 -1도 보정
  // calibrationOffset[100] = 1;  // 서보 100도에서 +1도 보정

  Serial.println("캘리브레이션 테이블 초기화 완료");
}

// CORS 헤더 추가
void addCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// CORS 프리플라이트 요청 처리
void handleCORS() {
  addCORSHeaders();
  server.send(204);
}

// 루트 페이지
// 루트 페이지 (Gzipped + Merged)
void handleRoot() {
  addCORSHeaders();
  server.sendHeader("Content-Encoding", "gzip");
  server.send_P(200, "text/html", (const char *)index_html_gz,
                index_html_gz_len);
}

// 각도 설정 엔드포인트
// GET /angle?value=45
void handleAngle() {
  addCORSHeaders();

  if (server.hasArg("value")) {
    int angle = server.arg("value").toInt();

    // 범위 검증
    if (angle < ANGLE_MIN || angle > ANGLE_MAX) {
      server.send(400, "application/json",
                  "{\"error\":\"Invalid angle. Range: " + String(ANGLE_MIN) +
                      " to " + String(ANGLE_MAX) + "\"}");
      return;
    }

    setServoAngle(angle);

    String response = "{\"success\":true,\"angle\":" + String(currentAngle) +
                      ",\"servoAngle\":" + String(currentAngle + 90) + "}";
    server.send(200, "application/json", response);
  } else {
    // 인자 없이 호출 시 현재 각도 반환
    String response = "{\"angle\":" + String(currentAngle) +
                      ",\"servoAngle\":" + String(currentAngle + 90) + "}";
    server.send(200, "application/json", response);
  }
}

// 상태 확인 엔드포인트 (연결 테스트용)
void handleStatus() {
  addCORSHeaders();

  String response = "{";
  response += "\"connected\":true,";
  response += "\"angle\":" + String(currentAngle) + ",";
  response += "\"servoAngle\":" + String(currentAngle + 90) + ",";
  response += "\"ssid\":\"" + String(AP_SSID) + "\",";
  response += "\"ip\":\"" + WiFi.softAPIP().toString() + "\",";
  response += "\"clients\":" + String(WiFi.softAPgetStationNum()) + ",";
  response +=
      "\"bleConnected\":" + String(bleDeviceConnected ? "true" : "false");
  response += "}";

  server.send(200, "application/json", response);
}

// 레이저 제어 함수 (Active LOW: LOW=ON, HIGH=OFF)
void setLaserState(bool state) {
  laserState = state;
  // Active LOW: ON일 때 LOW, OFF일 때 HIGH
  digitalWrite(LASER_PIN, state ? LOW : HIGH);

  Serial.print("레이저: ");
  Serial.println(state ? "ON" : "OFF");
}

// 레이저 제어 엔드포인트 (GET /laser?state=0 또는 /laser?state=1)
void handleLaser() {
  addCORSHeaders();

  if (server.hasArg("state")) {
    String stateStr = server.arg("state");
    bool state = (stateStr == "1");

    setLaserState(state);

    String jsonResponse =
        "{\"laser\":\"" + String(state ? "ON" : "OFF") + "\"}";
    server.send(200, "application/json", jsonResponse);
  } else {
    server.send(400, "application/json",
                "{\"error\":\"missing state parameter\"}");
  }
}

// 404 처리

void handleNotFound() {
  addCORSHeaders();
  server.send(404, "application/json", "{\"error\":\"Not found\"}");
}
