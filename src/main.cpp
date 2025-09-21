/*
 * ESP32 Water Quality Sensor - Test Version (No BLE)
 * 
 * This simplified version tests the TDS sensor and MPU6050 
 * without BLE complications for initial testing.
 */

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// Hardware pin definitions (compatible with most ESP32 boards)
#define TDS_PIN 1          // GPIO1 for TDS sensor (analog input)
#define LED_GREEN  2       // GPIO2 - Green LED  
#define LED_YELLOW 4       // GPIO4 - Yellow LED
#define LED_RED    5       // GPIO5 - Red LED

// TDS sensor parameters
const float VREF = 3.3;
const int ADC_RES = 4095;
const float sensorTemperature = 25.0;  // Default temperature for TDS compensation

// Water quality thresholds  
const float TDSCLEAN_THRESHOLD = 300.0;    // ppm
const float TDSDIRTY_THRESHOLD = 400.0;    // ppm  
const float TDSXTREME_THRESHOLD = 500.0;   // ppm
const float VIB_THRESHOLD = 1.5;           // m/s²

// Sensor objects
Adafruit_MPU6050 mpu;

// Water quality sensor variables
float pH = 7.0;              // Will be simulated for now
float temperature = 22.0;    // From MPU6050
float tds = 150.0;           // From TDS sensor  
float turbidity = 2.0;       // Will be simulated for now
float vibration = 0.0;       // From MPU6050 accelerometer
bool vibrationDetected = false;
String waterStatus = "unknown";

unsigned long lastReading = 0;

// Function declarations
void updateWaterQualityReadings();

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Starting ESP32 Water Quality Sensor (Test Version)...");

  // Initialize LED pins
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  
  // Turn off all LEDs initially
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);

  // Initialize MPU6050
  Wire.begin();
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip!");
    // Flash red LED to indicate error
    for(int i = 0; i < 5; i++) {
      digitalWrite(LED_RED, HIGH);
      delay(200);
      digitalWrite(LED_RED, LOW);
      delay(200);
    }
    Serial.println("Continuing without MPU6050...");
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("MPU6050 initialized successfully.");
  }

  Serial.println("System ready. Monitoring water quality...");
  
  // Green LED indicates successful initialization
  digitalWrite(LED_GREEN, HIGH);
  delay(1000);
  digitalWrite(LED_GREEN, LOW);
}

void loop() {
  // Update water quality readings every 3 seconds
  if (millis() - lastReading > 3000) {
    updateWaterQualityReadings();
    lastReading = millis();
  }

  delay(1000); // Update every second
}

// Read real sensor data
void updateWaterQualityReadings() {
  // === MPU6050 Accelerometer (Vibration Detection) ===
  sensors_event_t accel, gyro, temp;
  if (mpu.begin()) { // Check if MPU6050 is available
    mpu.getEvent(&accel, &gyro, &temp);

    float ax = accel.acceleration.x;
    float ay = accel.acceleration.y;
    float az = accel.acceleration.z;

    // Calculate vibration magnitude (remove gravity)
    vibration = sqrt(ax * ax + ay * ay + az * az) - 9.8;
    vibrationDetected = abs(vibration) > VIB_THRESHOLD;

    // Get temperature from MPU6050
    temperature = temp.temperature;
  } else {
    // Use simulated values if MPU6050 not available
    vibration = random(-50, 50) / 100.0;
    vibrationDetected = false;
    temperature = 22.0 + random(-30, 30) / 10.0;
  }

  // === TDS Sensor (Water Quality) ===
  int adcValue = analogRead(TDS_PIN);
  float voltage = (float)adcValue * VREF / ADC_RES;
  float compensation = 1.0 + 0.02 * (sensorTemperature - 25.0);
  float vComp = voltage / compensation;

  tds = (133.42 * pow(vComp, 3) - 255.86 * pow(vComp, 2) + 857.39 * vComp) * 0.5;
  
  // Constrain TDS to reasonable range
  tds = constrain(tds, 0, 2000);
  
  // === Water Quality Assessment ===
  if (tds <= TDSCLEAN_THRESHOLD && !vibrationDetected) {
    waterStatus = "clean";
  } else if (tds <= TDSDIRTY_THRESHOLD && tds > TDSCLEAN_THRESHOLD && !vibrationDetected) {
    waterStatus = "unsafe";
  } else if (tds >= TDSXTREME_THRESHOLD) {
    waterStatus = "extremely_unsafe";
  } else if (vibrationDetected) {
    waterStatus = "vibration_detected";
  }

  // === LED Status Indicators ===
  // Turn off all LEDs first
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);

  // Set LED based on water status
  if (waterStatus == "clean") {
    digitalWrite(LED_GREEN, HIGH);
  } else if (waterStatus == "unsafe") {
    digitalWrite(LED_YELLOW, HIGH);
  } else if (waterStatus == "extremely_unsafe") {
    digitalWrite(LED_RED, HIGH);
  } else if (waterStatus == "vibration_detected") {
    // Flash yellow for vibration
    digitalWrite(LED_YELLOW, (millis() / 500) % 2);
  }

  // === pH and Turbidity (simulated for now) ===
  pH = 7.0 + (sin(millis() / 15000.0) * 0.8) + (random(-10, 10) / 100.0);
  turbidity = 2.0 + (sin(millis() / 18000.0) * 1.5) + (random(-30, 30) / 100.0);
  
  pH = constrain(pH, 6.0, 9.0);
  turbidity = constrain(turbidity, 0.1, 10.0);

  // === Serial Output for Debugging ===
  Serial.print("TDS: "); Serial.print(tds); Serial.print(" ppm");
  Serial.print(" | Vibration: "); Serial.print(vibration, 2); Serial.print(" m/s²");
  Serial.print(" | Vibration Detected: "); Serial.print(vibrationDetected ? "YES" : "NO");
  Serial.print(" | Temperature: "); Serial.print(temperature, 1); Serial.print("°C");
  Serial.print(" | Water Status: "); Serial.println(waterStatus);
  
  // Show JSON that would be sent to app
  Serial.print("JSON: {");
  Serial.print("\"pH\":"); Serial.print(pH, 2); Serial.print(",");
  Serial.print("\"temperature\":"); Serial.print(temperature, 1); Serial.print(",");
  Serial.print("\"tds\":"); Serial.print(tds, 1); Serial.print(",");
  Serial.print("\"turbidity\":"); Serial.print(turbidity, 2); Serial.print(",");
  Serial.print("\"vibration\":"); Serial.print(vibration, 2); Serial.print(",");
  Serial.print("\"vibrationDetected\":"); Serial.print(vibrationDetected ? "true" : "false"); Serial.print(",");
  Serial.print("\"waterStatus\":\""); Serial.print(waterStatus); Serial.print("\"");
  Serial.println("}");
}