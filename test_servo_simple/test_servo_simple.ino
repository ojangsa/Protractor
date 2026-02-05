/*
 * 서보 모터 간단 테스트
 * 서보가 0 → 90 → 180 → 90 → 0 으로 반복 이동합니다.
 */

#include <ESP32Servo.h>

const int SERVO_PIN = 13;
Servo servo;

void setup() {
  Serial.begin(115200);
  Serial.println("=== 서보 테스트 시작 ===");

  // 서보 초기화
  ESP32PWM::allocateTimer(0);
  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN, 500, 2400);

  Serial.println("서보 연결됨 (GPIO 13)");
  delay(1000);
}

void loop() {
  Serial.println("0도로 이동...");
  servo.write(0);
  delay(2000);

  Serial.println("90도로 이동...");
  servo.write(90);
  delay(2000);

  Serial.println("180도로 이동...");
  servo.write(180);
  delay(2000);

  Serial.println("90도로 이동...");
  servo.write(90);
  delay(2000);
}
